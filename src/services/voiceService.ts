import { readFile } from "node:fs/promises";
import path from "node:path";

import { AppError } from "../domain/errors.js";
import type { AppConfig } from "../config.js";
import type {
  BundleSampleInput,
  CompareResult,
  CreateProfileBundleResult,
  CreateProfileResult,
  GenerateResult,
  ProfileType,
  ProviderBundleDistillationRequest,
  ProviderCritiqueResponse,
  SimilarityReport,
  ProviderConfig,
  QualityMode,
  RewriteMode,
  RewriteResult,
  VoiceProfile,
  ValidationResult
} from "../domain/types.js";
import type { BundleAnalysis, NormalizedSample } from "../analysis/bundle.js";
import { contentKindFor, isBundleProfileType } from "../analysis/contentKind.js";
import { analyzeEmailBundle, normalizeEmailSample } from "../analysis/email.js";
import { analyzeFictionBundle, normalizeFictionSample } from "../analysis/fiction.js";
import { buildBundleProfile, buildProfile } from "../analysis/profile.js";
import { compareSnapshot, snapshotText, summarizeStyle } from "../analysis/style.js";
import { logger, type Logger } from "../lib/logger.js";
import { estimateTokens } from "../lib/text.js";
import { extractPdfText, validatePdfSource } from "../lib/pdf.js";
import { createProvider } from "../providers/factory.js";
import { HeuristicProvider } from "../providers/heuristic.js";
import type { ModelProvider } from "../providers/types.js";
import { ProfileStore } from "../storage/profileStore.js";

type ProviderFactory = (config: ProviderConfig) => ModelProvider;

export class VoiceService {
  constructor(
    private readonly config: AppConfig,
    private readonly store: ProfileStore,
    private readonly appLogger: Logger = logger,
    private readonly providerFactory: ProviderFactory = createProvider
  ) {}

  async validateSource(pdfPath: string): Promise<ValidationResult> {
    return validatePdfSource(pdfPath);
  }

  async createProfile(params: {
    voiceName: string;
    pdfPath: string;
    description?: string;
    providerOverride?: ProviderConfig;
  }): Promise<CreateProfileResult> {
    await this.store.ensureReady();
    this.appLogger.info("profile.create.started", { voiceName: params.voiceName, pdfPath: params.pdfPath });

    const extracted = await extractPdfText(params.pdfPath);
    if (!extracted.text.trim()) {
      throw new AppError(
        "No extractable text was found in the PDF. The MVP only supports text-based PDFs.",
        "UNSUPPORTED_SOURCE",
        400
      );
    }

    const voiceId = slugify(`${params.voiceName}-${Date.now()}`);
    const result = buildProfile({
      voiceId,
      voiceName: params.voiceName,
      description: params.description,
      extractedText: extracted.text,
      pageCount: extracted.pageCount,
      sourceFileName: extracted.fileName,
      maxChars: this.config.sourceLimits.maxChars,
      maxTokens: this.config.sourceLimits.maxTokens
    });

    await this.store.saveProfile({
      voiceId,
      profile: result.profile,
      guideMarkdown: result.guideMarkdown,
      extractedText: result.extractedText,
      sourceFile: {
        sourcePath: params.pdfPath,
        destinationName: "source.pdf"
      }
    });

    this.appLogger.info("profile.create.completed", {
      voiceId,
      sourceFileName: extracted.fileName,
      extractedCharacters: result.profile.sourceStats.extractedCharacters
    });

    return result;
  }

