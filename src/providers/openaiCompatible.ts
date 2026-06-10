import { ProviderConfigurationError } from "../domain/errors.js";
import type {
  ProviderConfig,
  ProviderGenerateRequest,
  ProviderGenerateResponse,
  ProviderRewriteRequest,
  ProviderRewriteResponse
} from "../domain/types.js";
import type { ModelProvider } from "./types.js";

function buildPrompt(request: ProviderRewriteRequest): { system: string; user: string } {
  return {
    system: [
      request.profile.compactPromptPack.systemSummary,
      "Follow the style guide exactly enough to shift flavor, but do not change meaning, facts, or intent.",
      ...request.profile.compactPromptPack.voiceRules.map((rule) => `Rule: ${rule}`),
      ...request.profile.compactPromptPack.antiPatterns.map((rule) => `Avoid: ${rule}`)
    ].join("\n"),
    user: [
      `Mode: ${request.mode}`,
      `Strictness: ${request.strictness}`,
      `Current similarity score: ${request.report.score}/100`,
      `Priority fixes: ${request.report.revisionPriorities.slice(0, 4).join("; ") || "None"}`,
      "Rewrite this text in the target voice.",
      "",
      request.inputText
    ].join("\n")
  };
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly kind = "openai-compatible";

  constructor(private readonly config: ProviderConfig) {}

  async rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse> {
    if (!this.config.baseUrl || !this.config.model) {
      throw new ProviderConfigurationError(
        "OpenAI-compatible provider requires MY_VOICE_BASE_URL and MY_VOICE_MODEL."
      );
    }

    const prompt = buildPrompt(request);
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: Math.max(0, Math.min(1, request.strictness)),
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible request failed with ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return {
      outputText: payload.choices?.[0]?.message?.content?.trim() ?? request.inputText,
      notes: [`Rewritten using model ${this.config.model}.`]
    };
  }

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
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
        temperature: Math.max(0, Math.min(1, request.strictness)),
        messages: [
          {
            role: "system",
            content: [
              request.profile.compactPromptPack.systemSummary,
              ...request.profile.compactPromptPack.voiceRules.map((rule) => `Rule: ${rule}`),
              ...request.profile.compactPromptPack.antiPatterns.map((rule) => `Avoid: ${rule}`)
            ].join("\n")
          },
          {
            role: "user",
            content: [
              `Generate ${request.length} original prose in the target voice.`,
              "Use the prompt as the content brief while preserving the profile's flavor and diction.",
              "",
              request.prompt
            ].join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible request failed with ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return {
      outputText: payload.choices?.[0]?.message?.content?.trim() ?? request.prompt,
      notes: [`Generated using model ${this.config.model}.`]
    };
  }
}
