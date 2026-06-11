export type ProviderKind = "none" | "ollama" | "openai-compatible" | "bedrock";

export type RewriteMode = "rewrite" | "hint" | "snippet";
export type QualityMode = "fast" | "reviewed";
export type ProfileType = "generic" | "email-formal" | "fiction-prose";

export interface BundleSampleInput {
  label: string;
  path?: string;
  text?: string;
}

export interface SourceProvenance {
  label: string;
  sourceKind: "pdf" | "text";
  sourceType: "path" | "text";
  originalPath?: string;
  extractedCharacters: number;
  normalizedCharacters: number;
  estimatedTokens: number;
  sha256: string;
  notes: string[];
}

export interface BundleProvenance {
  normalization: "email-formal-v1" | "fiction-prose-v1";
  totalSamples: number;
  combinedCharacters: number;
  combinedEstimatedTokens: number;
  samples: SourceProvenance[];
}

export interface SourceStats {
  fileName: string;
  pageCount: number;
  extractedCharacters: number;
  estimatedTokens: number;
  chunkCount: number;
  sampleCount: number;
  sha256: string;
}

export interface StyleDimensionSet {
  formality: number;
  descriptiveness: number;
  emotionality: number;
  directness: number;
  rhythmComplexity: number;
  sentenceLength: number;
  paragraphDensity: number;
  lexicalDiversity: number;
  punctuationExpressiveness: number;
}

export interface StructurePatterns {
  averageSentenceWords: number;
  averageParagraphSentences: number;
  questionRate: number;
  exclamationRate: number;
  semicolonRate: number;
  dashRate: number;
  listLikeRate: number;
  dialogueRate: number;
}

export interface CompactPromptPack {
  systemSummary: string;
  voiceRules: string[];
  antiPatterns: string[];
  lexicalMarkers: string[];
  revisionChecklist: string[];
}

/**
 * Fiction-specific narrative craft signals. Computed for every snapshot but only
 * folded into similarity scoring when the profile itself carries them (fiction profiles).
 */
export interface NarrativeMetrics {
  pov: "first" | "third" | "mixed";
  /** 0 = intimate/deep narration, 1 = distant/objective narration. */
  narrationDistance: number;
  /** Share of words that fall inside dialogue (0-1). */
  dialogueDensity: number;
  /** Concentration of adjectives, adverbs, and sensory words (0-1). */
  descriptiveDensity: number;
  /** Rate of interiority/perception verbs (0-1). */
  interiorityRate: number;
  averageParagraphWords: number;
  /** Coefficient of variation of paragraph length (0-1); higher = more pacing contrast. */
  paragraphPacingVariance: number;
  /** Share of short "beat" paragraphs among all paragraphs (0-1). */
  sceneRhythm: number;
  recurringOpeners: string[];
}

export interface VoiceProfile {
  voiceId: string;
  voiceName: string;
  profileType?: ProfileType;
  description?: string;
  createdAt: string;
  sourceStats: SourceStats;
  summary: string;
  warnings: string[];
  confidenceNotes?: string[];
  provenance?: BundleProvenance;
  styleDimensions: StyleDimensionSet;
  structurePatterns: StructurePatterns;
  lexicalMarkers: string[];
  stableLexicalMarkers?: string[];
  topicSpecificLexicalMarkers?: string[];
  rhetoricalDevices: string[];
  antiPatterns: string[];
  preferredOpenings: string[];
  preferredClosings: string[];
  narrativeMetrics?: NarrativeMetrics;
  compactPromptPack: CompactPromptPack;
}

export interface TextStyleSnapshot {
  textLength: number;
  estimatedTokens: number;
  styleDimensions: StyleDimensionSet;
  structurePatterns: StructurePatterns;
  lexicalMarkers: string[];
  rhetoricalDevices: string[];
  samplePhrases: string[];
  narrativeMetrics: NarrativeMetrics;
}

export interface SimilarityReport {
  score: number;
  perDimensionScores: Record<string, number>;
  matchedTraits: string[];
  driftTraits: string[];
  revisionPriorities: string[];
}

