import type {
  ProviderGenerateRequest,
  ProviderGenerateResponse,
  ProviderRewriteRequest,
  ProviderRewriteResponse,
  RewriteMode,
  VoiceProfile
} from "../domain/types.js";
import type { ModelProvider } from "./types.js";

function targetSentenceLength(profile: VoiceProfile): number {
  return Math.max(8, Math.round(profile.structurePatterns.averageSentenceWords));
}

function applyLexicalMarkers(text: string, profile: VoiceProfile): string {
  let output = text.trim();
  const marker = profile.lexicalMarkers[0];
  if (marker && !new RegExp(`\\b${marker}\\b`, "i").test(output)) {
    output = `${marker.charAt(0).toUpperCase()}${marker.slice(1)} matters here. ${output}`;
  }

  if (profile.styleDimensions.formality >= 0.65) {
    output = output
      .replace(/\bcan't\b/gi, "cannot")
      .replace(/\bwon't\b/gi, "will not")
      .replace(/\bit's\b/gi, "it is");
  } else if (profile.styleDimensions.formality <= 0.45) {
    output = output.replace(/\bcannot\b/gi, "can't").replace(/\bdo not\b/gi, "don't");
  }

  return output;
}

function rewriteSentences(text: string, profile: VoiceProfile): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const desiredLength = targetSentenceLength(profile);

  return sentences
    .map((sentence, index) => {
      let result = sentence.trim();
      if (!result) {
        return result;
      }

      if (profile.styleDimensions.directness > 0.65 && !/^\b(?:please|consider|notice)\b/i.test(result)) {
        result = index === 0 ? result : `Consider this: ${result.charAt(0).toLowerCase()}${result.slice(1)}`;
      }

      if (profile.styleDimensions.descriptiveness > 0.65 && !/,/.test(result)) {
        const words = result.split(/\s+/);
        if (words.length < desiredLength && words.length > 4) {
          words.splice(Math.min(3, words.length - 1), 0, "with a little more texture,");
          result = words.join(" ");
        }
      }

      if (profile.styleDimensions.emotionality < 0.35) {
        result = result.replace(/[!]+/g, ".");
      }

      return result;
    })
    .join(" ");
}

function buildHint(profile: VoiceProfile, request: ProviderRewriteRequest): ProviderRewriteResponse {
  const bullets = [
    `Lean toward ${profile.summary}.`,
    ...request.report.revisionPriorities.slice(0, 3),
    `Reuse markers such as: ${profile.lexicalMarkers.slice(0, 5).join(", ")}.`,
    `Aim for roughly ${targetSentenceLength(profile)} words per sentence.`
  ];

  return {
    outputText: `Original text:\n${request.inputText}\n\nStyle hints:\n- ${bullets.join("\n- ")}`,
    notes: ["Heuristic hint mode used because no remote model provider was configured."]
  };
}

function buildSnippet(profile: VoiceProfile, request: ProviderRewriteRequest): ProviderRewriteResponse {
  const rewritten = rewriteSentences(applyLexicalMarkers(request.inputText, profile), profile);
  const snippets = rewritten
    .split(/(?<=[.!?])\s+/)
    .slice(0, 3)
    .map((sentence, index) => `Snippet ${index + 1}: ${sentence}`);

  return {
    outputText: snippets.join("\n"),
    notes: ["Heuristic snippet mode provided targeted replacement candidates."]
  };
}

export class HeuristicProvider implements ModelProvider {
  readonly kind = "heuristic";

  async rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse> {
    return rewriteWithHeuristics(request);
  }

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    return generateWithHeuristics(request);
  }
}

export function rewriteWithHeuristics(request: ProviderRewriteRequest): ProviderRewriteResponse {
  const { profile, inputText, mode } = request;
  if (mode === "hint") {
    return buildHint(profile, request);
  }

  if (mode === "snippet") {
    return buildSnippet(profile, request);
  }

  const rewritten = rewriteSentences(applyLexicalMarkers(inputText, profile), profile);
  return {
    outputText: rewritten,
    notes: ["Heuristic rewrite used because no remote model provider was configured."]
  };
}

function targetParagraphs(length: "short" | "medium" | "long"): number {
  switch (length) {
    case "short":
      return 1;
    case "long":
      return 3;
    case "medium":
    default:
      return 2;
  }
}

function normalizePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ");
}

function extractSubject(prompt: string): string {
  return normalizePrompt(prompt)
    .replace(/^(write|draft|generate|create)\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/^(short|brief|medium-length|long)\s+/i, "")
    .replace(/\.$/, "");
}

function inferIntent(prompt: string): "welcome" | "announcement" | "thanks" | "introduction" | "update" | "generic" {
  const lower = prompt.toLowerCase();
  if (/\bwelcome\b/.test(lower)) {
    return "welcome";
  }
  if (/\bannounce|announcement\b/.test(lower)) {
    return "announcement";
  }
  if (/\bthank|donor|support\b/.test(lower)) {
    return "thanks";
  }
  if (/\bintroduce|introduction\b/.test(lower)) {
    return "introduction";
  }
  if (/\bupdate|newsletter|weekly\b/.test(lower)) {
    return "update";
  }
  return "generic";
}

function buildLead(intent: ReturnType<typeof inferIntent>, subject: string, profile: VoiceProfile): string {
  switch (intent) {
    case "welcome":
      return `Welcome. I am glad this ${subject || "note"} has reached you, and I hope it begins in a way that feels attentive rather than hurried.`;
    case "announcement":
      return `I wanted to share a brief note about ${subject || "what comes next"}, keeping the tone clear and measured from the start.`;
    case "thanks":
      return `Thank you. Support like this deserves more than a passing line, because it steadies the work and gives it room to continue.`;
    case "introduction":
      return `Let this serve as a gentle introduction to ${subject || "what follows"}, with enough clarity to orient the reader and enough warmth to invite them in.`;
    case "update":
      return `This ${subject || "update"} arrives in a measured tone, trying to be useful without sounding mechanical.`;
    case "generic":
    default:
      return `This ${subject || "piece"} should open with a clear sense of purpose, then settle into the ${profile.summary} that defines the voice.`;
  }
}

export function generateWithHeuristics(
  request: ProviderGenerateRequest
): ProviderGenerateResponse {
  const prompt = normalizePrompt(request.prompt);
  const subject = extractSubject(prompt);
  const intent = inferIntent(prompt);
  const markerLead = request.profile.lexicalMarkers.slice(0, 3).join(", ");
  const paragraphs = Array.from({ length: targetParagraphs(request.length) }, (_, index) => {
    const angle =
      index === 0
        ? "set the central idea"
        : index === 1
          ? "develop a supporting turn"
          : "land on a confident closing insight";

    let paragraph =
      index === 0
        ? buildLead(intent, subject, request.profile)
        : `From there, the ${subject || "piece"} can ${angle}, using ${markerLead || "measured diction"} to keep the language recognizable without overplaying it.`;

    if (request.profile.styleDimensions.descriptiveness > 0.6) {
      paragraph += " Add a little texture so the language feels observed rather than generic.";
    }

    if (request.profile.styleDimensions.formality > 0.6) {
      paragraph = paragraph.replace(/\bdon't\b/gi, "do not").replace(/\bcan't\b/gi, "cannot");
    }

    paragraph += " Keep the cadence deliberate, readable, and quietly assured.";

    return paragraph;
  });

  return {
    outputText: paragraphs.join("\n\n"),
    notes: ["Heuristic generation used because no remote model provider was configured."]
  };
}
