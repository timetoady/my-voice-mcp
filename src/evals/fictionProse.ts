import type { VoiceService } from "../services/voiceService.js";
import { runBundleEvaluation } from "./bundleEval.js";

export async function runFictionProseEvaluation(params: {
  service: VoiceService;
  fixtureDir: string;
  outputDir?: string;
  voiceName?: string;
}) {
  return runBundleEvaluation({
    service: params.service,
    profileType: "fiction-prose",
    fixtureDir: params.fixtureDir,
    outputDir: params.outputDir,
    voiceName: params.voiceName ?? "fiction-prose-eval",
    title: "Fiction Prose Evaluation Report",
    description: "Evaluation bundle for long-form fiction narrative voice review."
  });
}
