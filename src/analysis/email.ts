import { sha256 } from "../lib/hash.js";
import { estimateTokens, normalizeWhitespace } from "../lib/text.js";
import type { BundleProvenance, SourceProvenance } from "../domain/types.js";
import type { BundleAnalysis, NormalizedSample } from "./bundle.js";
import { extractRepeatedPhrases, splitStableAndTopicMarkers } from "./markers.js";

const REPLY_HEADERS = [
  /^from:\s/i,
  /^to:\s/i,
  /^cc:\s/i,
  /^bcc:\s/i,
  /^subject:\s/i,
  /^sent:\s/i,
  /^on .+ wrote:\s*$/i
];

const GREETING_LINE = /^(hi|hello|hey|dear)\b/i;
const SIGNOFF_LINE = /^(thanks!?|thank you!?|best|regards|sincerely|many thanks|appreciate it)\b/i;
const ONE_OFF_METADATA = /^(sent from my|external email|confidentiality notice|warning:)/i;

export function normalizeEmailSample(params: {
  label: string;
  sourceKind: "pdf" | "text";
  sourceType: "path" | "text";
  originalPath?: string;
  extractedText: string;
}): NormalizedSample {
  const normalized = normalizeWhitespace(params.extractedText);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !REPLY_HEADERS.some((pattern) => pattern.test(line)))
    .filter((line) => !ONE_OFF_METADATA.test(line));

  const notes: string[] = [];

  while (lines.length && GREETING_LINE.test(lines[0])) {
    notes.push("Removed greeting line.");
    lines.shift();
  }

  while (lines.length && !lines[lines.length - 1]) {
    lines.pop();
  }

  const signoffIndex = findSignoffIndex(lines);
  if (signoffIndex >= 0) {
    notes.push("Removed signoff and signature block.");
    lines.splice(signoffIndex);
  }

  const filteredParagraphs = lines
    .join("\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter((paragraph) => paragraph.split(/\s+/).length > 2);

  const normalizedText = normalizeWhitespace(filteredParagraphs.join("\n\n"));
  const provenance: SourceProvenance = {
    label: params.label,
    sourceKind: params.sourceKind,
    sourceType: params.sourceType,
    originalPath: params.originalPath,
    extractedCharacters: normalized.length,
    normalizedCharacters: normalizedText.length,
    estimatedTokens: estimateTokens(normalizedText),
    sha256: sha256(normalizedText),
    notes
  };

  return {
    ...params,
    normalizedText,
    notes,
    provenance
  };
}

function findSignoffIndex(lines: string[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (SIGNOFF_LINE.test(lines[index])) {
      return index;
    }
  }

  return -1;
}

export function analyzeEmailBundle(samples: NormalizedSample[]): BundleAnalysis {
  const warnings: string[] = [];
  const combinedText = normalizeWhitespace(samples.map((sample) => sample.normalizedText).join("\n\n"));
  if (combinedText.length < 3000) {
    warnings.push("Small bundle detected. Add more email samples for stronger cross-sample voice extraction.");
  }

  const { stableLexicalMarkers, topicSpecificLexicalMarkers } = splitStableAndTopicMarkers(
    samples.map((sample) => sample.normalizedText)
  );

  const provenance: BundleProvenance = {
    normalization: "email-formal-v1",
    totalSamples: samples.length,
    combinedCharacters: combinedText.length,
    combinedEstimatedTokens: estimateTokens(combinedText),
    samples: samples.map((sample) => sample.provenance)
  };

  return {
    combinedText,
    combinedEstimatedTokens: provenance.combinedEstimatedTokens,
    stableLexicalMarkers,
    topicSpecificLexicalMarkers,
    repeatedPhrases: extractRepeatedPhrases(combinedText),
    warnings,
    normalizedSamples: samples,
    provenance
  };
}
