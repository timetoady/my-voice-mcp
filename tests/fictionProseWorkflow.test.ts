import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { analyzeFictionBundle, normalizeFictionSample } from "../src/analysis/fiction.js";
import { narrativeSnapshot } from "../src/analysis/narrative.js";
import { loadConfig } from "../src/config.js";
import { runFictionProseEvaluation } from "../src/evals/fictionProse.js";
import type {
  ProviderBundleDistillationRequest,
  ProviderBundleDistillationResponse,
  ProviderCritiqueRequest,
  ProviderCritiqueResponse,
  ProviderGenerateRequest,
  ProviderGenerateResponse,
  ProviderRevisionRequest,
  ProviderRevisionResponse,
  ProviderRewriteRequest,
  ProviderRewriteResponse
} from "../src/domain/types.js";
import { VoiceService } from "../src/services/voiceService.js";
import { ProfileStore } from "../src/storage/profileStore.js";
import type { ModelProvider } from "../src/providers/types.js";

const silentLogger = {
  info() {},
  warn() {},
  error() {}
};

class MockFictionProvider implements ModelProvider {
  readonly kind = "openai-compatible";

  async distillBundle(
    request: ProviderBundleDistillationRequest
  ): Promise<ProviderBundleDistillationResponse> {
    return {
      summary:
        "a close third-person narrative voice that holds a measured narration distance, paces description against short reflective beats, and lets dialogue stay sparse and purposeful",
      voiceRules: [
        "Hold a consistent close third-person point of view at a measured narration distance.",
        "Alternate longer descriptive paragraphs with shorter reflective beats.",
        "Keep dialogue sparse and purposeful, and close on a quiet observation."
      ],
      stableLexicalMarkers: request.stableLexicalMarkers.slice(0, 6),
      topicSpecificLexicalMarkers: request.topicSpecificLexicalMarkers.slice(0, 6),
      rhetoricalDevices: ["sensory anchoring", "reflective closing"],
      antiPatterns: ["Do not flatten narration distance.", "Do not pile on adjectives in place of style."],
      preferredOpenings: request.narrativeMetrics?.recurringOpeners.slice(0, 3) ?? ["By", "When"],
      preferredClosings: [],
      confidenceNotes: ["Strongest confidence comes from recurring syntactic habits across the excerpts."]
    };
  }

  async rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse> {
    return {
      outputText: `By the time it was done, the room had gone quiet. ${request.inputText.trim()}`,
      notes: ["Mock fiction draft pass completed."]
    };
  }

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    return {
      outputText: [
        "By the time she reached the harbor, the light had already begun to go.",
        "",
        "She stood at the edge of the water and did not say the things she had come to say. The boats knocked softly at their moorings, and the cold came up off the stones, and she let it."
      ].join("\n"),
      notes: ["Mock fiction generation pass completed."]
    };
  }

  async critique(_request: ProviderCritiqueRequest): Promise<ProviderCritiqueResponse> {
    return {
      voiceStrengths: ["measured narration distance", "restrained description"],
      voiceDrifts: ["opening beat could settle sooner"],
      topicLeakage: [],
      meaningRisk: "Low",
      mandatoryFixes: ["Hold the point of view.", "Keep the closing quiet."],
      optionalImprovements: ["Vary one paragraph length for pacing contrast."]
    };
  }

  async revise(request: ProviderRevisionRequest): Promise<ProviderRevisionResponse> {
    return {
      outputText: `${request.candidateText}\n\nShe turned back toward the town, and did not look at the water again.`,
      notes: ["Mock fiction revision pass completed."]
    };
  }
}

async function buildService(providerFactory?: () => ModelProvider) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "my-voice-mcp-fiction-"));
  const config = loadConfig({
    MY_VOICE_DATA_DIR: tempDir,
    MY_VOICE_PROVIDER: providerFactory ? "openai-compatible" : "none",
    MY_VOICE_BASE_URL: "http://example.test",
    MY_VOICE_MODEL: "mock-model"
  });
  const store = new ProfileStore(config.dataDir);
  await store.ensureReady();
  const service = new VoiceService(
    config,
    store,
    silentLogger,
    providerFactory ? () => providerFactory() : undefined
  );

  return { service, tempDir };
}

