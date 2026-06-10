import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

import { ProviderConfigurationError } from "../domain/errors.js";
import type {
  ProviderConfig,
  ProviderCritiqueRequest,
  ProviderCritiqueResponse,
  ProviderEmailBundleDistillationRequest,
  ProviderEmailBundleDistillationResponse,
  ProviderGenerateRequest,
  ProviderGenerateResponse,
  ProviderRevisionRequest,
  ProviderRevisionResponse,
  ProviderRewriteRequest,
  ProviderRewriteResponse,
  VoiceProfile
} from "../domain/types.js";
import type { ModelProvider } from "./types.js";

export class BedrockProvider implements ModelProvider {
  readonly kind = "bedrock";
  private readonly client: BedrockRuntimeClient;

  constructor(private readonly config: ProviderConfig) {
    if (!config.region || !config.model) {
      throw new ProviderConfigurationError("Bedrock provider requires MY_VOICE_BEDROCK_REGION and MY_VOICE_MODEL.");
    }

    this.client = new BedrockRuntimeClient({ region: config.region });
  }

  async distillEmailBundle(
    request: ProviderEmailBundleDistillationRequest
  ): Promise<ProviderEmailBundleDistillationResponse> {
    const response = await this.invoke([
      "You distill a formal email voice profile from multiple normalized samples.",
      "Return JSON only with fields: summary, voiceRules, stableLexicalMarkers, topicSpecificLexicalMarkers, rhetoricalDevices, antiPatterns, preferredOpenings, preferredClosings, confidenceNotes.",
      "Find cross-sample commonalities and avoid topic overfitting.",
      "",
      JSON.stringify(request, null, 2)
    ].join("\n"), 1200, 0.2);

    return parseJson<ProviderEmailBundleDistillationResponse>(response);
  }

  async rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse> {
    const response = await this.invoke([
      buildVoicePrompt(request.profile),
      `Mode: ${request.mode}`,
      `Strictness: ${request.strictness}`,
      `Priority fixes: ${request.report.revisionPriorities.slice(0, 4).join("; ") || "None"}`,
      "Rewrite the following text in the target voice while preserving meaning.",
      "Return only the rewritten output.",
      "",
      request.inputText
    ].join("\n"), 1200, request.strictness);

    return {
      outputText: response.trim() || request.inputText,
      notes: [`Rewritten using Bedrock model ${this.config.model}.`]
    };
  }

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    const maxTokenCount = request.length === "long" ? 1400 : request.length === "medium" ? 900 : 500;
    const response = await this.invoke([
      buildVoicePrompt(request.profile),
      `Generate a ${request.length} email draft in the target voice from this brief.`,
      "Write the final draft itself, not instructions.",
      "",
      request.prompt
    ].join("\n"), maxTokenCount, request.strictness);

    return {
      outputText: response.trim() || request.prompt,
      notes: [`Generated using Bedrock model ${this.config.model}.`]
    };
  }

  async critique(request: ProviderCritiqueRequest): Promise<ProviderCritiqueResponse> {
    const response = await this.invoke([
      buildVoicePrompt(request.profile),
      "You are a strict critic of voice fidelity and professional polish.",
      "Return JSON only with fields: voiceStrengths, voiceDrifts, topicLeakage, meaningRisk, mandatoryFixes, optionalImprovements.",
      "",
      JSON.stringify(request, null, 2)
    ].join("\n"), 900, 0.1);

    return parseJson<ProviderCritiqueResponse>(response);
  }

  async revise(request: ProviderRevisionRequest): Promise<ProviderRevisionResponse> {
    const response = await this.invoke([
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
    ].join("\n"), 1200, 0.2);

    return {
      outputText: response.trim() || request.candidateText,
      notes: [`Revised using Bedrock model ${this.config.model}.`]
    };
  }

  private async invoke(prompt: string, maxTokenCount: number, temperature: number): Promise<string> {
    const body = JSON.stringify({
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount,
        temperature: Math.max(0, Math.min(1, temperature))
      }
    });

    const response = await this.client.send(
      new InvokeModelCommand({
        modelId: this.config.model,
        contentType: "application/json",
        accept: "application/json",
        body
      })
    );

    const payload = JSON.parse(new TextDecoder().decode(response.body)) as {
      results?: Array<{ outputText?: string }>;
      outputText?: string;
      generation?: string;
    };

    return (payload.results?.[0]?.outputText ?? payload.outputText ?? payload.generation ?? "").trim();
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
