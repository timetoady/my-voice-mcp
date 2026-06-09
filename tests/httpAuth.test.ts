import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadConfig } from "../src/config.js";
import { startHttpServer } from "../src/http/server.js";
import { VoiceService } from "../src/services/voiceService.js";
import { ProfileStore } from "../src/storage/profileStore.js";

test("http server rejects missing bearer token when localhost bypass is disabled", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "my-voice-mcp-http-"));
  const config = loadConfig({
    MY_VOICE_DATA_DIR: tempDir,
    MY_VOICE_PROVIDER: "none",
    MY_VOICE_HTTP_ALLOW_UNAUTH_LOCALHOST: "false",
    MY_VOICE_HTTP_BEARER_TOKEN: "secret",
    MY_VOICE_PORT: "39123",
    MY_VOICE_HOST: "127.0.0.1"
  });
  const store = new ProfileStore(config.dataDir);
  await store.ensureReady();
  const service = new VoiceService(config, store);

  const server = await startHttpServer(config, service);

  await new Promise((resolve) => setTimeout(resolve, 250));

  try {
    const response = await fetch("http://127.0.0.1:39123/mcp", {
      method: "POST"
    });

    assert.equal(response.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
