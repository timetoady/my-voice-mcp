import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.js";
import { VoiceService } from "../src/services/voiceService.js";
import { ProfileStore } from "../src/storage/profileStore.js";
import { createBlankPdf, createTextPdf } from "./helpers/pdfFactory.js";

async function buildService() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "my-voice-mcp-"));
  const config = loadConfig({
    MY_VOICE_DATA_DIR: tempDir,
    MY_VOICE_PROVIDER: "none",
    MY_VOICE_HTTP_ALLOW_UNAUTH_LOCALHOST: "true"
  });
  const store = new ProfileStore(config.dataDir);
  await store.ensureReady();
  return { service: new VoiceService(config, store), tempDir };
}

test("creates a stable voice profile from a text PDF", async () => {
  const { service, tempDir } = await buildService();
  const pdfPath = path.join(tempDir, "sample.pdf");
  const pdf = await createTextPdf([
    "I write in patient, vivid sentences that take their time before they land.",
    "Sometimes the thought bends, then clarifies, with a gentle insistence.",
    "The result should feel descriptive, deliberate, and a little reflective."
  ]);

  await writeFile(pdfPath, pdf);

  const result = await service.createProfile({
    voiceName: "Reflective",
    pdfPath,
    description: "Test profile"
  });

  assert.equal(result.profile.voiceName, "Reflective");
  assert.ok(result.profile.lexicalMarkers.length > 0);
  assert.match(result.guideMarkdown, /Voice rules/);
});

test("rejects scanned or image-only PDFs", async () => {
  const { service, tempDir } = await buildService();
  const pdfPath = path.join(tempDir, "blank.pdf");
  await writeFile(pdfPath, await createBlankPdf());

  const validation = await service.validateSource(pdfPath);
  assert.equal(validation.supported, false);
  assert.match(validation.reason ?? "", /No extractable text/);
});

test("rejects oversized sources", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "my-voice-mcp-"));
  const config = loadConfig({
    MY_VOICE_DATA_DIR: tempDir,
    MY_VOICE_PROVIDER: "none",
    MY_VOICE_MAX_SOURCE_CHARS: "250",
    MY_VOICE_MAX_SOURCE_TOKENS: "100"
  });
  const store = new ProfileStore(config.dataDir);
  await store.ensureReady();
  const service = new VoiceService(config, store);
  const pdfPath = path.join(tempDir, "large.pdf");
  const pdf = await createTextPdf(
    Array.from({ length: 30 }, () => "This sentence keeps expanding the sample until it pushes beyond the configured limit.")
  );
  await writeFile(pdfPath, pdf);

  await assert.rejects(
    service.createProfile({ voiceName: "Large", pdfPath }),
    /too large/
  );
});

test("scores similar text above dissimilar text", async () => {
  const { service, tempDir } = await buildService();
  const pdfPath = path.join(tempDir, "voice.pdf");
  const pdf = await createTextPdf([
    "The note stays measured, thoughtful, and quietly direct.",
    "It keeps its balance even while turning inward.",
    "Nothing shouts, but the cadence remains unmistakably intentional."
  ]);
  await writeFile(pdfPath, pdf);
  const profile = await service.createProfile({ voiceName: "Measured", pdfPath });

  const similar = await service.compareText({
    voiceId: profile.profile.voiceId,
    text: "The paragraph stays measured and thoughtful, quietly direct even as it turns inward."
  });
  const dissimilar = await service.compareText({
    voiceId: profile.profile.voiceId,
    text: "Buy now! This is the fastest, loudest, most explosive update ever."
  });

  assert.ok(similar.similarity.score > dissimilar.similarity.score);
});

test("rewrites text in each mode and improves or preserves similarity", async () => {
  const { service, tempDir } = await buildService();
  const pdfPath = path.join(tempDir, "voice.pdf");
  const pdf = await createTextPdf([
    "The prose is calm, descriptive, and lightly formal.",
    "It stretches the sentence just enough to hold a secondary thought.",
    "Every shift is deliberate rather than flashy."
  ]);
  await writeFile(pdfPath, pdf);
  const profile = await service.createProfile({ voiceName: "Calm", pdfPath });

  for (const mode of ["rewrite", "hint", "snippet"] as const) {
    const result = await service.rewriteText({
      voiceId: profile.profile.voiceId,
      text: "We need to send the update quickly and keep it clear.",
      mode
    });

    assert.ok(result.outputText.length > 0);
    assert.ok(result.similarityAfterEstimate.score >= result.similarityBefore.score || mode === "snippet");
  }
});

test("generates new content in a selected voice", async () => {
  const { service, tempDir } = await buildService();
  const pdfPath = path.join(tempDir, "voice.pdf");
  const pdf = await createTextPdf([
    "The prose is calm, descriptive, and lightly formal.",
    "It stretches the sentence just enough to hold a secondary thought.",
    "Every shift is deliberate rather than flashy."
  ]);
  await writeFile(pdfPath, pdf);
  const profile = await service.createProfile({ voiceName: "Calm", pdfPath });

  const result = await service.generateText({
    voiceId: profile.profile.voiceId,
    prompt: "Write a short welcome note for a thoughtful newsletter audience.",
    length: "short"
  });

  assert.ok(result.outputText.length > 0);
  assert.ok(result.similarityEstimate.score > 0);
});
