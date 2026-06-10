import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { VoiceService } from "../services/voiceService.js";
import type { ProviderConfig } from "../domain/types.js";

const providerOverrideSchema = z
  .object({
    kind: z.enum(["none", "ollama", "openai-compatible", "bedrock"]),
    model: z.string().optional(),
    baseUrl: z.string().url().optional(),
    apiKey: z.string().optional(),
    region: z.string().optional()
  })
  .optional();

function serializeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function textContent(text: string) {
  return {
    content: [{ type: "text" as const, text }]
  };
}

export function buildMcpServer(service: VoiceService): McpServer {
  const server = new McpServer({
    name: "my-voice-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "voice_create_profile",
    {
      title: "Create Voice Profile",
      description: "Create a compact style guide from a local PDF sample.",
      inputSchema: z.object({
        voiceName: z.string().min(1),
        pdfPath: z.string().min(1),
        description: z.string().optional(),
        providerOverride: providerOverrideSchema
      })
    },
    async ({ voiceName, pdfPath, description, providerOverride }) => {
      const result = await service.createProfile({
        voiceName,
        pdfPath,
        description,
        providerOverride: providerOverride as ProviderConfig | undefined
      });
      return textContent(
        serializeJson({
          voiceId: result.profile.voiceId,
          voiceName: result.profile.voiceName,
          summary: result.profile.summary,
          warnings: result.profile.warnings,
          sourceStats: result.profile.sourceStats
        })
      );
    }
  );

  server.registerTool(
    "voice_list_profiles",
    {
      title: "List Voice Profiles",
      description: "List available voice profiles."
    },
    async () => textContent(serializeJson(await service.listProfiles()))
  );

  server.registerTool(
    "voice_get_profile",
    {
      title: "Get Voice Profile",
      description: "Fetch summary details for one voice profile.",
      inputSchema: z.object({
        voiceId: z.string().min(1)
      })
    },
    async ({ voiceId }) => textContent(serializeJson(await service.getProfile(voiceId)))
  );

  server.registerTool(
    "voice_compare_text",
    {
      title: "Compare Text To Voice",
      description: "Score how closely a text matches the selected voice profile.",
      inputSchema: z.object({
        voiceId: z.string().min(1),
        text: z.string().min(1)
      })
    },
    async ({ voiceId, text }) => {
      const result = await service.compareText({ voiceId, text });
      return textContent(
        serializeJson({
          score: result.similarity.score,
          matchedTraits: result.similarity.matchedTraits,
          driftTraits: result.similarity.driftTraits,
          revisionPriorities: result.similarity.revisionPriorities,
          perDimensionScores: result.similarity.perDimensionScores
        })
      );
    }
  );

  server.registerTool(
    "voice_rewrite_text",
    {
      title: "Rewrite In Voice",
      description: "Rewrite or guide text toward the selected voice profile.",
      inputSchema: z.object({
        voiceId: z.string().min(1),
        text: z.string().min(1),
        mode: z.enum(["rewrite", "hint", "snippet"]),
        strictness: z.number().min(0).max(1).optional(),
        providerOverride: providerOverrideSchema
      })
    },
    async ({ voiceId, text, mode, strictness, providerOverride }) => {
      const result = await service.rewriteText({
        voiceId,
        text,
        mode,
        strictness,
        providerOverride: providerOverride as ProviderConfig | undefined
      });
      return textContent(
        serializeJson({
          mode: result.mode,
          providerUsed: result.providerUsed,
          similarityBefore: result.similarityBefore.score,
          similarityAfterEstimate: result.similarityAfterEstimate.score,
          notes: result.notes,
          outputText: result.outputText
        })
      );
    }
  );

  server.registerTool(
    "voice_generate_text",
    {
      title: "Generate In Voice",
      description: "Generate original content from a prompt in the selected voice profile.",
      inputSchema: z.object({
        voiceId: z.string().min(1),
        prompt: z.string().min(1),
        length: z.enum(["short", "medium", "long"]).optional(),
        strictness: z.number().min(0).max(1).optional(),
        providerOverride: providerOverrideSchema
      })
    },
    async ({ voiceId, prompt, length, strictness, providerOverride }) => {
      const result = await service.generateText({
        voiceId,
        prompt,
        length,
        strictness,
        providerOverride: providerOverride as ProviderConfig | undefined
      });
      return textContent(
        serializeJson({
          providerUsed: result.providerUsed,
          length: result.length,
          similarityEstimate: result.similarityEstimate.score,
          notes: result.notes,
          outputText: result.outputText
        })
      );
    }
  );

  server.registerTool(
    "voice_delete_profile",
    {
      title: "Delete Voice Profile",
      description: "Delete a stored voice profile.",
      inputSchema: z.object({
        voiceId: z.string().min(1)
      })
    },
    async ({ voiceId }) => {
      await service.deleteProfile(voiceId);
      return textContent(serializeJson({ voiceId, deleted: true }));
    }
  );

  server.registerTool(
    "voice_validate_source",
    {
      title: "Validate Voice Source",
      description: "Validate whether a local PDF source is supported.",
      inputSchema: z.object({
        pdfPath: z.string().min(1)
      })
    },
    async ({ pdfPath }) => textContent(serializeJson(await service.validateSource(pdfPath)))
  );

  server.registerResource(
    "voice-profiles",
    "voice://profiles",
    {
      title: "Voice Profiles",
      description: "List of available voice profiles.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: serializeJson(await service.listProfiles())
        }
      ]
    })
  );

  server.registerResource(
    "voice-profile-summary",
    new ResourceTemplate("voice://profiles/{voiceId}/summary", {
      list: async () => ({
        resources: (await service.listProfiles()).map((profile) => ({
          uri: `voice://profiles/${profile.voiceId}/summary`,
          name: profile.voiceName
        }))
      })
    }),
    {
      title: "Voice Profile Summary",
      description: "JSON summary for a single voice profile.",
      mimeType: "application/json"
    },
    async (uri, params) => ({
      contents: [
        {
          uri: uri.href,
          text: serializeJson(await service.getProfile(String(params.voiceId)))
        }
      ]
    })
  );

  server.registerResource(
    "voice-profile-guide",
    new ResourceTemplate("voice://profiles/{voiceId}/guide", {
      list: async () => ({
        resources: (await service.listProfiles()).map((profile) => ({
          uri: `voice://profiles/${profile.voiceId}/guide`,
          name: `${profile.voiceName} guide`
        }))
      })
    }),
    {
      title: "Voice Profile Guide",
      description: "Human-readable markdown guide for a voice profile.",
      mimeType: "text/markdown"
    },
    async (uri, params) => {
      const assets = await service.getProfileAssets(String(params.voiceId));
      return {
        contents: [
          {
            uri: uri.href,
            text: assets.guideMarkdown
          }
        ]
      };
    }
  );

  server.registerResource(
    "voice-profile-metrics",
    new ResourceTemplate("voice://profiles/{voiceId}/metrics", {
      list: async () => ({
        resources: (await service.listProfiles()).map((profile) => ({
          uri: `voice://profiles/${profile.voiceId}/metrics`,
          name: `${profile.voiceName} metrics`
        }))
      })
    }),
    {
      title: "Voice Profile Metrics",
      description: "Structured style and source metrics for a voice profile.",
      mimeType: "application/json"
    },
    async (uri, params) => {
      const profile = await service.getProfile(String(params.voiceId));
      return {
        contents: [
          {
            uri: uri.href,
            text: serializeJson({
              sourceStats: profile.sourceStats,
              styleDimensions: profile.styleDimensions,
              structurePatterns: profile.structurePatterns,
              lexicalMarkers: profile.lexicalMarkers,
              rhetoricalDevices: profile.rhetoricalDevices
            })
          }
        ]
      };
    }
  );

  return server;
}
