import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";

import type { AppConfig } from "../config.js";
import { logger, type Logger } from "../lib/logger.js";
import type { VoiceService } from "../services/voiceService.js";
import { buildMcpServer } from "../mcp/server.js";

function unauthorized(response: ServerResponse, message: string) {
  response.statusCode = 401;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ error: message }));
}

function isLocalRequest(request: IncomingMessage): boolean {
  const remoteAddress = request.socket.remoteAddress ?? "";
  return remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
}

function isAuthorized(request: IncomingMessage, config: AppConfig): boolean {
  if (config.http.allowUnauthenticatedLocalhost && isLocalRequest(request)) {
    return true;
  }

  if (!config.http.bearerToken) {
    return false;
  }

  const authorization = request.headers.authorization;
  return authorization === `Bearer ${config.http.bearerToken}`;
}

export async function startHttpServer(
  config: AppConfig,
  service: VoiceService,
  appLogger: Logger = logger
): Promise<import("node:http").Server> {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "GET" && url.pathname === "/healthz") {
        response.statusCode = 200;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ ok: true, timestamp: new Date().toISOString() }));
        return;
      }

      if (request.method === "OPTIONS" && url.pathname === "/mcp") {
        response.statusCode = 204;
        response.end();
        return;
      }

      if (request.method === "POST" && url.pathname === "/mcp") {
        if (!isAuthorized(request, config)) {
          unauthorized(response, "Missing or invalid bearer token.");
          return;
        }

        const transport = new NodeStreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID()
        });
        const mcpServer = buildMcpServer(service);
        await mcpServer.connect(transport);

        response.on("close", () => {
          transport.close().catch(() => undefined);
        });

        await transport.handleRequest(request, response);
        return;
      }

      response.statusCode = 404;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      appLogger.error("http.request.failed", {
        message: error instanceof Error ? error.message : String(error)
      });
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: "Internal server error" }));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(config.http.port, config.http.host, () => {
      appLogger.info("http.server.started", {
        host: config.http.host,
        port: config.http.port
      });
      resolve();
    });
  });

  return server;
}