function sampleBundleTexts() {
  return [
    {
      label: "the keeper",
      text: [
        "By the time the light came on, the fog had already taken the harbor. Halloran stood at the window with his hands around a cold cup and watched the grey close over the water.",
        "",
        '"You\'ll wear a hole in that floor," his wife said from the doorway.',
        "",
        "He knew the boats were still out there. He could not see them, but he knew, the way he knew the stairs in the dark. The light turned, and turned, and laid its long arm across the fog."
      ].join("\n")
    },
    {
      label: "the clockmaker",
      text: [
        "When the last customer had gone, Vesna locked the door and let the shop fall quiet around her. It was never truly quiet, but the human noise was gone, and that was close enough.",
        "",
        "She sat at the bench with the small brass movement open before her and waited for her hands to remember what her eyes could barely follow. The trick was not to look too hard.",
        "",
        "Outside, the light had gone amber against the windows. She wound the clock and reached for her coat."
      ].join("\n")
    },
    {
      label: "the teacher",
      text: [
        "By the second week of term, Mr. Adeyemi had learned all their names, and most of their silences. The names were the easy part.",
        "",
        '"Good question," Adeyemi said, and moved on quickly, because he knew that too much attention could close a door as surely as too little.',
        "",
        "At the end of the day he stood among the empty desks and listened to the building tick and cool around him. There were worse things than to be the one who waited."
      ].join("\n")
    }
  ];
}

test("fiction normalization preserves paragraphs and dialogue while stripping scaffolding", () => {
  const sample = normalizeFictionSample({
    label: "scene",
    sourceKind: "text",
    sourceType: "text",
    extractedText: [
      "Chapter One",
      "",
      "12",
      "",
      "By the time the light came on, the fog had already taken the harbor.",
      "",
      "* * *",
      "",
      '"You\'ll wear a hole in that floor," she said from the doorway.'
    ].join("\n")
  });

  assert.equal(sample.normalizedText.includes("Chapter One"), false);
  assert.equal(/(^|\n)12(\n|$)/.test(sample.normalizedText), false);
  assert.equal(sample.normalizedText.includes("* * *"), false);
  assert.match(sample.normalizedText, /By the time the light came on/);
  assert.match(sample.normalizedText, /wear a hole in that floor/);
  // Two surviving paragraphs keep their blank-line break.
  assert.ok(sample.normalizedText.includes("\n\n"));
  assert.ok(sample.notes.length >= 1);
});

test("fiction normalization strips true headings but preserves prose that begins with a heading word", () => {
  const sample = normalizeFictionSample({
    label: "scene",
    sourceKind: "text",
    sourceType: "text",
    extractedText: [
      "Chapter One",
      "",
      "PROLOGUE",
      "",
      "Part of her wanted to leave before the others woke.",
      "",
      "Section by section, the room gave up its warmth."
    ].join("\n")
  });

  assert.equal(sample.normalizedText.includes("Chapter One"), false);
  assert.equal(/(^|\n)PROLOGUE(\n|$)/.test(sample.normalizedText), false);
  assert.match(sample.normalizedText, /Part of her wanted to leave/);
  assert.match(sample.normalizedText, /Section by section, the room gave up its warmth/);
});

test("narration distance is directional: intimate first-person scores closer than distant third-person", () => {
  const intimate = narrativeSnapshot(
    "I felt the cold come up off the water. I knew I should turn back, but I wanted to stay. I remembered the way the light had looked, and I hoped it would come again."
  );
  const distant = narrativeSnapshot(
    "The committee reviewed the quarterly figures. The chairman noted the totals. The clerk recorded the vote. The doors were closed at noon and the building emptied."
  );

  assert.ok(
    intimate.narrationDistance < distant.narrationDistance,
    `expected intimate (${intimate.narrationDistance}) < distant (${distant.narrationDistance})`
  );
  assert.equal(intimate.pov, "first");
});

test("fiction bundle analysis separates stable voice from scene-specific nouns and computes narrative metrics", () => {
  const bundle = analyzeFictionBundle(
    sampleBundleTexts().map((item) =>
      normalizeFictionSample({
        label: item.label,
        sourceKind: "text",
        sourceType: "text",
        extractedText: item.text
      })
    )
  );

  assert.ok(bundle.narrativeMetrics);
  assert.ok(bundle.narrativeMetrics!.averageParagraphWords > 0);
  assert.ok(["first", "third", "mixed"].includes(bundle.narrativeMetrics!.pov));
  // Scene-specific proper nouns should not be promoted to stable voice markers.
  assert.equal(bundle.stableLexicalMarkers.includes("halloran"), false);
  assert.equal(bundle.stableLexicalMarkers.includes("vesna"), false);
});

