const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "have",
  "this",
  "from",
  "your",
  "you",
  "into",
  "their",
  "they",
  "there",
  "about",
  "would",
  "could",
  "should",
  "were",
  "been",
  "because",
  "what",
  "when",
  "where",
  "which",
  "while",
  "just",
  "them",
  "then",
  "than",
  "will",
  "shall"
]);

export function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function splitParagraphs(text: string): string[] {
  return normalizeWhitespace(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function splitSentences(text: string): string[] {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function countWords(text: string): number {
  const matches = text.match(/\b[\w'-]+\b/g);
  return matches ? matches.length : 0;
}

export function extractTopMarkers(text: string, limit = 12): string[] {
  const words = (text.toLowerCase().match(/\b[a-z][a-z'-]{2,}\b/g) ?? []).filter(
    (word) => !STOP_WORDS.has(word)
  );

  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

export function lexicalDiversity(text: string): number {
  const words = text.toLowerCase().match(/\b[\w'-]+\b/g) ?? [];
  if (!words.length) {
    return 0;
  }

  return Math.min(1, new Set(words).size / words.length);
}

export function sampleChunks(text: string, maxChunkChars = 1600, maxSamples = 6): string[] {
  const paragraphs = splitParagraphs(text);
  if (!paragraphs.length) {
    return [];
  }

  const samples: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChunkChars && current) {
      samples.push(current);
      current = paragraph;
    } else {
      current = next;
    }

    if (samples.length >= maxSamples) {
      break;
    }
  }

  if (current && samples.length < maxSamples) {
    samples.push(current);
  }

  if (samples.length <= maxSamples) {
    return samples;
  }

  const stride = Math.max(1, Math.floor(samples.length / maxSamples));
  return samples.filter((_, index) => index % stride === 0).slice(0, maxSamples);
}

export function topSentenceOpeners(text: string, limit = 6): string[] {
  const openers = new Map<string, number>();
  for (const sentence of splitSentences(text)) {
    const firstWord = sentence.match(/\b[\w'-]+\b/)?.[0]?.toLowerCase();
    if (!firstWord || STOP_WORDS.has(firstWord)) {
      continue;
    }

    openers.set(firstWord, (openers.get(firstWord) ?? 0) + 1);
  }

  return [...openers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

export function topSentenceClosings(text: string, limit = 6): string[] {
  const closings = new Map<string, number>();
  for (const sentence of splitSentences(text)) {
    const words = sentence.toLowerCase().match(/\b[\w'-]+\b/g) ?? [];
    const lastWord = words.at(-1);
    if (!lastWord || STOP_WORDS.has(lastWord)) {
      continue;
    }

    closings.set(lastWord, (closings.get(lastWord) ?? 0) + 1);
  }

  return [...closings.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}
