import type { NarrativeMetrics } from "../domain/types.js";
import { normalizeWhitespace, splitParagraphs, topSentenceOpeners } from "../lib/text.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function countMatches(text: string, regex: RegExp): number {
  return text.match(regex)?.length ?? 0;
}

const INTERIORITY_VERBS =
  /\b(?:thought|felt|knew|wondered|remembered|realized|realised|believed|imagined|hoped|feared|wanted|understood|noticed|sensed|recalled)\b/g;
const SENSORY_WORDS =
  /\b(?:saw|looked|watched|heard|listened|felt|touched|smelled|smelt|tasted|glowed|shadow|shadows|light|cold|warm|dark|bright|silence|sound|scent|glare|hush|chill)\b/g;
const ADJECTIVE_LIKE = /\b\w+(?:ive|ous|ful|less|able|ible|ic|al)\b/g;
const ADVERB_LIKE = /\b\w+ly\b/g;
// Articles and bare "it" openers carry no voice signal; drop them from recurring openers.
const OPENER_NOISE = new Set(["a", "an", "the", "it"]);
const FIRST_PERSON = /\b(?:i|me|my|mine|we|us|our|ours)\b/g;
const THIRD_PERSON = /\b(?:he|him|his|she|her|hers|they|them|their|theirs)\b/g;
const DIALOGUE_SPAN = /“[^”]*”|"[^"]*"/g;

function wordsIn(text: string): string[] {
  return text.match(/\b[\w'-]+\b/g) ?? [];
}

function countDialogueWords(text: string): number {
  const spans = text.match(DIALOGUE_SPAN) ?? [];
  let count = 0;
  for (const span of spans) {
    count += wordsIn(span).length;
  }
  return count;
}

/** Coefficient of variation (stdev / mean), clamped to 0-1. */
function normalizedDispersion(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) {
    return 0;
  }
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return clamp(Math.sqrt(variance) / mean);
}

export function narrativeSnapshot(text: string): NarrativeMetrics {
  const normalized = normalizeWhitespace(text);
  const lower = normalized.toLowerCase();
  const wordCount = Math.max(1, wordsIn(lower).length);
  const paragraphs = splitParagraphs(normalized);
  const paragraphWordCounts = paragraphs.map((paragraph) => wordsIn(paragraph).length);

  const firstPerson = countMatches(lower, FIRST_PERSON);
  const thirdPerson = countMatches(lower, THIRD_PERSON);
  const personTotal = firstPerson + thirdPerson;
  const firstShare = personTotal ? firstPerson / personTotal : 0;
  const pov: NarrativeMetrics["pov"] =
    personTotal === 0 ? "third" : firstShare >= 0.6 ? "first" : firstShare <= 0.25 ? "third" : "mixed";

  const interiorityRate = clamp((countMatches(lower, INTERIORITY_VERBS) / wordCount) * 25);
  // Narration distance: first-person presence pulls it closer, but interiority is the stronger
  // signal so that a close third-person voice with steady interiority reads as mid-distance
  // rather than fully distant. Distant third-person (little interiority) still scores near 1.
  const intimacy = clamp(firstShare * 0.55 + interiorityRate * 1.6);
  const narrationDistance = Number((1 - intimacy).toFixed(3));

  const dialogueDensity = Number(clamp(countDialogueWords(normalized) / wordCount).toFixed(3));

  const descriptiveDensity = Number(
    clamp(
      ((countMatches(lower, ADJECTIVE_LIKE) + countMatches(lower, ADVERB_LIKE) + countMatches(lower, SENSORY_WORDS)) /
        wordCount) *
        4
    ).toFixed(3)
  );

  const averageParagraphWords = paragraphWordCounts.length
    ? Number((paragraphWordCounts.reduce((sum, value) => sum + value, 0) / paragraphWordCounts.length).toFixed(2))
    : 0;
  const paragraphPacingVariance = Number(normalizedDispersion(paragraphWordCounts).toFixed(3));
  const shortBeats = paragraphWordCounts.filter((count) => count > 0 && count < 25).length;
  const sceneRhythm = paragraphWordCounts.length
    ? Number((shortBeats / paragraphWordCounts.length).toFixed(3))
    : 0;

  return {
    pov,
    narrationDistance,
    dialogueDensity,
    descriptiveDensity,
    interiorityRate: Number(interiorityRate.toFixed(3)),
    averageParagraphWords,
    paragraphPacingVariance,
    sceneRhythm,
    recurringOpeners: topSentenceOpeners(normalized, 10)
      .filter((opener) => !OPENER_NOISE.has(opener))
      .slice(0, 6)
  };
}
