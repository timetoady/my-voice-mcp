# My Voice MCP Todo

Last updated: June 10, 2026

## Current milestone: process-first formal email voice

### Done

- [x] Keep the legacy single-PDF `voice_create_profile` flow for compatibility.
- [x] Add preferred bundled formal-email profile creation with `voice_create_profile_bundle`.
- [x] Require at least 3 bundle samples and reject empty or oversized samples.
- [x] Normalize email samples to reduce greeting, signature, and reply-header noise.
- [x] Separate stable lexical markers from topic-specific markers.
- [x] Persist bundled profile provenance and confidence notes.
- [x] Add `qualityMode` to rewrite and generation flows.
- [x] Implement one draft -> critique -> revise loop for reviewed mode.
- [x] Add fixed evaluation fixtures under `evals/email-formal`.
- [x] Add `npm run eval:email-formal`.
- [x] Add automated tests for bundle analysis, reviewed flows, and eval artifact generation.
- [x] Update requirements, todo, and testing docs to reflect the new workflow.
- [x] Add a novel-voice bootstrap handoff doc for the deferred long-form milestone.

### Next validation steps

- [ ] Run `voice_create_profile_bundle` against a real user-curated email bundle through a live MCP client.
- [ ] Run `voice_rewrite_text` in `reviewed` mode with a configured OpenAI-compatible endpoint and save the output for human review.
- [ ] Run `voice_generate_text` in `reviewed` mode with the same provider and save the output for human review.
- [ ] Complete one human-scored pass of all 6 email-formal evaluation tasks.
- [ ] Confirm reviewed mode beats fast mode in at least 4 of 6 review tasks.
- [ ] Confirm no human-scored correctness result is below 3/5.

## Client-delivery validation

- [ ] Re-run a real Codex MCP smoke test against the bundled-profile workflow.
- [ ] Re-run a real Claude Code MCP smoke test against the bundled-profile workflow.
- [ ] Re-run a real Open WebUI HTTP MCP smoke test against the bundled-profile workflow.
- [ ] Capture any client-specific quirks discovered during live testing back into `TESTING.md`.

## Deferred for now

- [ ] Add Google Drive import support.
- [ ] Add OCR for scanned/image PDFs.
- [ ] Expand bundled profiles beyond `email-formal`.
- [ ] Add import/export for voice profiles.
- [ ] Add multi-voice orchestration or multi-agent debate beyond one critique pass.

## MVP status board

- [x] Build the server locally.
- [x] Pass the automated test suite.
- [x] Run the local email-formal eval harness and produce report artifacts.
- [x] Support legacy PDF-to-profile creation.
- [x] Support bundled formal-email profile creation.
- [x] Support compare, rewrite, hint, snippet, and generate flows.
- [ ] Verify one live stdio MCP client path end-to-end on the new workflow.
- [ ] Verify one live HTTP MCP client path end-to-end on the new workflow.
- [ ] Verify one live model-backed provider path end-to-end on the new workflow.
- [ ] Complete one human-reviewed acceptance pass for the formal-email milestone.
