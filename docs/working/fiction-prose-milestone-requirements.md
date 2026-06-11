# Fiction Long-Form Voice Milestone — Requirements & Delivery Tracker

Working source of truth for the `fiction-prose` milestone. Created immediately after plan approval, before any code edits. Kept current at every phase break.

Related: design brief in `NOVEL_VOICE_BOOTSTRAP.md`; project-wide tracker in `REQUIREMENTS.md`; approved plan at `~/.claude/plans/md-you-are-continuing-jiggly-finch.md`.

## Phase Status

- Intake and grounding: **complete** (codebase explored; all email seams identified; 4 design decisions confirmed with developer)
- Requirements document creation: **complete**
- MVP delivery: **complete** (build green; 20/20 tests pass; fiction eval runs end-to-end; email eval regression intact)
- Senior-dev pass: **complete** (risk-hardening + DRY sweep; 22/22 tests pass)
- Independent critique and persona review: **complete** (fresh reviewer sub-agent; overall ~7.5, below the ≥8 bar — Docs 5 and one voiceRule honesty defect)
- Quality-gate loop: **complete** (iteration 1 closed all must-fix gaps; independent re-score 8.7, every dimension ≥7 — clears the bar)
- PR creation: **complete** (PR #1 pushed; commit `27b9ee7`)
- PR creation: not started
- Review handling: not started
- Closeout: not started

## Summary

- **Requirement source(s):** developer bootstrap prompt (this session) + `NOVEL_VOICE_BOOTSTRAP.md` (deferred-milestone design brief).
- **Requirement doc path:** `docs/working/fiction-prose-milestone-requirements.md`.
- **Objective:** Add a bundled, multi-sample **fiction** voice-profile flow with first-class narrative metrics, plus a fixed repeatable fiction eval set, where reviewed mode preserves scene intent and sounds more convincingly like the target voice than fast mode.
- **User/developer problem:** The pipeline is tuned for short professional email and models none of the traits that matter in fiction (scene rhythm, narration distance, paragraph pacing, dialogue behavior, descriptive density, recurring syntax). Reusing it as-is overfits to topic nouns, flattens narration distance, and produces cosmetically-styled-but-not-authored prose.
- **Success criteria:**
  1. A fiction bundled profile is produced from multiple excerpts (not a single block) and explicitly models fiction traits beyond lexical markers.
  2. A fixed fiction eval set exists (`evals/fiction-prose/`) mirroring the email harness (samples + rewrite cases + generation cases + rubric + JSON/MD report).
  3. With a configured model provider, reviewed mode beats fast mode on ≥4/6 tasks and averages ≥4/5 on voice match (manual rubric); the harness also runs provider-free for a baseline.
  4. Email behavior is unchanged (existing email tests + `eval:email-formal` still pass / match prior shape).

## Current State

- **What exists already:** legacy single-PDF profiles; bundled `email-formal` profiles (multi-sample → stable/topic marker split → heuristic+model distillation → `compactPromptPack`); reviewed mode (draft→critic→revise); providers heuristic/openai-compatible/ollama/bedrock; `evals/email-formal` harness; local filesystem storage.
- **Relevant repos/workspaces:** single repo `my-voice-mcp` (TypeScript, Node 20+, ES2022/NodeNext, `node --test` runner, `tsx`).
- **Known constraints:** keep draft→critic→revise ceiling (no extra loop, no multi-critic); no fine-tuning; bundled multi-sample is the primary path; process quality over one-off sample tuning; token use bounded via compact guides (do not replay full source).
- **Supplemental context used:** `NOVEL_VOICE_BOOTSTRAP.md` (named fiction dimensions, failure modes, acceptance criteria, "constrained MVP = one narrator voice" guidance).

## Scope and Defaults

- **In scope:**
  - `fiction-prose` profile type end-to-end (create bundle → profile → rewrite/generate → eval).
  - First-class `NarrativeMetrics` wired into the prompt pack **and** the similarity score.
  - Fiction normalization that preserves paragraph/dialogue behavior.
  - Principled generalization of the email-coupled seams (distillation contract, provider prompts via a content-kind map, shared marker analyzer).
  - Fixed fiction eval set with **continuation/generation + in-voice rewrite** tasks.
- **Out of scope:** fine-tuning/training; multi-critic or multi-agent loops; OCR/Drive/DOCX ingestion; genre auto-detection; per-character voice modeling; multilingual.
- **Assumptions/defaults chosen (confirmed with developer):**
  1. Eval samples are **4 original passages** authored in one consistent invented authorial voice (no copyright risk, fully repeatable).
  2. **Principled refactor** of email-coupled code (not a parallel fiction-only path); email behavior preserved by tests.
  3. **First-class narrative metrics** wired into scoring (not rules-only).
  4. Eval exercises **both** scene-continuation/generation and in-voice rewrite.
  - MVP is constrained to one narrator-voice style family (per bootstrap guidance), not "all fiction."
  - Requirements doc lives under `docs/working/` (new) rather than root, to keep milestone working-notes separate from the project tracker.

## Implementation Plan

- **Approach:** Make the bundle pipeline `profileType`-aware; add fiction normalization + analysis producing `NarrativeMetrics`; fold metrics into scoring and prompts; ship a fixed fiction eval set reusing a shared runner. (Full detail in the approved plan file.)
- **Public interface / behavior changes:**
  - `voice_create_profile_bundle` MCP tool accepts `profileType: "fiction-prose"`.
  - New npm script `eval:fiction-prose`.
  - Provider interface method `distillEmailBundle` → `distillBundle` (internal contract; not an MCP-surface change).
  - `VoiceProfile`/`TextStyleSnapshot` gain optional `narrativeMetrics`.
- **Important internal changes:**
  - New: `src/analysis/contentKind.ts`, `src/analysis/markers.ts`, `src/analysis/narrative.ts`, `src/analysis/fiction.ts`, `src/evals/bundleEval.ts`, `src/evals/runFictionProseEval.ts`.
  - Modify: `types.ts`, `email.ts` (lift marker logic into `markers.ts`), `profile.ts`, `style.ts`, `voiceService.ts`, all four providers, `mcp/server.ts`, `evals/emailFormal.ts`, `package.json`.
- **Risks or edge cases:**
  - Refactoring the shared distillation contract could regress email → guarded by existing email tests + `eval:email-formal` shape check.
  - Narrative term must be additive-only in `compareSnapshot` (gated on `profile.narrativeMetrics` presence) so email scores stay byte-identical.
  - Fiction passages are longer than emails → per-type sample/bundle size limits needed.
  - Without a configured provider, fast == reviewed (heuristic); the "reviewed beats fast" criterion requires a model provider. Documented as an honest constraint, not hidden.
  - Failure modes from the bootstrap to actively guard against in prompts/anti-patterns: topic-noun overfit, "more adjectives ≠ style", lost POV/narration distance, style-commentary instead of prose, generic literary pastiche, meaning/plot loss during rewrite.

## Quality Rubric

Dimensions scored 1-10. Passing bar: **every dimension ≥ 7 and overall ≥ 8.**

- **Correctness:** fiction bundle builds; normalization preserves dialogue/paragraphs; narrative metrics computed sanely; scoring additive term correct; email path unchanged; build + tests green.
- **Scope-fit:** delivers exactly the constrained fiction MVP (one narrator voice, bundled flow, fixed eval, both task types); no fine-tuning, no extra loop complexity.
- **Simplicity/DRY:** marker logic shared (not duplicated); one bundle eval runner for both content types; content-kind map is the single source of prompt wording; no forked parallel pipeline.
- **Test coverage:** new fiction workflow test + email regression tests pass; eval runs end-to-end provider-free.
- **UX/DX:** clear eval report, clear MCP tool param, honest provider-requirement messaging, readable voiceRules in the fiction guide.
- **Docs clarity:** requirements doc + README/REQUIREMENTS note the new flow; eval rubric is self-explanatory.

## Checkable TODOs

- [x] Create the requirements document file
- [x] Confirm current behavior and linked context
- [x] **Developer approval to proceed to MVP** (hard gate)
- [x] Types + content-kind map + shared marker analyzer
- [x] Narrative metrics + fiction normalization/analysis
- [x] Scoring (additive narrative term) + profile building passthrough
- [x] Generalize voiceService + provider distill/generate/critique prompts
- [x] MCP enum + eval harness extraction + fiction runner + npm script
- [x] Author 4 fiction samples + rewrite/generate cases + fiction rubric
- [x] Add `tests/fictionProseWorkflow.test.ts`; keep email tests green
- [x] Run senior-dev pass (risk-hardening + DRY sweep)
- [ ] Run independent critique and persona/DX review
- [x] Clear the quality bar via the quality-gate loop
- [x] Create PR
- [ ] Handle review comments
- [ ] Post closeout summary with PR and QA notes

## PR and Review Tracking

- Repo and branch coverage: single repo `my-voice-mcp`, branch `feat/fiction-prose-voice-milestone` → `main`.
- PR links: https://github.com/timetoady/my-voice-mcp/pull/1
- Commit: `27b9ee7` — 34 files changed (+1796 / -483).
- Reviewer automation status: none added automatically; depends on the repo's GitHub settings (no Copilot/CodeRabbit reviewer was requested via CLI). Add reviewers in the GitHub UI if desired.
- Review status: awaiting reviewer comments (developer to confirm when populated).
- Closeout status: not started.

## Test and QA

- **Automated checks:** `npm run build`; `npm test` (new fiction test + email regression); `npm run eval:fiction-prose` (provider-free baseline); `npm run eval:email-formal` (regression shape).
- **Manual QA:** with `MY_VOICE_PROVIDER` configured, run `eval:fiction-prose` and human-score the report (voice match, scene-intent preservation, narration/pacing fidelity, prose quality, meaning/coherence); confirm reviewed beats fast on ≥4/6.
- **Smoke-test prompts/scenarios:** `voice_create_profile_bundle` with `profileType: "fiction-prose"` over `dev:stdio`; then `voice_generate_text` (scene continuation) and `voice_rewrite_text` (flat passage → in-voice) against the new profile.

## MVP Result (for phase handoff)

- Build: `npm run build` clean.
- Tests: `npm test` → 20/20 pass (7 email workflow incl. regression, 6 new fiction workflow, plus existing voiceService/http/pdf tests).
- Fiction eval (`npm run eval:fiction-prose`, no provider): builds a 4-sample fiction profile (6236 chars), computes narrative metrics, separates stable voice (`had, was, knew, water, she, small`) from scene nouns (`halloran, fog, boats, harbor`), and emits the report + profile artifacts.
- Email eval (`npm run eval:email-formal`): runs and matches prior shape (no regression).
- New modules: `contentKind.ts`, `bundle.ts`, `markers.ts`, `narrative.ts`, `fiction.ts`, `bundleEval.ts`, `fictionProse.ts`, `runFictionProseEval.ts`. Refactored: types, email.ts (now reuses markers), profile/style, all 4 providers + interface, voiceService, mcp server, package.json.

### Known limitations
- Heuristic fiction generate/rewrite are deliberately weak baselines; reviewed-vs-fast quality requires a configured provider (documented in rubric).
- The `narrativeMetrics.recurringOpeners` field stored on a profile may still include a proper-noun opener (it feeds the narrative similarity term, where it is internally consistent). As of iteration 1 these are filtered against topic markers **before** they enter any voiceRule or `preferredOpenings`, so the dishonest-rule defect is resolved.

### Senior-dev pass changes
- **Risk hardening:** fixed a chapter-heading false positive — the old rule stripped any ≤6-word line starting with `chapter|part|book|...`, which would have deleted real prose like "Part of her wanted to leave."; now only numbered headings or short keyword lines with no sentence punctuation are removed. Same guard applied to all-caps headings (punctuated/quoted lines are preserved as prose/dialogue).
- **Calibration:** recalibrated `narrationDistance` so close-third-with-interiority reads "measured" (0.597) rather than "distant" (0.874); distant objective third still scores near 1, intimate first-person near 0. VoiceRule wording now matches.
- **De-noise:** dropped article/`it` openers from `recurringOpeners`.
- **DRY:** confirmed marker split + repeated-phrase logic shared via `markers.ts` (email and fiction); one shared `bundleEval.ts` runner. Pre-existing provider prompt-helper duplication and an unused `countWords` import in `style.ts` left as out-of-scope (not introduced by this milestone).
- **Tests:** added 2 hardening tests (heading false-positive; narration-distance directionality). 22/22 pass; email regression intact.

## Quality-Gate Score History

### Iteration 0 — independent critique baseline
Scores (1-10): Correctness 8, Scope-fit 9, Simplicity/DRY 9, Test coverage 8, UX/DX 7, **Docs clarity 5**. Overall ~7.5 → **below bar** (Docs < 7 floor; overall < 8).

Risk areas pressure-tested by the reviewer and confirmed SOUND: email scoring byte-identical (narrative term gated on `profile.narrativeMetrics`), narrative.ts edge cases (divide-by-zero guards, graceful no-dialogue/no-paragraph handling), fiction normalization does not over-strip real prose, provider rename has no email regression, and the 4 samples are one voice with varied topics (stable/topic split works).

Gaps to close:
- **Must-fix (a):** README.md / REQUIREMENTS.md / TESTING.md still call fiction "future/out-of-scope" and never mention `fiction-prose`, `eval:fiction-prose`, or the new tool param. Fails the rubric's Docs requirement.
- **Must-fix (b):** `heuristic.ts` fiction voiceRule embeds `recurringOpeners`, which can contain a topic proper noun (`halloran`), producing a rule that says "reuse recurring openings (…halloran…) without copying scene-specific nouns" — internally contradictory. Filter `recurringOpeners` against `topicSpecificLexicalMarkers` before it enters a rule.
- **Nice-to-have:** content-kind-aware error strings in voiceService (email copy on fiction path); expose `narrativeMetrics` in the MCP bundle response + metrics resource; add a test asserting email profiles have `narrativeMetrics === undefined` and no `narrative` scoring key.

### Iteration 1 — fixes + independent re-score
Changes made: (a) documented the fiction flow in README.md / REQUIREMENTS.md / TESTING.md and reversed the "deferred/out-of-scope" language; (b) fixed the voiceRule honesty defect — `recurringOpeners` are now filtered against `topicSpecificLexicalMarkers` before entering voiceRules/`preferredOpenings` (heuristic.ts); (c) content-kind-aware bundle error strings (voiceService.ts); (d) exposed `narrativeMetrics` in the MCP bundle response + metrics resource (server.ts); (e) added an email-isolation regression test and a non-vacuous topic-noun-filter test. Tests 22 → 24, all passing.

Independent re-score (fresh reviewer, scorer ≠ improver, verified against the diff + live `eval:fiction-prose` output):
- Correctness 9, Scope-fit 9, Simplicity/DRY 9, Test coverage 9, UX/DX 8, Docs clarity 8.
- **Overall 8.7 — every dimension ≥7 and overall ≥8. Clears the bar.**

- Accepted residual gaps: none must-fix. `narrativeMetrics.recurringOpeners` may still contain a proper noun in the stored metric (used only in the consistent similarity term; never surfaced in rules/openings). Reviewed-vs-fast quality remains pending a live model-provider run (documented honesty constraint, not a defect).