export interface ProfileIndexEntry {
  voiceId: string;
  voiceName: string;
  profileType?: ProfileType;
  description?: string;
  createdAt: string;
  summary: string;
  sourceStats: SourceStats;
  warnings: string[];
}

export interface ProviderConfig {
  kind: ProviderKind;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  region?: string;
}

export interface ProviderRewriteRequest {
  profile: VoiceProfile;
  inputText: string;
  mode: RewriteMode;
  strictness: number;
  report: SimilarityReport;
}

export interface ProviderRewriteResponse {
  outputText: string;
  notes: string[];
}

export interface ProviderGenerateRequest {
  profile: VoiceProfile;
  prompt: string;
  strictness: number;
  length: "short" | "medium" | "long";
}

export interface ProviderBundleDistillationRequest {
  voiceName: string;
  description?: string;
  profileType: ProfileType;
  /** Human-readable hint for the kind of artifact this voice produces (e.g. "email draft", "prose passage"). */
  voiceFocus?: string;
  normalizedSamples: Array<{
    label: string;
    normalizedText: string;
    extractedCharacters: number;
    normalizedCharacters: number;
  }>;
  combinedText: string;
  stableLexicalMarkers: string[];
  topicSpecificLexicalMarkers: string[];
  repeatedPhrases: string[];
  heuristicSummary: string;
  heuristicRhetoricalDevices: string[];
  heuristicAntiPatterns: string[];
  /** Present for fiction-prose bundles; lets the model reason about narrative craft signals. */
  narrativeMetrics?: NarrativeMetrics;
}

export interface ProviderBundleDistillationResponse {
  summary: string;
  voiceRules: string[];
  stableLexicalMarkers: string[];
  topicSpecificLexicalMarkers: string[];
  rhetoricalDevices: string[];
  antiPatterns: string[];
  preferredOpenings: string[];
  preferredClosings: string[];
  confidenceNotes: string[];
}

export interface ProviderCritiqueRequest {
  profile: VoiceProfile;
  taskType: "rewrite" | "generate";
  sourceText?: string;
  prompt?: string;
  candidateText: string;
}

export interface ProviderCritiqueResponse {
  voiceStrengths: string[];
  voiceDrifts: string[];
  topicLeakage: string[];
  meaningRisk: string;
  mandatoryFixes: string[];
  optionalImprovements: string[];
}

export interface ProviderRevisionRequest {
  profile: VoiceProfile;
  taskType: "rewrite" | "generate";
  sourceText?: string;
  prompt?: string;
  candidateText: string;
  critique: ProviderCritiqueResponse;
}

export interface ProviderRevisionResponse {
  outputText: string;
  notes: string[];
}

export interface ProviderGenerateResponse {
  outputText: string;
  notes: string[];
}

export interface CreateProfileResult {
  profile: VoiceProfile;
  guideMarkdown: string;
  extractedText: string;
  sourceFileName: string;
}

export interface CreateProfileBundleResult {
  profile: VoiceProfile;
  guideMarkdown: string;
  extractedText: string;
  provenance: BundleProvenance;
}

export interface ValidationResult {
  supported: boolean;
  reason?: string;
  warnings: string[];
  stats?: Omit<SourceStats, "chunkCount" | "sampleCount" | "sha256">;
}

export interface CompareResult {
  profile: VoiceProfile;
  snapshot: TextStyleSnapshot;
  similarity: SimilarityReport;
}

export interface RewriteResult {
  profile: VoiceProfile;
  similarityBefore: SimilarityReport;
  similarityAfterEstimate: SimilarityReport;
  outputText: string;
  notes: string[];
  mode: RewriteMode;
  qualityMode: QualityMode;
  critique?: ProviderCritiqueResponse;
  providerUsed: ProviderKind | "heuristic";
}

export interface GenerateResult {
  profile: VoiceProfile;
  outputText: string;
  notes: string[];
  providerUsed: ProviderKind | "heuristic";
  similarityEstimate: SimilarityReport;
  length: "short" | "medium" | "long";
  qualityMode: QualityMode;
  critique?: ProviderCritiqueResponse;
}
