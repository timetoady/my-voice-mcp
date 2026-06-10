import type {
  BundleProvenance,
  CreateProfileBundleResult,
  CreateProfileResult,
  ProfileType,
  TextStyleSnapshot,
  VoiceProfile
} from "../domain/types.js";
import { AppError } from "../domain/errors.js";
import { sha256 } from "../lib/hash.js";
import {
  estimateTokens,
  normalizeWhitespace,
  sampleChunks,
  topSentenceClosings,
  topSentenceOpeners
} from "../lib/text.js";
import { snapshotText, summarizeStyle } from "./style.js";

function rhetoricalDevices(snapshot: TextStyleSnapshot): string[] {
  return snapshot.rhetoricalDevices.slice(0, 6);
}

function antiPatterns(snapshot: TextStyleSnapshot): string[] {
  const warnings: string[] = [];
  if (snapshot.styleDimensions.lexicalDiversity < 0.25) {
    warnings.push("Avoid repetitive filler phrasing and repeated sentence openings.");
  }
  if (snapshot.styleDimensions.punctuationExpressiveness > 0.75) {
    warnings.push("Do not over-amplify punctuation beyond the source sample.");
  }
  if (snapshot.structurePatterns.exclamationRate > 0.2) {
    warnings.push("Do not flatten the lively punctuation pattern into a monotone delivery.");
  }

  if (!warnings.length) {
    warnings.push("Avoid generic boilerplate that removes the source voice's distinct cadence.");
  }

  return warnings;
}

function buildPromptPack(profile: Omit<VoiceProfile, "compactPromptPack">, customVoiceRules?: string[]) {
  const lexicalMarkers = profile.stableLexicalMarkers?.length
    ? profile.stableLexicalMarkers
    : profile.lexicalMarkers;

  const voiceRules = customVoiceRules?.length
    ? customVoiceRules
    : [
        `Match ${profile.summary}.`,
        `Prefer lexical markers like: ${lexicalMarkers.slice(0, 6).join(", ")}.`,
        `Keep sentence rhythm near ${profile.structurePatterns.averageSentenceWords} words on average.`,
        `Preserve paragraph density near ${profile.structurePatterns.averageParagraphSentences} sentences per paragraph.`,
        ...profile.rhetoricalDevices.slice(0, 2).map((device) => `Use ${device} when it fits naturally.`)
      ];

  return {
    systemSummary: `Write in a ${profile.summary}. Preserve meaning while matching cadence, diction, and paragraph flow.`,
    voiceRules,
    antiPatterns: profile.antiPatterns,
    lexicalMarkers,
    revisionChecklist: [
      "Preserve the original meaning and factual claims.",
      "Prefer the source voice's cadence over generic assistant phrasing.",
      "Only intensify style when the source sample clearly supports it.",
      "Keep the output readable and professionally polished."
    ]
  };
}

function buildGuideMarkdown(profile: VoiceProfile): string {
  return [
    `# ${profile.voiceName}`,
    "",
    `Summary: ${profile.summary}`,
    "",
    "## Voice rules",
    ...profile.compactPromptPack.voiceRules.map((rule) => `- ${rule}`),
    "",
    "## Stable lexical markers",
    `- ${(profile.stableLexicalMarkers?.length ? profile.stableLexicalMarkers : profile.lexicalMarkers).join(", ")}`,
    "",
    "## Topic-specific lexical markers",
    `- ${(profile.topicSpecificLexicalMarkers?.length ? profile.topicSpecificLexicalMarkers.join(", ") : "None identified")}`,
    "",
    "## Anti-patterns",
    ...profile.antiPatterns.map((rule) => `- ${rule}`),
    "",
    "## Rhetorical devices",
    `- ${profile.rhetoricalDevices.join(", ") || "None strongly dominant"}`,
    "",
    "## Confidence notes",
    ...(profile.confidenceNotes?.length ? profile.confidenceNotes.map((note) => `- ${note}`) : ["- None"]),
    "",
    "## Warnings",
    ...(profile.warnings.length ? profile.warnings.map((warning) => `- ${warning}`) : ["- None"])
  ].join("\n");
}

