import { sha256 } from "../lib/hash.js";
import { estimateTokens, normalizeWhitespace } from "../lib/text.js";
import type { BundleProvenance, SourceProvenance } from "../domain/types.js";
import type { BundleAnalysis, NormalizedSample } from "./bundle.js";
import { extractRepeatedPhrases, splitStableAndTopicMarkers } from "./markers.js";
import { narrativeSnapshot } from "./narrative.js";

const HEADING_KEYWORD = /^(chapter|part|book|prologue|epilogue|section|canto)\b/i;
const CHAPTER_NUMBERED =
  /^(chapter|part|book|canto)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b[.:]?$/i;
const SCENE_BREAK = /^(?:\*\s*){2,}\*?$|^#{2,}$|^[-—_]{3,}$|^•+$|^~+$/;
const PAGE_NUMBER = /^\s*\d{1,4}\s*$/;
const GUTENBERG = /(project gutenberg|\*\*\* ?(?:start|end) of)/i;

/** A line that ends with sentence/clause punctuation is prose, not structural scaffolding. */
function endsLikeProse(line: string): boolean {
  return /[.!?,:;]["”']?$/.test(line);
}

function isChapterHeading(line: string): boolean {
  if (CHAPTER_NUMBERED.test(line)) {
    return true;
  }
  // General heading: starts with a heading keyword, is short, and does not read like prose
  // (so "Part of her wanted to leave." is preserved while "Prologue" is stripped).
  return HEADING_KEYWORD.test(line) && line.split(/\s+/).length <= 6 && !endsLikeProse(line);
}

function isAllCapsHeading(line: string): boolean {
  if (/["“”]/.test(line) || endsLikeProse(line)) {
    // Never treat a quoted line (likely dialogue) or a punctuated line (likely prose) as a heading.
    return false;
  }
  const letters = line.replace(/[^a-zA-Z]/g, "");
  return letters.length >= 2 && letters === letters.toUpperCase() && line.split(/\s+/).length <= 6;
}

/**
 * Fiction normalization keeps paragraph and dialogue structure intact — those are exactly
 * the behaviors the voice profile needs to model. It only strips structural scaffolding:
 * chapter/section headings, scene-break glyphs, bare page numbers, all-caps headings, and
 * source boilerplate. Wrapped lines within a paragraph are rejoined; blank-line paragraph
 * breaks are preserved.
 */
export function normalizeFictionSample(params: {
  label: string;
  sourceKind: "pdf" | "text";
  sourceType: "path" | "text";
  originalPath?: string;
  extractedText: string;
}): NormalizedSample {
  const normalized = normalizeWhitespace(params.extractedText);
  const notes = new Set<string>();
  const keptParagraphs: string[] = [];

  for (const rawParagraph of normalized.split(/\n{2,}/)) {
    const keptLines = rawParagraph
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) {
          return false;
        }
        if (PAGE_NUMBER.test(line)) {
          notes.add("Removed page-number line.");
          return false;
        }
        if (SCENE_BREAK.test(line)) {
          notes.add("Removed scene-break glyph.");
          return false;
        }
        if (GUTENBERG.test(line)) {
          notes.add("Removed source boilerplate line.");
          return false;
        }
        if (isChapterHeading(line)) {
          notes.add("Removed chapter/section heading.");
          return false;
        }
        if (isAllCapsHeading(line)) {
          notes.add("Removed all-caps heading line.");
          return false;
        }
        return true;
      });

    const paragraph = keptLines.join(" ").trim();
    if (paragraph) {
      keptParagraphs.push(paragraph);
    }
  }

  const normalizedText = normalizeWhitespace(keptParagraphs.join("\n\n"));
  const provenance: SourceProvenance = {
    label: params.label,
    sourceKind: params.sourceKind,
    sourceType: params.sourceType,
    originalPath: params.originalPath,
    extractedCharacters: normalized.length,
    normalizedCharacters: normalizedText.length,
    estimatedTokens: estimateTokens(normalizedText),
    sha256: sha256(normalizedText),
    notes: [...notes]
  };

  return {
    ...params,
    normalizedText,
    notes: [...notes],
    provenance
  };
}

export function analyzeFictionBundle(samples: NormalizedSample[]): BundleAnalysis {
  const warnings: string[] = [];
  const combinedText = normalizeWhitespace(samples.map((sample) => sample.normalizedText).join("\n\n"));
  if (combinedText.length < 4000) {
    warnings.push("Small fiction bundle detected. Add longer or more excerpts for stronger cross-sample voice extraction.");
  }

  const { stableLexicalMarkers, topicSpecificLexicalMarkers } = splitStableAndTopicMarkers(
    samples.map((sample) => sample.normalizedText)
  );

  const narrativeMetrics = narrativeSnapshot(combinedText);
  if (narrativeMetrics.dialogueDensity < 0.05) {
    warnings.push("Very little dialogue detected across samples; dialogue behavior will be weakly modeled.");
  }

  const provenance: BundleProvenance = {
    normalization: "fiction-prose-v1",
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
    provenance,
    narrativeMetrics
  };
}
