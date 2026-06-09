import path from "node:path";
import { cwd } from "node:process";

import type { ProviderConfig, ProviderKind } from "./domain/types.js";

export interface AppConfig {
  dataDir: string;
  http: {
    host: string;
    port: number;
    bearerToken?: string;
    allowUnauthenticatedLocalhost: boolean;
  };
  sourceLimits: {
    maxChars: number;
    maxTokens: number;
  };
  defaultProvider: ProviderConfig;
}

function parseProviderKind(value: string | undefined): ProviderKind {
  switch (value) {
    case "ollama":
    case "openai-compatible":
    case "bedrock":
    case "none":
    case undefined:
    case "":
      return (value as ProviderKind | undefined) ?? "none";
    default:
      return "none";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(cwd(), env.MY_VOICE_DATA_DIR ?? "./profiles");

  return {
    dataDir,
    http: {
      host: env.MY_VOICE_HOST ?? "0.0.0.0",
      port: Number.parseInt(env.MY_VOICE_PORT ?? "3000", 10),
      bearerToken: env.MY_VOICE_HTTP_BEARER_TOKEN || undefined,
      allowUnauthenticatedLocalhost:
        (env.MY_VOICE_HTTP_ALLOW_UNAUTH_LOCALHOST ?? "true").toLowerCase() === "true"
    },
    sourceLimits: {
      maxChars: Number.parseInt(env.MY_VOICE_MAX_SOURCE_CHARS ?? "120000", 10),
      maxTokens: Number.parseInt(env.MY_VOICE_MAX_SOURCE_TOKENS ?? "30000", 10)
    },
    defaultProvider: {
      kind: parseProviderKind(env.MY_VOICE_PROVIDER),
      model: env.MY_VOICE_MODEL,
      baseUrl: env.MY_VOICE_BASE_URL,
      apiKey: env.MY_VOICE_API_KEY,
      region: env.MY_VOICE_BEDROCK_REGION
    }
  };
}
