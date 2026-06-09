# My Voice MCP Todo

## Done

- [x] Scaffold TypeScript MCP server with stdio and HTTP entrypoints.
- [x] Implement voice profile creation, persistence, comparison, and rewrite modes.
- [x] Add provider adapters for heuristic fallback, Ollama, OpenAI-compatible APIs, and Bedrock.
- [x] Add PDF validation/extraction with text-only MVP guardrails.
- [x] Add Docker packaging, README, and environment example.
- [x] Add automated tests for profile creation, validation, compare, rewrite, and HTTP auth.
- [x] Add requirements tracker in `REQUIREMENTS.md`.
- [x] Add step-by-step testing and client setup guide in `TESTING.md`.

## Next up

- [ ] Create GitHub repo under `timetoady` and push the initial commit.
- [ ] Run a real Codex MCP smoke test against this repo’s built server.
- [ ] Run a real Claude Code MCP smoke test against this repo’s built server.
- [ ] Run a real Open WebUI HTTP MCP smoke test against this repo’s server.
- [ ] Run a real Ollama-backed rewrite smoke test with `MY_VOICE_PROVIDER=ollama`.
- [ ] Capture any client-specific quirks discovered during live testing back into `TESTING.md`.
- [ ] Add provider-assisted profile distillation so `voice_create_profile` can optionally use an LLM.
- [ ] Add Google Drive PDF import support.
- [ ] Add import/export for voice profiles.

## MVP exit checklist

- [ ] Create a voice profile from a real sample PDF.
- [ ] Compare a sample paragraph and confirm the similarity report looks reasonable.
- [ ] Rewrite the same paragraph in `rewrite`, `hint`, and `snippet` modes.
- [ ] Verify one local stdio client path works end-to-end.
- [ ] Verify one HTTP MCP client path works end-to-end.
- [ ] Verify one remote/local model backend path works end-to-end.
