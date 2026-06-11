import type {
  NarrativeMetrics,
  SimilarityReport,
  StructurePatterns,
  StyleDimensionSet,
  TextStyleSnapshot,
  VoiceProfile
} from "../domain/types.js";
import {
  countWords,
  estimateTokens,
  extractTopMarkers,
  lexicalDiversity,
  normalizeWhitespace,
  splitParagraphs,
  splitSentences
} from "../lib/text.js";
import { narrativeSnapshot } from "./narrative.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function percent(value: number): number {
  return Math.round(clamp(value) * 100);
}

function normalizedAverageWordLength(words: string[]): number {
  if (!words.length) {
    return 0;
  }

  const average = words.reduce((sum, word) => sum + word.length, 0) / words.length;
  return clamp((average - 3.5) / 5.5);
}

function countMatches(text: string, regex: RegExp): number {
  return text.match(regex)?.length ?? 0;
}

function rate(count: number, total: number): number {
  if (!total) {
    return 0;
  }

  return clamp(count / total);
}

function detectRhetoricalDevices(text: string): string[] {
  const lower = text.toLowerCase();
  const devices = new Set<string>();

  if (/\b(?:like|as if|as though)\b/.test(lower)) {
    devices.add("comparison");
  }
  if (/\b(?:but|yet|however|still)\b/.test(lower)) {
    devices.add("contrast");
  }
  if (/\b(?:perhaps|maybe|possibly|it seems)\b/.test(lower)) {
    devices.add("hedging");
  }
  if (/\b(?:must|always|never|certainly)\b/.test(lower)) {
    devices.add("assertive emphasis");
  }
  if (/[?].+[?]/s.test(text)) {
    devices.add("serial questions");
  }
  if (/\b(?:imagine|consider|notice|remember)\b/.test(lower)) {
    devices.add("reader address");
  }

  return [...devices];
}

