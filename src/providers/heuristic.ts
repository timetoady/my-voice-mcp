import type {
  ProviderBundleDistillationRequest,
  ProviderBundleDistillationResponse,
  ProviderCritiqueRequest,
  ProviderCritiqueResponse,
  ProviderGenerateRequest,
  ProviderGenerateResponse,
  ProviderRevisionRequest,
  ProviderRevisionResponse,
  ProviderRewriteRequest,
  ProviderRewriteResponse,
  RewriteMode,
  VoiceProfile
} from "../domain/types.js";
import { compareSnapshot, snapshotText } from "../analysis/style.js";
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

  async distillBundle(
    request: ProviderBundleDistillationRequest
  ): Promise<ProviderBundleDistillationResponse> {
    if (request.profileType === "fiction-prose") {
      return this.distillFictionBundle(request);
    }
    return this.distillEmailBundle(request);
  }

  private async distillEmailBundle(
    request: ProviderBundleDistillationRequest
  ): Promise<ProviderBundleDistillationResponse> {
    const confidenceNotes: string[] = [];
    if (request.normalizedSamples.length < 4) {
      confidenceNotes.push("Confidence is moderate because the bundle uses the minimum viable number of email samples.");
    }
    if (request.topicSpecificLexicalMarkers.length > request.stableLexicalMarkers.length) {
      confidenceNotes.push("Topic-specific nouns still outnumber stable markers, so voice transfer may overfit if new prompts stay too close to the source topics.");
    }

    return {
      summary: `${request.heuristicSummary} in a polished, work-email register that stays more focused on clear body paragraphs than on greeting or signature ritual.`,
      voiceRules: [
        "Lead with the practical point early, then add just enough context to make the request or update feel grounded.",
        "Keep the tone professional, calm, and collaborative rather than breezy or sales-like.",
        `Reuse stable markers when natural: ${request.stableLexicalMarkers.slice(0, 6).join(", ") || "measured, professional phrasing"}.`,
        "Favor body paragraphs with steady sentence rhythm over one-line fragments or overly compressed bullets.",
        "Close with a practical next step or an offer to discuss, without sounding robotic."
      ],
      stableLexicalMarkers: request.stableLexicalMarkers.slice(0, 12),
      topicSpecificLexicalMarkers: request.topicSpecificLexicalMarkers.slice(0, 12),
      rhetoricalDevices: request.heuristicRhetoricalDevices,
      antiPatterns: [
        ...request.heuristicAntiPatterns,
        "Avoid copying one-off project nouns into unrelated prompts unless the brief calls for them."
      ],
      preferredOpenings: [
        "I wanted to share",
        "I am following up",
        "I wanted to check"
      ],
      preferredClosings: [
        "Happy to discuss further",
        "Please let me know",
        "Thank you"
      ],
      confidenceNotes
    };
  }

  private async distillFictionBundle(
    request: ProviderBundleDistillationRequest
  ): Promise<ProviderBundleDistillationResponse> {
    const metrics = request.narrativeMetrics;
    const confidenceNotes: string[] = [];
    if (request.normalizedSamples.length < 4) {
      confidenceNotes.push("Confidence is moderate because the bundle uses the minimum viable number of fiction excerpts.");
    }
    if (metrics && metrics.dialogueDensity < 0.05) {
      confidenceNotes.push("Dialogue is sparse across samples, so dialogue behavior is weakly modeled.");
    }

    // Recurring openers are computed from sentence-opener frequency, independent of the
    // stable/topic marker split, so a scene-specific proper noun can appear among them.
    // Filter those out before they enter a voice rule that promises not to copy scene nouns.
    const topicMarkerSet = new Set(request.topicSpecificLexicalMarkers.map((marker) => marker.toLowerCase()));
    const durableOpeners = (metrics?.recurringOpeners ?? []).filter(
      (opener) => !topicMarkerSet.has(opener.toLowerCase())
    );

    const voiceRules = metrics
      ? [
          `Hold a ${metrics.pov}-person point of view at ${distanceWord(metrics.narrationDistance)} narration distance.`,
          `Pace paragraphs ${metrics.paragraphPacingVariance > 0.4 ? "with contrast, alternating longer descriptive passages and shorter beats" : "steadily"}, around ${Math.round(metrics.averageParagraphWords)} words per paragraph.`,
          `${metrics.dialogueDensity > 0.2 ? "Let dialogue carry real weight" : "Keep dialogue sparse and purposeful"}, matching the source's attribution habits.`,
          `Keep descriptive density ${metrics.descriptiveDensity > 0.4 ? "specific and sensory" : "restrained and economical"} rather than piling on adjectives.`,
          `Reuse durable voice habits and recurring openings (${[...request.stableLexicalMarkers.slice(0, 4), ...durableOpeners.slice(0, 3)].join(", ") || "the source's habitual phrasing"}) without copying scene-specific nouns.`
        ]
      : [
          "Hold a consistent point of view and narration distance.",
          "Vary paragraph pacing between description and shorter beats.",
          "Keep dialogue purposeful and match the source's attribution habits.",
          "Match descriptive density without overloading adjectives.",
          "Favor durable voice traits over scene-specific nouns."
        ];

    return {
      summary: `${request.heuristicSummary} in a long-form fiction narrative voice that preserves scene rhythm, narration distance, and pacing over surface ornamentation.`,
      voiceRules,
      stableLexicalMarkers: request.stableLexicalMarkers.slice(0, 12),
      topicSpecificLexicalMarkers: request.topicSpecificLexicalMarkers.slice(0, 12),
      rhetoricalDevices: request.heuristicRhetoricalDevices,
      antiPatterns: [
        ...request.heuristicAntiPatterns,
        "Do not flatten narration distance or let the point of view drift mid-scene.",
        "Do not mistake more adjectives for style, or slip into generic literary pastiche.",
        "Do not sacrifice scene intent or plot facts to chase voice similarity."
      ],
      preferredOpenings: durableOpeners.slice(0, 3),
      preferredClosings: [],
      confidenceNotes
    };
  }

  async rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse> {
    return rewriteWithHeuristics(request);
  }

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    return generateWithHeuristics(request);
  }

  async critique(request: ProviderCritiqueRequest): Promise<ProviderCritiqueResponse> {
    const similarity = compareSnapshot(request.profile, snapshotText(request.candidateText));
    const leakedMarkers = (request.profile.topicSpecificLexicalMarkers ?? []).filter((marker) =>
      new RegExp(`\\b${escapeRegExp(marker)}\\b`, "i").test(request.candidateText)
    );
    const meaningRisk =
      request.taskType === "rewrite" && request.sourceText
        ? inferMeaningRisk(request.sourceText, request.candidateText)
        : "Low confidence heuristic estimate. Verify intent and factual accuracy during review.";

    const optionalImprovements =
      request.profile.profileType === "fiction-prose"
        ? [
            "Hold the established narration distance and point of view.",
            "Vary paragraph pacing instead of flattening every beat, and keep prose lived rather than commentary about style."
          ]
        : [
            "Trim any generic assistant framing that sounds like instructions rather than an email draft.",
            "Keep the cadence steady and professional instead of over-stylizing."
          ];

    return {
      voiceStrengths: similarity.matchedTraits.slice(0, 4),
      voiceDrifts: similarity.driftTraits.slice(0, 4),
      topicLeakage: leakedMarkers.slice(0, 4),
      meaningRisk,
      mandatoryFixes: similarity.revisionPriorities.slice(0, 3),
      optionalImprovements
    };
  }

  async revise(request: ProviderRevisionRequest): Promise<ProviderRevisionResponse> {
    const response = rewriteWithHeuristics({
      profile: request.profile,
      inputText: request.candidateText,
      mode: "rewrite",
      strictness: 0.6,
      report: compareSnapshot(request.profile, snapshotText(request.candidateText))
    });

    return {
      outputText: response.outputText,
      notes: [
        "Heuristic revision applied a lightweight cleanup pass from the structured critique."
      ]
    };
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

  // Heuristics cannot meaningfully restyle prose without damaging it; the fiction fast
  // baseline returns the source largely intact. Real voice transfer happens in reviewed
  // mode with a configured model provider.
  if (profile.profileType === "fiction-prose") {
    return {
      outputText: inputText.trim(),
      notes: ["Heuristic fiction baseline returned the source largely intact because no remote model provider was configured."]
    };
  }

  const rewritten = rewriteSentences(applyLexicalMarkers(inputText, profile), profile);
  return {
    outputText: rewritten,
    notes: ["Heuristic rewrite used because no remote model provider was configured."]
  };
}