test("fiction bundle profile carries narrative metrics and scores them in comparison", async () => {
  const provider = new MockFictionProvider();
  const { service } = await buildService(() => provider);
  const result = await service.createProfileBundle({
    voiceName: "Coastal Voice",
    profileType: "fiction-prose",
    description: "Curated fiction excerpts",
    samples: sampleBundleTexts()
  });

  assert.equal(result.profile.profileType, "fiction-prose");
  assert.equal(result.provenance.normalization, "fiction-prose-v1");
  assert.ok(result.profile.narrativeMetrics, "profile should carry narrative metrics");
  assert.ok((result.profile.confidenceNotes ?? []).length > 0);

  const comparison = await service.compareText({
    voiceId: result.profile.voiceId,
    text: "By the time the light came on, the harbor had gone quiet, and she watched the water and said nothing."
  });
  assert.ok(
    "narrative" in comparison.similarity.perDimensionScores,
    "fiction comparison should include a narrative dimension"
  );
});

test("heuristic fiction voiceRules and openings exclude scene-specific topic nouns", async () => {
  const { service } = await buildService();
  const profile = await service.createProfileBundle({
    voiceName: "Coastal Voice",
    profileType: "fiction-prose",
    samples: sampleBundleTexts()
  });

  const topicMarkers = profile.profile.topicSpecificLexicalMarkers ?? [];
  assert.ok(topicMarkers.length > 0, "expected some scene-specific topic markers");

  // No topic noun should be promoted as a preferred opening...
  for (const opener of profile.profile.preferredOpenings) {
    assert.equal(topicMarkers.includes(opener.toLowerCase()), false, `opener leaked topic noun: ${opener}`);
  }
  // ...nor surface inside the "recurring openings" voice rule that promises not to copy scene nouns.
  const ruleWords = new Set(
    (profile.profile.compactPromptPack.voiceRules.join(" ").toLowerCase().match(/\b[\w'-]+\b/g) ?? [])
  );
  for (const marker of topicMarkers) {
    assert.equal(ruleWords.has(marker.toLowerCase()), false, `voiceRule leaked topic noun: ${marker}`);
  }
});

test("reviewed rewrite uses critique and revision on a fiction profile", async () => {
  const provider = new MockFictionProvider();
  const { service } = await buildService(() => provider);
  const profile = await service.createProfileBundle({
    voiceName: "Coastal Voice",
    profileType: "fiction-prose",
    samples: sampleBundleTexts()
  });

  const result = await service.rewriteText({
    voiceId: profile.profile.voiceId,
    text: "Sarah got to the house. It was empty. She felt sad and decided to stay the night anyway.",
    mode: "rewrite",
    qualityMode: "reviewed"
  });

  assert.equal(result.qualityMode, "reviewed");
  assert.equal(result.providerUsed, "openai-compatible");
  assert.ok(result.critique);
  assert.match(result.outputText, /did not look at the water again/);
});

test("fast rewrite on a fiction profile returns the source largely intact", async () => {
  const { service } = await buildService();
  const profile = await service.createProfileBundle({
    voiceName: "Coastal Voice",
    profileType: "fiction-prose",
    samples: sampleBundleTexts()
  });

  const source = "Sarah got to the house. It was empty. She felt sad and decided to stay the night anyway.";
  const result = await service.rewriteText({
    voiceId: profile.profile.voiceId,
    text: source,
    mode: "rewrite",
    qualityMode: "fast"
  });

  assert.equal(result.qualityMode, "fast");
  assert.equal(result.providerUsed, "heuristic");
  assert.equal(result.outputText, source);
});

test("fiction prose evaluation runner produces report artifacts", async () => {
  const provider = new MockFictionProvider();
  const { service, tempDir } = await buildService(() => provider);
  const fixtureDir = path.resolve("evals", "fiction-prose");
  const outputDir = path.join(tempDir, "eval-output");

  const result = await runFictionProseEvaluation({
    service,
    fixtureDir,
    outputDir,
    voiceName: "Eval Voice"
  });

  assert.equal(result.report.rewriteCases.length, 3);
  assert.equal(result.report.generateCases.length, 3);
  assert.ok(result.jsonPath);
  assert.ok(result.markdownPath);

  const markdown = await readFile(result.markdownPath!, "utf8");
  assert.match(markdown, /Fiction Prose Evaluation Report/);
  assert.match(markdown, /Narration-distance & pacing fidelity/);
});
