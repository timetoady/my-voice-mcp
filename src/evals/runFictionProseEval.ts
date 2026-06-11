import path from "node:path";

import { loadConfig } from "../config.js";
import { runFictionProseEvaluation } from "./fictionProse.js";
import { logger } from "../lib/logger.js";
import { VoiceService } from "../services/voiceService.js";
import { ProfileStore } from "../storage/profileStore.js";

async function main() {
  const repoRoot = process.cwd();
  const config = loadConfig();
  const store = new ProfileStore(config.dataDir);
  const service = new VoiceService(config, store, logger);

  await store.ensureReady();

  const fixtureDir = path.join(repoRoot, "evals", "fiction-prose");
  const outputDir = path.join(fixtureDir, "output");
  const result = await runFictionProseEvaluation({
    service,
    fixtureDir,
    outputDir
  });

  console.log(JSON.stringify({
    ok: true,
    reportPath: result.markdownPath,
    jsonPath: result.jsonPath,
    voiceId: result.report.profile.voiceId
  }, null, 2));
}

main().catch((error) => {
  logger.error("eval.fiction_prose.failed", {
    message: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
