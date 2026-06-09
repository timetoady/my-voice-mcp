import { loadConfig } from "./config.js";
import { startHttpServer } from "./http/server.js";
import { logger } from "./lib/logger.js";
import { VoiceService } from "./services/voiceService.js";
import { ProfileStore } from "./storage/profileStore.js";
import { startStdioServer } from "./stdio.js";

async function main() {
  const mode = (process.argv[2] ?? "stdio").toLowerCase();
  const config = loadConfig();
  const store = new ProfileStore(config.dataDir);
  const service = new VoiceService(config, store, logger);

  await store.ensureReady();

  if (mode === "http") {
    await startHttpServer(config, service, logger);
    return;
  }

  await startStdioServer(service);
}

main().catch((error) => {
  logger.error("startup.failed", {
    message: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