function buildComposedProfile(params: {
  voiceId: string;
  voiceName: string;
  description?: string;
  normalizedText: string;
  pageCount: number;
  sourceFileName: string;
  maxChars: number;
  maxTokens: number;
  profileType?: ProfileType;
  summary?: string;
  warnings?: string[];
  confidenceNotes?: string[];
  provenance?: BundleProvenance;
  lexicalMarkers?: string[];
  stableLexicalMarkers?: string[];
  topicSpecificLexicalMarkers?: string[];
  rhetoricalDevices?: string[];
  antiPatterns?: string[];
  preferredOpenings?: string[];
  preferredClosings?: string[];
  voiceRules?: string[];
}): { profile: VoiceProfile; guideMarkdown: string; extractedText: string } {
  const normalized = normalizeWhitespace(params.normalizedText);
  if (!normalized) {
    throw new AppError(
      "No extractable text was found in the source. The MVP only supports text-based content.",
      "EMPTY_EXTRACTED_TEXT",
      400
    );
  }

  const estimatedTokens = estimateTokens(normalized);
  if (normalized.length > params.maxChars || estimatedTokens > params.maxTokens) {
    throw new AppError(
      `The extracted text is too large for the MVP limits (${normalized.length} chars, ${estimatedTokens} estimated tokens). Split the sample or use a shorter representative source.`,
      "SOURCE_TOO_LARGE",
      400
    );
  }

  const snapshot = snapshotText(normalized);
  const chunks = sampleChunks(normalized, 1600, 6);
  const warnings = [...(params.warnings ?? [])];
  if (normalized.length < 2500) {
    warnings.push("Short sample detected. The guide may underfit the author's broader voice.");
  }
  const derivedMarkers = params.lexicalMarkers?.length ? params.lexicalMarkers : snapshot.lexicalMarkers;
  if (derivedMarkers.length < 6) {
    warnings.push("Limited lexical signal detected. Add a richer sample for stronger marker extraction.");
  }

  const baseProfile: Omit<VoiceProfile, "compactPromptPack"> = {
    voiceId: params.voiceId,
    voiceName: params.voiceName,
    profileType: params.profileType ?? "generic",
    description: params.description,
    createdAt: new Date().toISOString(),
    sourceStats: {
      fileName: params.sourceFileName,
      pageCount: params.pageCount,
      extractedCharacters: normalized.length,
      estimatedTokens,
      chunkCount: chunks.length,
      sampleCount: Math.min(6, chunks.length),
      sha256: sha256(normalized)
    },
    summary: params.summary ?? summarizeStyle(snapshot),
    warnings: dedupeStrings(warnings),
    confidenceNotes: dedupeStrings(params.confidenceNotes ?? []),
    provenance: params.provenance,
    styleDimensions: snapshot.styleDimensions,
    structurePatterns: snapshot.structurePatterns,
    lexicalMarkers: derivedMarkers,
    stableLexicalMarkers: params.stableLexicalMarkers,
    topicSpecificLexicalMarkers: params.topicSpecificLexicalMarkers,
    rhetoricalDevices: params.rhetoricalDevices?.length ? params.rhetoricalDevices : rhetoricalDevices(snapshot),
    antiPatterns: params.antiPatterns?.length ? params.antiPatterns : antiPatterns(snapshot),
    preferredOpenings: params.preferredOpenings?.length ? params.preferredOpenings : topSentenceOpeners(normalized),
    preferredClosings: params.preferredClosings?.length ? params.preferredClosings : topSentenceClosings(normalized)
  };

  const profile: VoiceProfile = {
    ...baseProfile,
    compactPromptPack: buildPromptPack(baseProfile, params.voiceRules)
  };

  return {
    profile,
    guideMarkdown: buildGuideMarkdown(profile),
    extractedText: normalized
  };
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function buildProfile(params: {
  voiceId: string;
  voiceName: string;
  description?: string;
  extractedText: string;
  pageCount: number;
  sourceFileName: string;
  maxChars: number;
  maxTokens: number;
}): CreateProfileResult {
  const result = buildComposedProfile({
    voiceId: params.voiceId,
    voiceName: params.voiceName,
    description: params.description,
    normalizedText: params.extractedText,
    pageCount: params.pageCount,
    sourceFileName: params.sourceFileName,
    maxChars: params.maxChars,
    maxTokens: params.maxTokens
  });

  return {
    ...result,
    sourceFileName: params.sourceFileName
  };
}

export function buildBundleProfile(params: {
  voiceId: string;
  voiceName: string;
  description?: string;
  profileType: "email-formal";
  combinedText: string;
  sourceFileName: string;
  sampleCount: number;
  maxChars: number;
  maxTokens: number;
  summary: string;
  warnings: string[];
  confidenceNotes: string[];
  provenance: BundleProvenance;
  lexicalMarkers: string[];
  stableLexicalMarkers: string[];
  topicSpecificLexicalMarkers: string[];
  rhetoricalDevices: string[];
  antiPatterns: string[];
  preferredOpenings: string[];
  preferredClosings: string[];
  voiceRules: string[];
}): CreateProfileBundleResult {
  const result = buildComposedProfile({
    voiceId: params.voiceId,
    voiceName: params.voiceName,
    description: params.description,
    normalizedText: params.combinedText,
    pageCount: params.sampleCount,
    sourceFileName: params.sourceFileName,
    maxChars: params.maxChars,
    maxTokens: params.maxTokens,
    profileType: params.profileType,
    summary: params.summary,
    warnings: params.warnings,
    confidenceNotes: params.confidenceNotes,
    provenance: params.provenance,
    lexicalMarkers: params.lexicalMarkers,
    stableLexicalMarkers: params.stableLexicalMarkers,
    topicSpecificLexicalMarkers: params.topicSpecificLexicalMarkers,
    rhetoricalDevices: params.rhetoricalDevices,
    antiPatterns: params.antiPatterns,
    preferredOpenings: params.preferredOpenings,
    preferredClosings: params.preferredClosings,
    voiceRules: params.voiceRules
  });

  return {
    ...result,
    provenance: params.provenance
  };
}
