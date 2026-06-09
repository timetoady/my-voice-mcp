import type { ProviderConfig } from "../domain/types.js";
import { BedrockProvider } from "./bedrock.js";
import { HeuristicProvider } from "./heuristic.js";
import { OllamaProvider } from "./ollama.js";
import { OpenAICompatibleProvider } from "./openaiCompatible.js";
import type { ModelProvider } from "./types.js";

export function createProvider(config: ProviderConfig): ModelProvider {
  switch (config.kind) {
    case "ollama":
      return new OllamaProvider(config);
    case "openai-compatible":
      return new OpenAICompatibleProvider(config);
    case "bedrock":
      return new BedrockProvider(config);
    case "none":
    default:
      return new HeuristicProvider();
  }
}
