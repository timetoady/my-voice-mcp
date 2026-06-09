import type { ProviderRewriteRequest, ProviderRewriteResponse, RewriteMode, VoiceProfile } from "../domain/types.js";
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
