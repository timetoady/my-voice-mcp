import { ProviderConfigurationError } from "../domain/errors.js";
import type { ProviderConfig, ProviderRewriteRequest, ProviderRewriteResponse } from "../domain/types.js";
import type { ModelProvider } from "./types.js";

export class OllamaProvider implements ModelProvider {
  readonly kind = "ollama";

  constructor(private readonly config: ProviderConfig) {}

  async rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse> {
    if (!this.config.baseUrl || !this.config.model) {
      throw new ProviderConfigurationError("Ollama provider requires MY_VOICE_BASE_URL and MY_VOICE_MODEL.");
    }

    const prompt = [
      request.profile.compactPromptPack.systemSummary,
      ...request.profile.compactPromptPack.voiceRules.map((rule) => `Rule: ${rule}`),
      ...request.profile.compactPromptPack.antiPatterns.map((rule) => `Avoid: ${rule}`),
      `Mode: ${request.mode}`,
      `Strictness: ${request.strictness}`,
      `Similarity score before rewrite: ${request.report.score}/100`,
      `Priority fixes: ${request.report.revisionPriorities.slice(0, 4).join("; ") || "None"}`,
      "",
      request.inputText
    ].join("\n");

    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as { response?: string };
    return {
      outputText: payload.response?.trim() ?? request.inputText,
      notes: [`Rewritten using Ollama model ${this.config.model}.`]
    };
  }
}
