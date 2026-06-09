import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

import { ProviderConfigurationError } from "../domain/errors.js";
import type { ProviderConfig, ProviderRewriteRequest, ProviderRewriteResponse } from "../domain/types.js";
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

  async rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse> {
    const prompt = [
      request.profile.compactPromptPack.systemSummary,
      `Mode: ${request.mode}`,
      `Strictness: ${request.strictness}`,
      `Priority fixes: ${request.report.revisionPriorities.slice(0, 4).join("; ") || "None"}`,
      "Rewrite the following text in the target voice while preserving meaning.",
      "",
      request.inputText
    ].join("\n");

    const body = JSON.stringify({
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: 1200,
        temperature: Math.max(0, Math.min(1, request.strictness))
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

    const outputText =
      payload.results?.[0]?.outputText ?? payload.outputText ?? payload.generation ?? request.inputText;

    return {
      outputText: outputText.trim(),
      notes: [`Rewritten using Bedrock model ${this.config.model}.`]
    };
  }
}
