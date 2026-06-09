export type ProviderKind = "none" | "ollama" | "openai-compatible" | "bedrock";

export type RewriteMode = "rewrite" | "hint" | "snippet";

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

export interface VoiceProfile {
  voiceId: string;
  voiceName: string;
  description?: string;
  createdAt: string;
  sourceStats: SourceStats;
  summary: string;
  warnings: string[];
  styleDimensions: StyleDimensionSet;
  structurePatterns: StructurePatterns;
  lexicalMarkers: string[];
  rhetoricalDevices: string[];
  antiPatterns: string[];
  preferredOpenings: string[];
  preferredClosings: string[];
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

export interface CreateProfileResult {
  profile: VoiceProfile;
  guideMarkdown: string;
  extractedText: string;
  sourceFileName: string;
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
  providerUsed: ProviderKind | "heuristic";
}
