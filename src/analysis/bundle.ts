import type { BundleProvenance, NarrativeMetrics, SourceProvenance } from "../domain/types.js";

/**
 * A single normalized bundle sample. Email and fiction normalization both produce
 * this shape so the downstream profile-building path is content-type agnostic.
 */
export interface NormalizedSample {
  label: string;
  sourceKind: "pdf" | "text";
  sourceType: "path" | "text";
  originalPath?: string;
  extractedText: string;
  normalizedText: string;
  notes: string[];
  provenance: SourceProvenance;
}

/**
 * Result of analyzing a normalized multi-sample bundle. `narrativeMetrics` is only
 * populated for fiction bundles.
 */
export interface BundleAnalysis {
  combinedText: string;
  combinedEstimatedTokens: number;
  stableLexicalMarkers: string[];
  topicSpecificLexicalMarkers: string[];
  repeatedPhrases: string[];
  warnings: string[];
  normalizedSamples: NormalizedSample[];
  provenance: BundleProvenance;
  narrativeMetrics?: NarrativeMetrics;
}
