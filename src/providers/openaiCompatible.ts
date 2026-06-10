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
  ProviderRewriteResponse
} from "../domain/types.js";
import type { ModelProvider } from "./types.js";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly kind = "openai-compatible";

  constructor(private readonly config: ProviderConfig) {}

  async distillEmailBundle(
    request: ProviderEmailBundleDistillationRequest
  ): Promise<ProviderEmailBundleDistillationResponse> {
    const content = await this.completeJson([
      {
        role: "system",
        content: [
          "You distill a formal email voice profile from multiple normalized samples.",
          "Find cross-sample commonalities and avoid overfitting to project-specific nouns.",
          "Return JSON only."
        ].join("\n")
      },
      {
        role: "user",
        content: [
          "Create a compact voice profile for profileType=email-formal.",
          "Required JSON fields: summary, voiceRules, stableLexicalMarkers, topicSpecificLexicalMarkers, rhetoricalDevices, antiPatterns, preferredOpenings, preferredClosings, confidenceNotes.",
          "Keep arrays short and specific. Voice rules should be durable across unrelated work emails.",
          "",
          JSON.stringify(request, null, 2)
        ].join("\n")
      }
    ], 0.2);

    return parseJson<ProviderEmailBundleDistillationResponse>(content);
  }

  async rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse> {
    const content = await this.completeText([
      {
        role: "system",
        content: buildVoiceSystemPrompt(request.profile)
      },
      {
        role: "user",
        content: [
          `Mode: ${request.mode}`,
          `Strictness: ${request.strictness}`,
          `Current similarity score: ${request.report.score}/100`,
          `Priority fixes: ${request.report.revisionPriorities.slice(0, 4).join("; ") || "None"}`,
          "Rewrite the text in the target voice while preserving meaning, factual content, and intent.",
          "Return only the rewritten result."
        ].join("\n")
      },
      {
        role: "user",
        content: request.inputText
      }
    ], Math.max(0, Math.min(1, request.strictness)));

    return {
      outputText: content.trim() || request.inputText,
      notes: [`Rewritten using model ${this.config.model}.`]
    };
  }

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    const content = await this.completeText([
      {
        role: "system",
        content: buildVoiceSystemPrompt(request.profile)
      },
      {
        role: "user",
        content: [
          `Generate a ${request.length} email draft in the target voice.`,
          "Write the final draft itself, not instructions about how to write it.",
          "Keep the result polished and coherent.",
          "",
          request.prompt
        ].join("\n")
      }
    ], Math.max(0, Math.min(1, request.strictness)));

    return {
      outputText: content.trim() || request.prompt,
      notes: [`Generated using model ${this.config.model}.`]
    };
  }

  async critique(request: ProviderCritiqueRequest): Promise<ProviderCritiqueResponse> {
    const content = await this.completeJson([
      {
        role: "system",
        content: [
          "You are a strict writing critic evaluating voice fidelity.",
          "Return JSON only.",
          "For rewrites prioritize meaning preservation, tone fidelity, and reduction of generic assistant phrasing.",
          "For generation prioritize voice fidelity, coherence, and whether the result sounds like an actual email draft."
        ].join("\n")
      },
      {
        role: "user",
        content: [
          "Required JSON fields: voiceStrengths, voiceDrifts, topicLeakage, meaningRisk, mandatoryFixes, optionalImprovements.",
          "Use short concrete phrases in the arrays.",
          "",
          JSON.stringify(request, null, 2)
        ].join("\n")
      }
    ], 0.1);

    return parseJson<ProviderCritiqueResponse>(content);
  }

  async revise(request: ProviderRevisionRequest): Promise<ProviderRevisionResponse> {
    const content = await this.completeText([
      {
        role: "system",
        content: buildVoiceSystemPrompt(request.profile)
      },
      {
        role: "user",
        content: [
          `Task type: ${request.taskType}`,
          "Revise the candidate using the critique.",
          "Apply every mandatory fix.",
          "Use optional improvements only when they strengthen the voice without changing meaning or adding unsupported detail.",
          "Return only the revised output.",
          "",
          JSON.stringify({
            sourceText: request.sourceText,
            prompt: request.prompt,
            candidateText: request.candidateText,
            critique: request.critique
          }, null, 2)
        ].join("\n")
      }
    ], 0.2);

    return {
      outputText: content.trim() || request.candidateText,
      notes: [`Revised using model ${this.config.model}.`]
    };
  }

  private async completeText(messages: ChatMessage[], temperature: number): Promise<string> {
    const payload = await this.requestChat(messages, temperature);
    return payload.choices?.[0]?.message?.content?.trim() ?? "";
  }

  private async completeJson(messages: ChatMessage[], temperature: number): Promise<string> {
    return this.completeText(messages, temperature);
  }

  private async requestChat(messages: ChatMessage[], temperature: number) {
    if (!this.config.baseUrl || !this.config.model) {
      throw new ProviderConfigurationError(
        "OpenAI-compatible provider requires MY_VOICE_BASE_URL and MY_VOICE_MODEL."
      );
    }

    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature,
        messages
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible request failed with ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
  }
}

function buildVoiceSystemPrompt(profile: ProviderRewriteRequest["profile"]): string {
  return [
    profile.compactPromptPack.systemSummary,
    "Shift diction, rhythm, and tone toward the profile while keeping the content trustworthy and readable.",
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
