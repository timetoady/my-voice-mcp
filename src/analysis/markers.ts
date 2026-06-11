import { extractTopMarkers } from "../lib/text.js";

/**
 * Cross-sample marker separation, shared by every bundle content type.
 *
 * Markers that recur across multiple samples are treated as stable voice traits;
 * markers that appear in only one sample are treated as topic/scene-specific artifacts.
 * Keeping this voice-agnostic prevents both email and fiction profiles from overfitting
 * to one-off nouns.
 */
export function splitStableAndTopicMarkers(
  normalizedTexts: string[],
  options: { stableLimit?: number; topicLimit?: number; markersPerSample?: number } = {}
): { stableLexicalMarkers: string[]; topicSpecificLexicalMarkers: string[] } {
  const { stableLimit = 12, topicLimit = 12, markersPerSample = 20 } = options;
  const sampleMarkerCounts = new Map<string, { sampleHits: number; totalHits: number }>();

  for (const text of normalizedTexts) {
    const markers = extractTopMarkers(text, markersPerSample);
    const seen = new Set<string>();
    for (const marker of markers) {
      const stats = sampleMarkerCounts.get(marker) ?? { sampleHits: 0, totalHits: 0 };
      stats.totalHits += 1;
      if (!seen.has(marker)) {
        stats.sampleHits += 1;
        seen.add(marker);
      }
      sampleMarkerCounts.set(marker, stats);
    }
  }

  const stableLexicalMarkers = [...sampleMarkerCounts.entries()]
    .filter(([, stats]) => stats.sampleHits >= 2)
    .sort((a, b) => b[1].sampleHits - a[1].sampleHits || b[1].totalHits - a[1].totalHits)
    .slice(0, stableLimit)
    .map(([marker]) => marker);

  const topicSpecificLexicalMarkers = [...sampleMarkerCounts.entries()]
    .filter(([, stats]) => stats.sampleHits === 1)
    .sort((a, b) => b[1].totalHits - a[1].totalHits)
    .slice(0, topicLimit)
    .map(([marker]) => marker);

  return { stableLexicalMarkers, topicSpecificLexicalMarkers };
}

/** Recurring 3-word phrases that appear at least twice in the combined bundle text. */
export function extractRepeatedPhrases(text: string, limit = 8): string[] {
  const words = text.toLowerCase().match(/\b[a-z][a-z'-]+\b/g) ?? [];
  const counts = new Map<string, number>();
  for (let index = 0; index < words.length - 2; index += 1) {
    const phrase = words.slice(index, index + 3).join(" ");
    if (phrase.length < 12) {
      continue;
    }
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([phrase]) => phrase);
}