export function snapshotText(text: string): TextStyleSnapshot {
  const normalized = normalizeWhitespace(text);
  const sentences = splitSentences(normalized);
  const paragraphs = splitParagraphs(normalized);
  const words = normalized.toLowerCase().match(/\b[\w'-]+\b/g) ?? [];
  const wordCount = words.length;
  const sentenceCount = sentences.length || 1;
  const paragraphCount = paragraphs.length || 1;

  const averageSentenceWords = wordCount / sentenceCount;
  const averageParagraphSentences = sentenceCount / paragraphCount;
  const punctuationMarks = countMatches(normalized, /[!?;:—-]/g);
  const contractions = countMatches(normalized.toLowerCase(), /\b\w+'\w+\b/g);
  const adjectivesLike = countMatches(normalized.toLowerCase(), /\b\w+(?:ive|ous|ful|less|able|ible|ic|al)\b/g);
  const adverbsLike = countMatches(normalized.toLowerCase(), /\b\w+ly\b/g);
  const firstPerson = countMatches(normalized.toLowerCase(), /\b(?:i|me|my|mine|we|our|ours)\b/g);
  const secondPerson = countMatches(normalized.toLowerCase(), /\b(?:you|your|yours)\b/g);
  const modalSofteners = countMatches(normalized.toLowerCase(), /\b(?:might|could|perhaps|maybe|seems|appears)\b/g);
  const commandForms = countMatches(normalized.toLowerCase(), /\b(?:do|make|take|consider|notice|start|stop|let)\b/g);

  const styleDimensions: StyleDimensionSet = {
    formality: clamp(
      normalizedAverageWordLength(words) * 0.45 +
        lexicalDiversity(normalized) * 0.35 +
        (1 - rate(contractions, wordCount)) * 0.2
    ),
    descriptiveness: clamp(rate(adjectivesLike + adverbsLike, wordCount) * 4),
    emotionality: clamp(rate(countMatches(normalized, /[!]/g), sentenceCount) * 2.4),
    directness: clamp(rate(commandForms, sentenceCount) * 2 + rate(secondPerson, wordCount) - rate(modalSofteners, sentenceCount)),
    rhythmComplexity: clamp(
      Math.min(1, Math.abs(averageSentenceWords - 15) / 15) * 0.35 +
        rate(countMatches(normalized, /[,;:—-]/g), sentenceCount) * 1.2 +
        Math.min(1, averageParagraphSentences / 6) * 0.2
    ),
    sentenceLength: clamp(averageSentenceWords / 28),
    paragraphDensity: clamp(averageParagraphSentences / 7),
    lexicalDiversity: lexicalDiversity(normalized),
    punctuationExpressiveness: clamp(rate(punctuationMarks, sentenceCount) * 1.6)
  };

  const structurePatterns: StructurePatterns = {
    averageSentenceWords: Number(averageSentenceWords.toFixed(2)),
    averageParagraphSentences: Number(averageParagraphSentences.toFixed(2)),
    questionRate: Number(rate(countMatches(normalized, /[?]/g), sentenceCount).toFixed(3)),
    exclamationRate: Number(rate(countMatches(normalized, /[!]/g), sentenceCount).toFixed(3)),
    semicolonRate: Number(rate(countMatches(normalized, /[;]/g), sentenceCount).toFixed(3)),
    dashRate: Number(rate(countMatches(normalized, /[—-]/g), sentenceCount).toFixed(3)),
    listLikeRate: Number(rate(countMatches(normalized, /(?:^|\n)\s*(?:[-*]|\d+\.)\s+/gm), paragraphCount).toFixed(3)),
    dialogueRate: Number(rate(countMatches(normalized, /["“”]/g), sentenceCount).toFixed(3))
  };

  return {
    textLength: normalized.length,
    estimatedTokens: estimateTokens(normalized),
    styleDimensions,
    structurePatterns,
    lexicalMarkers: extractTopMarkers(normalized, 12),
    rhetoricalDevices: detectRhetoricalDevices(normalized),
    samplePhrases: sentences.slice(0, 4).map((sentence) => sentence.slice(0, 120)),
    narrativeMetrics: narrativeSnapshot(normalized)
  };
}

function differenceScore(left: number, right: number): number {
  return Math.max(0, 100 - Math.round(Math.abs(left - right) * 100));
}

function markerOverlapScore(profileMarkers: string[], snapshotMarkers: string[]): number {
  if (!profileMarkers.length) {
    return 0;
  }

  const overlap = profileMarkers.filter((marker) => snapshotMarkers.includes(marker)).length;
  return Math.round((overlap / profileMarkers.length) * 100);
}

function structureScore(profile: StructurePatterns, snapshot: StructurePatterns): number {
  const values = [
    differenceScore(profile.averageSentenceWords / 30, snapshot.averageSentenceWords / 30),
    differenceScore(profile.averageParagraphSentences / 8, snapshot.averageParagraphSentences / 8),
    differenceScore(profile.questionRate, snapshot.questionRate),
    differenceScore(profile.exclamationRate, snapshot.exclamationRate),
    differenceScore(profile.semicolonRate, snapshot.semicolonRate),
    differenceScore(profile.dashRate, snapshot.dashRate)
  ];

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function narrativeScore(profile: NarrativeMetrics, snapshot: NarrativeMetrics): number {
  const values = [
    differenceScore(profile.narrationDistance, snapshot.narrationDistance),
    differenceScore(profile.dialogueDensity, snapshot.dialogueDensity),
    differenceScore(profile.descriptiveDensity, snapshot.descriptiveDensity),
    differenceScore(profile.interiorityRate, snapshot.interiorityRate),
    differenceScore(profile.paragraphPacingVariance, snapshot.paragraphPacingVariance),
    differenceScore(profile.sceneRhythm, snapshot.sceneRhythm),
    differenceScore(
      Math.min(1, profile.averageParagraphWords / 80),
      Math.min(1, snapshot.averageParagraphWords / 80)
    ),
    markerOverlapScore(profile.recurringOpeners, snapshot.recurringOpeners),
    profile.pov === snapshot.pov ? 100 : 50
  ];

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function compareSnapshot(profile: VoiceProfile, snapshot: TextStyleSnapshot): SimilarityReport {
  const perDimensionScores: Record<string, number> = {};
  for (const [key, value] of Object.entries(profile.styleDimensions)) {
    perDimensionScores[key] = differenceScore(
      value,
      snapshot.styleDimensions[key as keyof StyleDimensionSet]
    );
  }

  perDimensionScores.lexicalMarkers = markerOverlapScore(profile.lexicalMarkers, snapshot.lexicalMarkers);
  perDimensionScores.structure = structureScore(profile.structurePatterns, snapshot.structurePatterns);
  perDimensionScores.rhetoricalDevices = Math.round(
    (profile.rhetoricalDevices.filter((device) => snapshot.rhetoricalDevices.includes(device)).length /
      Math.max(1, profile.rhetoricalDevices.length)) *
      100
  );

  // Narrative craft is only scored for profiles that carry it (fiction profiles), so email
  // and generic profiles keep their existing scoring untouched.
  if (profile.narrativeMetrics && snapshot.narrativeMetrics) {
    perDimensionScores.narrative = narrativeScore(profile.narrativeMetrics, snapshot.narrativeMetrics);
  }

  const score = Math.round(
    Object.values(perDimensionScores).reduce((sum, value) => sum + value, 0) /
      Object.values(perDimensionScores).length
  );

  const sorted = Object.entries(perDimensionScores).sort((a, b) => b[1] - a[1]);
  const matchedTraits = sorted
    .slice(0, 4)
    .filter(([, value]) => value >= 65)
    .map(([key]) => `Strong alignment in ${key.replace(/([A-Z])/g, " $1").toLowerCase()}`);
  const driftTraits = sorted
    .slice(-4)
    .filter(([, value]) => value < 65)
    .map(([key]) => `Drift in ${key.replace(/([A-Z])/g, " $1").toLowerCase()}`);
  const revisionPriorities = driftTraits.length
    ? driftTraits.map((trait) => trait.replace("Drift in ", "Tighten "))
    : ["Style is already close to the profile; preserve current strengths while refining diction."];

  return {
    score,
    perDimensionScores,
    matchedTraits,
    driftTraits,
    revisionPriorities
  };
}

export function summarizeStyle(snapshot: TextStyleSnapshot): string {
  const tone =
    snapshot.styleDimensions.formality >= 0.65
      ? "formal"
      : snapshot.styleDimensions.directness >= 0.6
        ? "direct"
        : "conversational";
  const texture =
    snapshot.styleDimensions.descriptiveness >= 0.6 ? "descriptive" : "economical";
  const rhythm =
    snapshot.structurePatterns.averageSentenceWords >= 18 ? "long-form cadence" : "compact cadence";

  return `${tone}, ${texture}, ${rhythm}`;
}

export function formatPercentage(value: number): string {
  return `${percent(value)}%`;
}
