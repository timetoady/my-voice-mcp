import { ProviderConfigurationError } from "../domain/errors.js";
import type {
  ProviderBundleDistillationRequest,
  ProviderBundleDistillationResponse,
  ProviderConfig,
  ProviderCritiqueRequest,
  ProviderCritiqueResponse,
  ProviderGenerateRequest,
  ProviderGenerateResponse,
  ProviderRevisionRequest,
  ProviderRevisionResponse,
  ProviderRewriteRequest,
  ProviderRewriteResponse,
  VoiceProfile
} from "../domain/types.js";
import { contentKindFor } from "../analysis/contentKind.js";
import type { ModelProvider } from "./types.js";

export class OllamaProvider implements ModelProvider {
  readonly kind = "ollama";

  constructor(private readonly config: ProviderConfig) {}

  async distillBundle(
    request: ProviderBundleDistillationRequest
  ): Promise<ProviderBundleDistillationResponse> {
    const kind = contentKindFor(request.profileType);
    const response = await this.generatePrompt([
      ...kind.distillFocus,
      "Return JSON only with fields: summary, voiceRules, stableLexicalMarkers, topicSpecificLexicalMarkers, rhetoricalDevices, antiPatterns, preferredOpenings, preferredClosings, confidenceNotes.",
      "",
      JSON.stringify(request, null, 2)
    ].join("\n"), 0.2);

    return parseJson<ProviderBundleDistillationResponse>(response);
  }

  async rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse> {
    const response = await this.generatePrompt([
      buildVoicePrompt(request.profile),
      `Mode: ${request.mode}`,
      `Strictness: ${request.strictness}`,
      `Similarity score before rewrite: ${request.report.score}/100`,
      `Priority fixes: ${request.report.revisionPriorities.slice(0, 4).join("; ") || "None"}`,
      "Rewrite the following text in the target voice while preserving meaning.",
      "Return only the rewritten text.",
      "",
      request.inputText
    ].join("\n"), request.strictness);

    return {
      outputText: response.trim() || request.inputText,
      notes: [`Rewritten using Ollama model ${this.config.model}.`]
    };
  }

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    const kind = contentKindFor(request.profile.profileType);
    const response = await this.generatePrompt([
      buildVoicePrompt(request.profile),
      kind.generateInstruction.replace("{length}", request.length),
      `Write the final ${kind.artifactNoun} itself, not instructions.`,
      "",
      request.prompt
    ].join("\n"), request.strictness);

    return {
      outputText: response.trim() || request.prompt,
      notes: [`Generated using Ollama model ${this.config.model}.`]
    };
  }

  async critique(request: ProviderCritiqueRequest): Promise<ProviderCritiqueResponse> {
    const kind = contentKindFor(request.profile.profileType);
    const response = await this.generatePrompt([
      buildVoicePrompt(request.profile),
      "You are a strict critic of voice fidelity.",
      ...kind.critiquePriorities,
      "Return JSON only with fields: voiceStrengths, voiceDrifts, topicLeakage, meaningRisk, mandatoryFixes, optionalImprovements.",
      "",
      JSON.stringify(request, null, 2)
    ].join("\n"), 0.1);

    return parseJson<ProviderCritiqueResponse>(response);
  }

  async revise(request: ProviderRevisionRequest): Promise<ProviderRevisionResponse> {
    const response = await this.generatePrompt([
      buildVoicePrompt(request.profile),
      `Task type: ${request.taskType}`,
      "Revise the candidate using the critique.",
      "Apply every mandatory fix, then only the strongest optional improvements that help the voice without changing meaning.",
      "Return only the revised output.",
      "",
      JSON.stringify(
        {
          sourceText: request.sourceText,
          prompt: request.prompt,
          candidateText: request.candidateText,
          critique: request.critique
        },
        null,
        2
      )
    ].join("\n"), 0.2);

    return {
      outputText: response.trim() || request.candidateText,
      notes: [`Revised using Ollama model ${this.config.model}.`]
    };
  }

  private async generatePrompt(prompt: string, temperature: number): Promise<string> {
    if (!this.config.baseUrl || !this.config.model) {
      throw new ProviderConfigurationError("Ollama provider requires MY_VOICE_BASE_URL and MY_VOICE_MODEL.");
    }

    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: Math.max(0, Math.min(1, temperature))
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as { response?: string };
    return payload.response?.trim() ?? "";
  }
}

function buildVoicePrompt(profile: VoiceProfile): string {
  return [
    profile.compactPromptPack.systemSummary,
    ...profile.compactPromptPack.voiceRules.map((rule) => `Rule: ${rule}`),
    ...profile.compactPromptPack.antiPatterns.map((rule) => `Avoid: ${rule}`),
    ...profile.compactPromptPack.revisionChecklist.map((item) => `Checklist: ${item}`)
  ].join("\n");
}

function parseJson<T>(content: string): T {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? content;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Model did not return valid JSON content.");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
