import type { CreateProfileResult, TextStyleSnapshot, VoiceProfile } from "../domain/types.js";
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

function buildPromptPack(profile: Omit<VoiceProfile, "compactPromptPack">) {
  return {
    systemSummary: `Write in a ${profile.summary}. Preserve meaning while matching cadence, diction, and paragraph flow.`,
    voiceRules: [
      `Match ${profile.summary}.`,
      `Prefer lexical markers like: ${profile.lexicalMarkers.slice(0, 6).join(", ")}.`,
      `Keep sentence rhythm near ${profile.structurePatterns.averageSentenceWords} words on average.`,
      `Preserve paragraph density near ${profile.structurePatterns.averageParagraphSentences} sentences per paragraph.`,
      ...profile.rhetoricalDevices.slice(0, 2).map((device) => `Use ${device} when it fits naturally.`)
    ],
    antiPatterns: profile.antiPatterns,
    lexicalMarkers: profile.lexicalMarkers,
    revisionChecklist: [
      "Preserve the original meaning and factual claims.",
      "Prefer the source voice's cadence over generic assistant phrasing.",
      "Only intensify style when the source sample clearly supports it.",
      "Keep the output readable and professionally polished."
    ]
  };
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
  const normalized = normalizeWhitespace(params.extractedText);
  if (!normalized) {
    throw new AppError(
      "No extractable text was found in the PDF. The MVP only supports text-based PDFs.",
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
  const warnings: string[] = [];
  if (normalized.length < 2500) {
    warnings.push("Short sample detected. The guide may underfit the author's broader voice.");
  }
  if (snapshot.lexicalMarkers.length < 6) {
    warnings.push("Limited lexical signal detected. Add a richer sample for stronger marker extraction.");
  }

  const baseProfile: Omit<VoiceProfile, "compactPromptPack"> = {
    voiceId: params.voiceId,
    voiceName: params.voiceName,
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
    summary: summarizeStyle(snapshot),
    warnings,
    styleDimensions: snapshot.styleDimensions,
    structurePatterns: snapshot.structurePatterns,
    lexicalMarkers: snapshot.lexicalMarkers,
    rhetoricalDevices: rhetoricalDevices(snapshot),
    antiPatterns: antiPatterns(snapshot),
    preferredOpenings: topSentenceOpeners(normalized),
    preferredClosings: topSentenceClosings(normalized)
  };

  const profile: VoiceProfile = {
    ...baseProfile,
    compactPromptPack: buildPromptPack(baseProfile)
  };

  const guideMarkdown = [
    `# ${profile.voiceName}`,
    "",
    `Summary: ${profile.summary}`,
    "",
    "## Voice rules",
    ...profile.compactPromptPack.voiceRules.map((rule) => `- ${rule}`),
    "",
    "## Lexical markers",
    `- ${profile.lexicalMarkers.join(", ")}`,
    "",
    "## Anti-patterns",
    ...profile.antiPatterns.map((rule) => `- ${rule}`),
    "",
    "## Rhetorical devices",
    `- ${profile.rhetoricalDevices.join(", ") || "None strongly dominant"}`,
    "",
    "## Warnings",
    ...(profile.warnings.length ? profile.warnings.map((warning) => `- ${warning}`) : ["- None"])
  ].join("\n");

  return {
    profile,
    guideMarkdown,
    extractedText: normalized,
    sourceFileName: params.sourceFileName
  };
}
