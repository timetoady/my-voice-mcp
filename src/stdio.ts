import { StdioServerTransport } from "@modelcontextprotocol/server";

import type { VoiceService } from "./services/voiceService.js";
import { buildMcpServer } from "./mcp/server.js";

export async function startStdioServer(service: VoiceService): Promise<void> {
  const server = buildMcpServer(service);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