  async createProfileBundle(params: {
    voiceName: string;
    description?: string;
    profileType: ProfileType;
    samples: BundleSampleInput[];
    providerOverride?: ProviderConfig;
  }): Promise<CreateProfileBundleResult> {
    await this.store.ensureReady();
    this.appLogger.info("profile.bundle_create.started", {
      voiceName: params.voiceName,
      profileType: params.profileType,
      sampleCount: params.samples.length
    });

    if (!isBundleProfileType(params.profileType)) {
      throw new AppError(
        "The bundle flow supports the 'email-formal' and 'fiction-prose' profile types.",
        "UNSUPPORTED_PROFILE_TYPE",
        400
      );
    }

    if (params.samples.length < 3) {
      throw new AppError(
        "Create at least 3 samples for a bundle so the profile can separate stable voice from topic noise.",
        "INSUFFICIENT_SAMPLES",
        400
      );
    }

    const sampleLimits = this.getBundleSampleLimits(params.profileType);
    const normalizedSamples = [];
    for (const sample of params.samples) {
      normalizedSamples.push(await this.loadBundleSample(sample, sampleLimits, params.profileType));
    }

    const bundle = this.analyzeBundle(params.profileType, normalizedSamples);
    if (
      bundle.provenance.combinedCharacters > this.config.sourceLimits.maxChars ||
      bundle.provenance.combinedEstimatedTokens > this.config.sourceLimits.maxTokens
    ) {
      throw new AppError(
        `The combined bundle is too large for the MVP limits (${bundle.provenance.combinedCharacters} chars, ${bundle.provenance.combinedEstimatedTokens} estimated tokens). Shorten the samples or split them into a separate voice.`,
        "SOURCE_TOO_LARGE",
        400
      );
    }

    const heuristicSnapshot = snapshotText(bundle.combinedText);
    const distillationRequest: ProviderBundleDistillationRequest = {
      voiceName: params.voiceName,
      description: params.description,
      profileType: params.profileType,
      voiceFocus: contentKindFor(params.profileType).artifactNoun,
      normalizedSamples: bundle.normalizedSamples.map((sample) => ({
        label: sample.label,
        normalizedText: sample.normalizedText,
        extractedCharacters: sample.provenance.extractedCharacters,
        normalizedCharacters: sample.provenance.normalizedCharacters
      })),
      combinedText: bundle.combinedText,
      stableLexicalMarkers: bundle.stableLexicalMarkers,
      topicSpecificLexicalMarkers: bundle.topicSpecificLexicalMarkers,
      repeatedPhrases: bundle.repeatedPhrases,
      heuristicSummary: summarizeStyle(heuristicSnapshot),
      heuristicRhetoricalDevices: heuristicSnapshot.rhetoricalDevices.slice(0, 6),
      heuristicAntiPatterns: buildHeuristicAntiPatterns(bundle.stableLexicalMarkers, bundle.topicSpecificLexicalMarkers),
      narrativeMetrics: bundle.narrativeMetrics
    };

    const provider = this.resolveProvider(params.providerOverride);
    const heuristic = new HeuristicProvider();
    const warnings = [...bundle.warnings];
    let distillation = await heuristic.distillBundle(distillationRequest);

    if (this.isModelBackedProvider(provider)) {
      try {
        distillation = await provider.distillBundle(distillationRequest);
      } catch (error) {
        warnings.push(`Model distillation fell back to heuristics after ${provider.kind} failed.`);
        this.appLogger.warn("profile.bundle_create.provider_failed", {
          provider: provider.kind,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const voiceId = slugify(`${params.voiceName}-${Date.now()}`);
    const result = buildBundleProfile({
      voiceId,
      voiceName: params.voiceName,
      description: params.description,
      profileType: params.profileType,
      combinedText: bundle.combinedText,
      sourceFileName: "bundle-samples",
      sampleCount: bundle.provenance.totalSamples,
      maxChars: this.config.sourceLimits.maxChars,
      maxTokens: this.config.sourceLimits.maxTokens,
      summary: distillation.summary,
      warnings,
      confidenceNotes: distillation.confidenceNotes,
      provenance: bundle.provenance,
      lexicalMarkers: [
        ...distillation.stableLexicalMarkers,
        ...bundle.stableLexicalMarkers,
        ...bundle.repeatedPhrases.map((phrase) => phrase.split(/\s+/)[0] ?? phrase)
      ].filter((value, index, values) => value && values.indexOf(value) === index).slice(0, 16),
      stableLexicalMarkers: distillation.stableLexicalMarkers.length
        ? distillation.stableLexicalMarkers
        : bundle.stableLexicalMarkers,
      topicSpecificLexicalMarkers: distillation.topicSpecificLexicalMarkers.length
        ? distillation.topicSpecificLexicalMarkers
        : bundle.topicSpecificLexicalMarkers,
      rhetoricalDevices: distillation.rhetoricalDevices,
      antiPatterns: distillation.antiPatterns,
      preferredOpenings: distillation.preferredOpenings,
      preferredClosings: distillation.preferredClosings,
      voiceRules: distillation.voiceRules,
      narrativeMetrics: bundle.narrativeMetrics
    });

    await this.store.saveProfile({
      voiceId,
      profile: result.profile,
      guideMarkdown: result.guideMarkdown,
      extractedText: result.extractedText,
      files: [
        {
          relativePath: "bundle-sources.json",
          content: JSON.stringify(
            {
              profileType: params.profileType,
              description: params.description,
              provenance: bundle.provenance,
              repeatedPhrases: bundle.repeatedPhrases,
              normalizedSamples: bundle.normalizedSamples.map((sample) => ({
                label: sample.label,
                sourceKind: sample.sourceKind,
                sourceType: sample.sourceType,
                originalPath: sample.originalPath,
                notes: sample.notes,
                normalizedText: sample.normalizedText
              }))
            },
            null,
            2
          )
        },
        ...bundle.normalizedSamples.map((sample, index) => ({
          relativePath: path.join("samples", `${String(index + 1).padStart(2, "0")}-${slugify(sample.label)}.txt`),
          content: sample.normalizedText
        }))
      ]
    });

    this.appLogger.info("profile.bundle_create.completed", {
      voiceId,
      sampleCount: bundle.provenance.totalSamples,
      extractedCharacters: result.profile.sourceStats.extractedCharacters,
      providerUsed: this.isModelBackedProvider(provider) ? provider.kind : "heuristic"
    });

    return result;
  }

  async listProfiles() {
    return this.store.listProfiles();
  }

  async getProfile(voiceId: string) {
    return this.store.getProfile(voiceId);
  }

  async getProfileAssets(voiceId: string) {
    return this.store.getProfileAssets(voiceId);
  }

  async deleteProfile(voiceId: string): Promise<void> {
    await this.store.deleteProfile(voiceId);
    this.appLogger.info("profile.delete.completed", { voiceId });
  }

  async compareText(params: { voiceId: string; text: string }): Promise<CompareResult> {
    const profile = await this.store.getProfile(params.voiceId);
    const snapshot = snapshotText(params.text);
    const similarity = compareSnapshot(profile, snapshot);

    this.appLogger.info("profile.compare.completed", {
      voiceId: params.voiceId,
      similarity: similarity.score
    });

    return { profile, snapshot, similarity };
  }

  async rewriteText(params: {
    voiceId: string;
    text: string;
    mode: RewriteMode;
    qualityMode?: QualityMode;
    strictness?: number;
    providerOverride?: ProviderConfig;
  }): Promise<RewriteResult> {
    const profile = await this.store.getProfile(params.voiceId);
    const similarityBefore = compareSnapshot(profile, snapshotText(params.text));
    const provider = this.resolveProvider(params.providerOverride);
    const strictness = params.strictness ?? 0.55;
    const preferredQualityMode = this.resolveQualityMode(provider, params.qualityMode);
    const heuristic = new HeuristicProvider();

    let providerUsed: RewriteResult["providerUsed"] = provider.kind as RewriteResult["providerUsed"];
    let outputText = params.text;
    let notes: string[] = [];
    let qualityMode: QualityMode = preferredQualityMode;
    let critique: ProviderCritiqueResponse | undefined;

    if (preferredQualityMode === "reviewed" && this.isModelBackedProvider(provider)) {
      let candidateText = "";
      try {
        const candidate = await provider.rewrite({
          profile,
          inputText: params.text,
          mode: params.mode,
          strictness,
          report: similarityBefore
        });
        candidateText = candidate.outputText;
        critique = await provider.critique({
          profile,
          taskType: "rewrite",
          sourceText: params.text,
          candidateText
        });
        const revision = await provider.revise({
          profile,
          taskType: "rewrite",
          sourceText: params.text,
          candidateText,
          critique
        });

        outputText = revision.outputText;
        notes = [...candidate.notes, ...revision.notes, "Reviewed mode applied one critique-and-revise pass."];
      } catch (error) {
        this.appLogger.warn("rewrite.reviewed_failed", {
          voiceId: params.voiceId,
          provider: provider.kind,
          message: error instanceof Error ? error.message : String(error)
        });

        if (candidateText) {
          outputText = candidateText;
          notes = ["Reviewed mode degraded to a single draft because the critique or revision pass failed."];
          qualityMode = "fast";
        } else {
          qualityMode = "fast";
        }
      }
    }

    if (!notes.length) {
      try {
        const response = await provider.rewrite({
          profile,
          inputText: params.text,
          mode: params.mode,
          strictness,
          report: similarityBefore
        });
        outputText = response.outputText;
        notes = response.notes;
      } catch (error) {
        this.appLogger.warn("rewrite.provider_failed", {
          voiceId: params.voiceId,
          provider: provider.kind,
          message: error instanceof Error ? error.message : String(error)
        });

        const response = await heuristic.rewrite({
          profile,
          inputText: params.text,
          mode: params.mode,
          strictness,
          report: similarityBefore
        });
        outputText = response.outputText;
        notes = [
          ...(response.notes ?? []),
          `Provider fallback triggered after ${provider.kind} failed.`
        ];
        providerUsed = "heuristic";
        qualityMode = "fast";
      }
    }

    const similarityAfterEstimate = params.mode === "hint"
      ? estimateHintScore(profile, params.text, similarityBefore)
      : compareSnapshot(profile, snapshotText(outputText));

    this.appLogger.info("rewrite.completed", {
      voiceId: params.voiceId,
      mode: params.mode,
      qualityMode,
      providerUsed,
      similarityBefore: similarityBefore.score,
      similarityAfter: similarityAfterEstimate.score
    });

    return {
      profile,
      similarityBefore,
      similarityAfterEstimate,
      outputText,
      notes,
      mode: params.mode,
      qualityMode,
      critique,
      providerUsed
    };
  }

  async generateText(params: {
    voiceId: string;
    prompt: string;
    length?: "short" | "medium" | "long";
    qualityMode?: QualityMode;
    strictness?: number;
    providerOverride?: ProviderConfig;
  }): Promise<GenerateResult> {
    const profile = await this.store.getProfile(params.voiceId);
    const provider = this.resolveProvider(params.providerOverride);
    const strictness = params.strictness ?? 0.55;
    const length = params.length ?? "medium";
    const preferredQualityMode = this.resolveQualityMode(provider, params.qualityMode);
    const heuristic = new HeuristicProvider();

    let providerUsed: GenerateResult["providerUsed"] = provider.kind as GenerateResult["providerUsed"];
    let outputText = params.prompt;
    let notes: string[] = [];
    let qualityMode: QualityMode = preferredQualityMode;
    let critique: ProviderCritiqueResponse | undefined;

    if (preferredQualityMode === "reviewed" && this.isModelBackedProvider(provider)) {
      let candidateText = "";
      try {
        const candidate = await provider.generate({
          profile,
          prompt: params.prompt,
          strictness,
          length
        });
        candidateText = candidate.outputText;
        critique = await provider.critique({
          profile,
          taskType: "generate",
          prompt: params.prompt,
          candidateText
        });
        const revision = await provider.revise({
          profile,
          taskType: "generate",
          prompt: params.prompt,
          candidateText,
          critique
        });

        outputText = revision.outputText;
        notes = [...candidate.notes, ...revision.notes, "Reviewed mode applied one critique-and-revise pass."];
      } catch (error) {
        this.appLogger.warn("generate.reviewed_failed", {
          voiceId: params.voiceId,
          provider: provider.kind,
          message: error instanceof Error ? error.message : String(error)
        });

        if (candidateText) {
          outputText = candidateText;
          notes = ["Reviewed mode degraded to a single draft because the critique or revision pass failed."];
          qualityMode = "fast";
        } else {
          qualityMode = "fast";
        }
      }
    }

    if (!notes.length) {
      try {
        const response = await provider.generate({
          profile,
          prompt: params.prompt,
          strictness,
          length
        });
        outputText = response.outputText;
        notes = response.notes;
      } catch (error) {
        this.appLogger.warn("generate.provider_failed", {
          voiceId: params.voiceId,
          provider: provider.kind,
          message: error instanceof Error ? error.message : String(error)
        });

        const response = await heuristic.generate({
          profile,
          prompt: params.prompt,
          strictness,
          length
        });
        outputText = response.outputText;
        notes = [
          ...(response.notes ?? []),
          `Provider fallback triggered after ${provider.kind} failed.`
        ];
        providerUsed = "heuristic";
        qualityMode = "fast";
      }
    }

    const similarityEstimate = compareSnapshot(profile, snapshotText(outputText));

    this.appLogger.info("generate.completed", {
      voiceId: params.voiceId,
      providerUsed,
      length,
      qualityMode,
      similarityEstimate: similarityEstimate.score
    });

    return {
      profile,
      outputText,
      notes,
      providerUsed,
      similarityEstimate,
      length,
      qualityMode,
      critique
    };
  }

  private resolveProvider(override?: ProviderConfig): ModelProvider {
    return this.providerFactory(override ?? this.config.defaultProvider);
  }

  private isModelBackedProvider(provider: ModelProvider): boolean {
    return provider.kind !== "heuristic";
  }

  private resolveQualityMode(provider: ModelProvider, requested?: QualityMode): QualityMode {
    if (requested) {
      return requested === "reviewed" && !this.isModelBackedProvider(provider) ? "fast" : requested;
    }

    return this.isModelBackedProvider(provider) ? "reviewed" : "fast";
  }

  private analyzeBundle(profileType: ProfileType, samples: NormalizedSample[]): BundleAnalysis {
    return profileType === "fiction-prose" ? analyzeFictionBundle(samples) : analyzeEmailBundle(samples);
  }

  private getBundleSampleLimits(profileType: ProfileType) {
    // Fiction excerpts are far longer than email bodies, so they get a roomier per-sample ceiling.
    if (profileType === "fiction-prose") {
      return {
        maxChars: Math.min(this.config.sourceLimits.maxChars, 60000),
        maxTokens: Math.min(this.config.sourceLimits.maxTokens, 15000)
      };
    }

    return {
      maxChars: Math.min(this.config.sourceLimits.maxChars, 24000),
      maxTokens: Math.min(this.config.sourceLimits.maxTokens, 6000)
    };
  }

  private async loadBundleSample(
    sample: BundleSampleInput,
    sampleLimits: { maxChars: number; maxTokens: number },
    profileType: ProfileType
  ) {
    const label = sample.label.trim();
    if (!label) {
      throw new AppError("Every bundle sample requires a non-empty label.", "INVALID_SAMPLE", 400);
    }

    if ((sample.text ? 1 : 0) + (sample.path ? 1 : 0) !== 1) {
      throw new AppError(
        `Sample '${label}' must provide exactly one of 'text' or 'path'.`,
        "INVALID_SAMPLE",
        400
      );
    }

    let extractedText = "";
    let sourceKind: "pdf" | "text" = "text";
    let sourceType: "path" | "text" = sample.path ? "path" : "text";
    let originalPath: string | undefined;

    if (sample.path) {
      originalPath = path.resolve(sample.path);
      if (path.extname(sample.path).toLowerCase() === ".pdf") {
        const extracted = await extractPdfText(sample.path);
        extractedText = extracted.text;
        sourceKind = "pdf";
      } else {
        extractedText = await readFile(sample.path, "utf8");
      }
    } else {
      extractedText = sample.text ?? "";
    }

    if (!extractedText.trim()) {
      throw new AppError(`Sample '${label}' is empty after loading.`, "INVALID_SAMPLE", 400);
    }

    const normalizeSample = profileType === "fiction-prose" ? normalizeFictionSample : normalizeEmailSample;
    const normalized = normalizeSample({
      label,
      sourceKind,
      sourceType,
      originalPath,
      extractedText
    });

    if (!normalized.normalizedText.trim()) {
      throw new AppError(
        `Sample '${label}' does not leave enough body text after normalization. Add a fuller sample without relying on structural scaffolding such as headings, greetings, or signature blocks.`,
        "INVALID_SAMPLE",
        400
      );
    }

    if (
      normalized.provenance.normalizedCharacters > sampleLimits.maxChars ||
      normalized.provenance.estimatedTokens > sampleLimits.maxTokens
    ) {
      const excerptNoun = profileType === "fiction-prose" ? "prose excerpt" : "email excerpt";
      throw new AppError(
        `Sample '${label}' is too large for one bundle item (${normalized.provenance.normalizedCharacters} chars, ${normalized.provenance.estimatedTokens} estimated tokens). Split it into a shorter ${excerptNoun}.`,
        "SOURCE_TOO_LARGE",
        400
      );
    }

    if (estimateTokens(normalized.normalizedText) < 30) {
      const bodyNoun = profileType === "fiction-prose" ? "prose passage" : "email body";
      throw new AppError(
        `Sample '${label}' is too small after normalization to contribute a reliable voice signal. Provide a fuller ${bodyNoun}.`,
        "INVALID_SAMPLE",
        400
      );
    }

    return normalized;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function estimateHintScore(profile: VoiceProfile, text: string, base: SimilarityReport) {
  const snapshot = snapshotText(text);
  const improved = {
    ...snapshot,
    lexicalMarkers: [...new Set([...snapshot.lexicalMarkers, ...profile.lexicalMarkers.slice(0, 3)])]
  };
  const report = compareSnapshot(profile, improved);
  return {
    ...report,
    score: Math.max(base.score, Math.min(100, report.score))
  };
}

function buildHeuristicAntiPatterns(stableMarkers: string[], topicSpecificMarkers: string[]) {
  const antiPatterns = [
    "Do not drift into generic assistant phrasing or over-explain obvious points.",
    "Do not let greetings, signatures, or routing metadata dominate the voice."
  ];

  if (topicSpecificMarkers.length) {
    antiPatterns.push(
      `Do not overfit to topic-specific nouns such as ${topicSpecificMarkers.slice(0, 4).join(", ")} when the task changes.`
    );
  }

  if (stableMarkers.length) {
    antiPatterns.push(
      `Do not ignore stable voice markers like ${stableMarkers.slice(0, 4).join(", ")} when they fit naturally.`
    );
  }

  return antiPatterns;
}
