import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { analyzeEmailBundle, normalizeEmailSample } from "../src/analysis/email.js";
import { loadConfig } from "../src/config.js";
import { runEmailFormalEvaluation } from "../src/evals/emailFormal.js";
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

class MockReviewedProvider implements ModelProvider {
  readonly kind = "openai-compatible";

  async distillBundle(
    request: ProviderBundleDistillationRequest
  ): Promise<ProviderBundleDistillationResponse> {
    return {
      summary: "formal, steady, collaborative email prose that leads with the practical point and then supplies context with restraint",
      voiceRules: [
        "Lead with the practical point early, then add measured context.",
        "Keep the tone calm, professional, and collaborative.",
        "Offer a practical next step or a live conversation when helpful."
      ],
      stableLexicalMarkers: request.stableLexicalMarkers.slice(0, 6),
      topicSpecificLexicalMarkers: request.topicSpecificLexicalMarkers.slice(0, 6),
      rhetoricalDevices: ["measured follow-up", "qualifying clarification"],
      antiPatterns: ["Avoid generic assistant phrasing.", "Avoid overfitting to one-off project nouns."],
      preferredOpenings: ["I wanted to follow up", "I wanted to check"],
      preferredClosings: ["Happy to discuss further", "Please let me know"],
      confidenceNotes: ["Strongest confidence comes from repeated body-paragraph phrasing across samples."]
    };
  }

  async rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse> {
    return {
      outputText: `I wanted to follow up here. ${request.inputText.replace(/^Can you /i, "Could you ").replace(/\bsoon\b/i, "in the near term")}`,
      notes: ["Mock draft pass completed."]
    };
  }

  async generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse> {
    return {
      outputText: [
        "I wanted to share a few top-level takeaways from AI Con while the themes are still fresh.",
        "",
        "One useful pattern was to ideate with generate-and-score loops, then have the model critique the output from opposing or role-based perspectives before moving ahead.",
        "",
        "The other strong takeaway was the value of automating boring, systematic, important work so people can spend more attention on judgment and refinement."
      ].join("\n"),
      notes: ["Mock generation pass completed."]
    };
  }

  async critique(_request: ProviderCritiqueRequest): Promise<ProviderCritiqueResponse> {
    return {
      voiceStrengths: ["professional tone", "clear body-first structure"],
      voiceDrifts: ["opening could feel more measured"],
      topicLeakage: [],
      meaningRisk: "Low",
      mandatoryFixes: ["Use a calmer opening.", "Offer a practical next step."],
      optionalImprovements: ["Tighten one sentence so the cadence feels less generic."]
    };
  }

  async revise(request: ProviderRevisionRequest): Promise<ProviderRevisionResponse> {
    return {
      outputText: `${request.candidateText}\n\nHappy to discuss further if a quick conversation would be easier.`,
      notes: ["Mock revision pass completed."]
    };
  }
}

async function buildService(providerFactory?: () => ModelProvider) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "my-voice-mcp-email-"));
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
      label: "migration note",
      text: [
        "Hey Brady,",
        "",
        "I wanted to follow up on the Brightspot migration conversation and make sure we are aligned on timing and ownership.",
        "",
        "It would be helpful to understand whether the no-index behavior is reliable now or whether we should still treat it as provisional.",
        "",
        "Happy to discuss if that is easier.",
        "",
        "Thanks,",
        "Adam"
      ].join("\n")
    },
    {
      label: "queue review",
      text: [
        "Hello Sarah,",
        "",
        "I wanted to follow up on the review queue and check whether the current order still makes sense.",
        "",
        "It would be helpful to know whether the more time-sensitive releases should continue to share the same approval path as the evergreen material.",
        "",
        "Please let me know if a quick discussion would be easier.",
        "",
        "Best,",
        "Adam"
      ].join("\n")
    },
    {
      label: "meeting note",
      text: [
        "Hi Melissa,",
        "",
        "I wanted to follow up before tomorrow's meeting so we can start from the same assumptions.",
        "",
        "My sense is that we are mostly aligned already, but it would be helpful to leave with a simple answer on ownership and timing.",
        "",
        "Happy to discuss live if that is easier.",
        "",
        "Thanks,",
        "Adam"
      ].join("\n")
    }
  ];
}

test("normalizes email samples and preserves provenance notes", () => {
  const sample = normalizeEmailSample({
    label: "sample",
    sourceKind: "text",
    sourceType: "text",
    extractedText: [
      "From: test@example.com",
      "Subject: Checking in",
      "",
      "Hey Brady,",
      "",
      "I wanted to follow up on the schedule and make sure we are aligned.",
      "",
      "Thanks,",
      "Adam"
    ].join("\n")
  });

  assert.equal(sample.normalizedText.includes("Hey Brady"), false);
  assert.equal(sample.normalizedText.includes("Thanks,"), false);
  assert.match(sample.normalizedText, /I wanted to follow up/);
  assert.ok(sample.provenance.notes.length >= 1);
});

