import { AppError } from "../domain/errors.js";
import type { AppConfig } from "../config.js";
import type {
  CompareResult,
  CreateProfileResult,
  GenerateResult,
  SimilarityReport,
  ProviderConfig,
  RewriteMode,
  RewriteResult,
  VoiceProfile,
  ValidationResult
} from "../domain/types.js";
import { buildProfile } from "../analysis/profile.js";
import { compareSnapshot, snapshotText } from "../analysis/style.js";
import { logger, type Logger } from "../lib/logger.js";
import { extractPdfText, validatePdfSource } from "../lib/pdf.js";
import { createProvider } from "../providers/factory.js";
import { HeuristicProvider } from "../providers/heuristic.js";
import type { ModelProvider } from "../providers/types.js";
import { ProfileStore } from "../storage/profileStore.js";

export class VoiceService {
  constructor(
    private readonly config: AppConfig,
    private readonly store: ProfileStore,
    private readonly appLogger: Logger = logger
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
      sourcePath: params.pdfPath,
      profile: result.profile,
      guideMarkdown: result.guideMarkdown,
      extractedText: result.extractedText
    });

    this.appLogger.info("profile.create.completed", {
      voiceId,
      sourceFileName: extracted.fileName,
      extractedCharacters: result.profile.sourceStats.extractedCharacters
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
    strictness?: number;
    providerOverride?: ProviderConfig;
  }): Promise<RewriteResult> {
    const profile = await this.store.getProfile(params.voiceId);
    const similarityBefore = compareSnapshot(profile, snapshotText(params.text));
    const provider = this.resolveProvider(params.providerOverride);
    const strictness = params.strictness ?? 0.55;

    let providerUsed: RewriteResult["providerUsed"] = provider.kind as RewriteResult["providerUsed"];
    let outputText = params.text;
    let notes: string[] = [];

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

      const heuristic = new HeuristicProvider();
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
    }

    const similarityAfterEstimate = params.mode === "hint"
      ? estimateHintScore(profile, params.text, similarityBefore)
      : compareSnapshot(profile, snapshotText(outputText));

    this.appLogger.info("rewrite.completed", {
      voiceId: params.voiceId,
      mode: params.mode,
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
      providerUsed
    };
  }

  async generateText(params: {
    voiceId: string;
    prompt: string;
    length?: "short" | "medium" | "long";
    strictness?: number;
    providerOverride?: ProviderConfig;
  }): Promise<GenerateResult> {
    const profile = await this.store.getProfile(params.voiceId);
    const provider = this.resolveProvider(params.providerOverride);
    const strictness = params.strictness ?? 0.55;
    const length = params.length ?? "medium";

    let providerUsed: GenerateResult["providerUsed"] = provider.kind as GenerateResult["providerUsed"];
    let outputText = params.prompt;
    let notes: string[] = [];

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

      const heuristic = new HeuristicProvider();
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
    }

    const similarityEstimate = compareSnapshot(profile, snapshotText(outputText));

    this.appLogger.info("generate.completed", {
      voiceId: params.voiceId,
      providerUsed,
      length,
      similarityEstimate: similarityEstimate.score
    });

    return {
      profile,
      outputText,
      notes,
      providerUsed,
      similarityEstimate,
      length
    };
  }

  private resolveProvider(override?: ProviderConfig): ModelProvider {
    return createProvider(override ?? this.config.defaultProvider);
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
