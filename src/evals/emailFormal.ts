import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { QualityMode } from "../domain/types.js";
import type { VoiceService } from "../services/voiceService.js";

interface RewriteFixture {
  id: string;
  label: string;
  text: string;
}

interface GenerateFixture {
  id: string;
  label: string;
  prompt: string;
  length?: "short" | "medium" | "long";
}

interface LoadedFixtures {
  sampleTexts: Array<{ label: string; text: string }>;
  rewriteCases: RewriteFixture[];
  generateCases: GenerateFixture[];
  rubric: string;
}

interface ModeResult {
  qualityMode: QualityMode;
  providerUsed: string;
  similarityBefore?: number;
  similarityAfter?: number;
  critique?: unknown;
  notes: string[];
  outputText: string;
}

interface EvaluationReport {
  createdAt: string;
  fixtureDir: string;
  profile: {
    voiceId: string;
    voiceName: string;
    profileType: string | undefined;
    summary: string;
    warnings: string[];
    confidenceNotes: string[];
  };
  rewriteCases: Array<{
    id: string;
    label: string;
    inputText: string;
    fast: ModeResult;
    reviewed: ModeResult;
  }>;
  generateCases: Array<{
    id: string;
    label: string;
    prompt: string;
    fast: ModeResult;
    reviewed: ModeResult;
  }>;
  rubric: string;
}

export async function runEmailFormalEvaluation(params: {
  service: VoiceService;
  fixtureDir: string;
  outputDir?: string;
  voiceName?: string;
}) {
  const fixtures = await loadFixtures(params.fixtureDir);
  const bundle = await params.service.createProfileBundle({
    voiceName: params.voiceName ?? "email-formal-eval",
    profileType: "email-formal",
    description: "Evaluation bundle for formal email voice review.",
    samples: fixtures.sampleTexts.map((sample) => ({
      label: sample.label,
      text: sample.text
    }))
  });

  const rewriteCases = [];
  for (const item of fixtures.rewriteCases) {
    const fast = await params.service.rewriteText({
      voiceId: bundle.profile.voiceId,
      text: item.text,
      mode: "rewrite",
      qualityMode: "fast"
    });
    const reviewed = await params.service.rewriteText({
      voiceId: bundle.profile.voiceId,
      text: item.text,
      mode: "rewrite",
      qualityMode: "reviewed"
    });

    rewriteCases.push({
      id: item.id,
      label: item.label,
      inputText: item.text,
      fast: {
        qualityMode: fast.qualityMode,
        providerUsed: fast.providerUsed,
        similarityBefore: fast.similarityBefore.score,
        similarityAfter: fast.similarityAfterEstimate.score,
        critique: fast.critique,
        notes: fast.notes,
        outputText: fast.outputText
      },
      reviewed: {
        qualityMode: reviewed.qualityMode,
        providerUsed: reviewed.providerUsed,
        similarityBefore: reviewed.similarityBefore.score,
        similarityAfter: reviewed.similarityAfterEstimate.score,
        critique: reviewed.critique,
        notes: reviewed.notes,
        outputText: reviewed.outputText
      }
    });
  }

  const generateCases = [];
  for (const item of fixtures.generateCases) {
    const fast = await params.service.generateText({
      voiceId: bundle.profile.voiceId,
      prompt: item.prompt,
      length: item.length ?? "medium",
      qualityMode: "fast"
    });
    const reviewed = await params.service.generateText({
      voiceId: bundle.profile.voiceId,
      prompt: item.prompt,
      length: item.length ?? "medium",
      qualityMode: "reviewed"
    });

    generateCases.push({
      id: item.id,
      label: item.label,
      prompt: item.prompt,
      fast: {
        qualityMode: fast.qualityMode,
        providerUsed: fast.providerUsed,
        similarityAfter: fast.similarityEstimate.score,
        critique: fast.critique,
        notes: fast.notes,
        outputText: fast.outputText
      },
      reviewed: {
        qualityMode: reviewed.qualityMode,
        providerUsed: reviewed.providerUsed,
        similarityAfter: reviewed.similarityEstimate.score,
        critique: reviewed.critique,
        notes: reviewed.notes,
        outputText: reviewed.outputText
      }
    });
  }

  const report: EvaluationReport = {
    createdAt: new Date().toISOString(),
    fixtureDir: params.fixtureDir,
    profile: {
      voiceId: bundle.profile.voiceId,
      voiceName: bundle.profile.voiceName,
      profileType: bundle.profile.profileType,
      summary: bundle.profile.summary,
      warnings: bundle.profile.warnings,
      confidenceNotes: bundle.profile.confidenceNotes ?? []
    },
    rewriteCases,
    generateCases,
    rubric: fixtures.rubric
  };

  let jsonPath: string | undefined;
  let markdownPath: string | undefined;
  if (params.outputDir) {
    await mkdir(params.outputDir, { recursive: true });
    jsonPath = path.join(params.outputDir, "latest-report.json");
    markdownPath = path.join(params.outputDir, "latest-report.md");
    await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
    await writeFile(markdownPath, renderMarkdown(report), "utf8");
  }

  return {
    report,
    jsonPath,
    markdownPath
  };
}