function distanceWord(distance: number): string {
  if (distance < 0.4) {
    return "an intimate";
  }
  if (distance > 0.6) {
    return "a distant";
  }
  return "a measured";
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
  if (request.profile.profileType === "fiction-prose") {
    return generateFictionWithHeuristics(request);
  }

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

function generateFictionWithHeuristics(request: ProviderGenerateRequest): ProviderGenerateResponse {
  const brief = normalizePrompt(request.prompt);
  const markerLead = request.profile.lexicalMarkers.slice(0, 3).join(", ");
  const paragraphs = Array.from({ length: targetParagraphs(request.length) }, (_, index) => {
    if (index === 0) {
      return brief;
    }
    return `The scene continues, holding its established narration distance and pacing${
      markerLead ? `, with familiar touches like ${markerLead}` : ""
    }.`;
  });

  return {
    outputText: paragraphs.join("\n\n"),
    notes: ["Heuristic fiction baseline used because no remote model provider was configured."]
  };
}

function inferMeaningRisk(sourceText: string, candidateText: string): string {
  const sourceWords = sourceText.split(/\s+/).length;
  const candidateWords = candidateText.split(/\s+/).length;
  const ratio = candidateWords / Math.max(1, sourceWords);
  if (ratio < 0.55) {
    return "Moderate risk: the candidate is much shorter than the source and may have dropped context.";
  }
  if (ratio > 1.8) {
    return "Moderate risk: the candidate expands well beyond the source and may have added unsupported detail.";
  }
  return "Low to moderate risk: heuristic review did not detect a strong length-based meaning shift.";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