test("email bundle analysis ranks repeated markers above one-off project nouns", () => {
  const bundle = analyzeEmailBundle(
    sampleBundleTexts().map((item) =>
      normalizeEmailSample({
        label: item.label,
        sourceKind: "text",
        sourceType: "text",
        extractedText: item.text
      })
    )
  );

  assert.ok(bundle.stableLexicalMarkers.includes("wanted"));
  assert.ok(bundle.stableLexicalMarkers.includes("helpful"));
  assert.ok(bundle.topicSpecificLexicalMarkers.includes("brightspot"));
  assert.equal(bundle.stableLexicalMarkers.includes("brightspot"), false);
});

test("bundle profile creation requires at least three samples", async () => {
  const { service } = await buildService();

  await assert.rejects(
    service.createProfileBundle({
      voiceName: "Too Small",
      profileType: "email-formal",
      samples: sampleBundleTexts().slice(0, 2)
    }),
    /at least 3 samples/i
  );
});

test("bundle profile creation stores provenance and avoids obvious topic overfit in prompt markers", async () => {
  const provider = new MockReviewedProvider();
  const { service } = await buildService(() => provider);
  const result = await service.createProfileBundle({
    voiceName: "Formal Email",
    profileType: "email-formal",
    description: "Curated work email bundle",
    samples: sampleBundleTexts()
  });

  assert.equal(result.profile.profileType, "email-formal");
  assert.equal(result.provenance.totalSamples, 3);
  assert.ok((result.profile.confidenceNotes ?? []).length > 0);
  assert.ok(result.profile.stableLexicalMarkers?.includes("wanted"));
  assert.ok(result.profile.topicSpecificLexicalMarkers?.includes("brightspot"));
  assert.equal(result.profile.compactPromptPack.lexicalMarkers.includes("brightspot"), false);
});

test("email profiles carry no narrative metrics and email scoring has no narrative dimension", async () => {
  const provider = new MockReviewedProvider();
  const { service } = await buildService(() => provider);
  const result = await service.createProfileBundle({
    voiceName: "Formal Email",
    profileType: "email-formal",
    samples: sampleBundleTexts()
  });

  // The fiction milestone must not change email scoring: email profiles never carry
  // narrativeMetrics, so compareSnapshot must not add a "narrative" dimension for them.
  assert.equal(result.profile.narrativeMetrics, undefined);

  const comparison = await service.compareText({
    voiceId: result.profile.voiceId,
    text: "I wanted to follow up on the schedule and confirm that we are still aligned on ownership."
  });
  assert.equal("narrative" in comparison.similarity.perDimensionScores, false);
});

test("reviewed rewrite uses critique and revision on bundled email profile", async () => {
  const provider = new MockReviewedProvider();
  const { service } = await buildService(() => provider);
  const profile = await service.createProfileBundle({
    voiceName: "Formal Email",
    profileType: "email-formal",
    samples: sampleBundleTexts()
  });

  const result = await service.rewriteText({
    voiceId: profile.profile.voiceId,
    text: "Can you tell me if the timeline still works? We need to know soon because the team is planning around it.",
    mode: "rewrite",
    qualityMode: "reviewed"
  });

  assert.equal(result.qualityMode, "reviewed");
  assert.equal(result.providerUsed, "openai-compatible");
  assert.ok(result.critique);
  assert.match(result.outputText, /Happy to discuss further/);
});

test("reviewed generation returns a final email draft rather than instructions", async () => {
  const provider = new MockReviewedProvider();
  const { service } = await buildService(() => provider);
  const profile = await service.createProfileBundle({
    voiceName: "Formal Email",
    profileType: "email-formal",
    samples: sampleBundleTexts()
  });

  const result = await service.generateText({
    voiceId: profile.profile.voiceId,
    prompt: "Draft an email with top-level takeaways from AI Con.",
    qualityMode: "reviewed",
    length: "medium"
  });

  assert.equal(result.qualityMode, "reviewed");
  assert.equal(result.providerUsed, "openai-compatible");
  assert.ok(result.critique);
  assert.doesNotMatch(result.outputText, /instructions about how to write/i);
  assert.match(result.outputText, /top-level takeaways from AI Con/i);
});

test("email formal evaluation runner produces report artifacts", async () => {
  const provider = new MockReviewedProvider();
  const { service, tempDir } = await buildService(() => provider);
  const fixtureDir = path.resolve("evals", "email-formal");
  const outputDir = path.join(tempDir, "eval-output");

  const result = await runEmailFormalEvaluation({
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
  assert.match(markdown, /Email Formal Evaluation Report/);
  assert.match(markdown, /Reviewer scores:/);
});