async function loadFixtures(fixtureDir: string): Promise<LoadedFixtures> {
  const sampleDir = path.join(fixtureDir, "samples");
  const sampleFiles = (await readdir(sampleDir)).filter((file) => file.endsWith(".txt")).sort();
  const sampleTexts = await Promise.all(
    sampleFiles.map(async (fileName) => ({
      label: path.basename(fileName, ".txt").replace(/^\d+-/, "").replace(/-/g, " "),
      text: await readFile(path.join(sampleDir, fileName), "utf8")
    }))
  );

  const [rewriteCasesRaw, generateCasesRaw, rubric] = await Promise.all([
    readFile(path.join(fixtureDir, "rewrite-cases.json"), "utf8"),
    readFile(path.join(fixtureDir, "generate-cases.json"), "utf8"),
    readFile(path.join(fixtureDir, "rubric.md"), "utf8")
  ]);

  return {
    sampleTexts,
    rewriteCases: JSON.parse(rewriteCasesRaw) as RewriteFixture[],
    generateCases: JSON.parse(generateCasesRaw) as GenerateFixture[],
    rubric
  };
}

function renderMarkdown(report: EvaluationReport): string {
  return [
    "# Email Formal Evaluation Report",
    "",
    `Created: ${report.createdAt}`,
    `Voice profile: ${report.profile.voiceName} (${report.profile.voiceId})`,
    `Summary: ${report.profile.summary}`,
    "",
    "## Profile notes",
    ...report.profile.warnings.map((warning) => `- Warning: ${warning}`),
    ...(report.profile.confidenceNotes.length
      ? report.profile.confidenceNotes.map((note) => `- Confidence: ${note}`)
      : ["- Confidence: none recorded"]),
    "",
    "## Rewrite cases",
    ...report.rewriteCases.flatMap((item) => [
      `### ${item.label}`,
      "",
      "Input:",
      "```text",
      item.inputText,
      "```",
      "",
      `Fast (${item.fast.providerUsed}, quality=${item.fast.qualityMode}, before=${item.fast.similarityBefore}, after=${item.fast.similarityAfter})`,
      "```text",
      item.fast.outputText,
      "```",
      "",
      `Reviewed (${item.reviewed.providerUsed}, quality=${item.reviewed.qualityMode}, before=${item.reviewed.similarityBefore}, after=${item.reviewed.similarityAfter})`,
      "```text",
      item.reviewed.outputText,
      "```",
      "",
      "Reviewer scores:",
      "- Voice match: __ / 5",
      "- Clarity/professionalism: __ / 5",
      "- Usefulness with fewer manual edits: __ / 5",
      "- Correctness/meaning preservation: __ / 5",
      ""
    ]),
    "## Generate cases",
    ...report.generateCases.flatMap((item) => [
      `### ${item.label}`,
      "",
      "Prompt:",
      "```text",
      item.prompt,
      "```",
      "",
      `Fast (${item.fast.providerUsed}, quality=${item.fast.qualityMode}, similarity=${item.fast.similarityAfter})`,
      "```text",
      item.fast.outputText,
      "```",
      "",
      `Reviewed (${item.reviewed.providerUsed}, quality=${item.reviewed.qualityMode}, similarity=${item.reviewed.similarityAfter})`,
      "```text",
      item.reviewed.outputText,
      "```",
      "",
      "Reviewer scores:",
      "- Voice match: __ / 5",
      "- Clarity/professionalism: __ / 5",
      "- Usefulness with fewer manual edits: __ / 5",
      "- Correctness/meaning preservation: __ / 5",
      ""
    ]),
    "## Rubric",
    "",
    report.rubric
  ].join("\n");
}
