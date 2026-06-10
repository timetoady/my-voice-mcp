# My Voice MCP Requirements and Delivery Tracker

Last updated: June 8, 2026

## Product intent

`my-voice-mcp` is an MVP MCP server for turning a user's sample writing into a compact, reusable voice profile and then applying that profile to new text through comparison, hinting, and rewrite flows.

This MVP is intentionally narrower than a full author-style platform. It is designed to prove that a lightweight guide-and-rewrite workflow can improve stylistic alignment without model fine-tuning.

## MVP scope

- Single-user voice library stored on the local filesystem.
- One source PDF per voice profile.
- Text-based PDFs only.
- English-language prose as the default target.
- Existing-text rewrite plus prompt-to-draft generation.
- Local `stdio` transport for MCP clients.
- Streamable HTTP transport for remote/containerized clients.
- Bearer-token HTTP auth, with optional localhost dev bypass.
- Provider adapter support for:
  - `ollama`
  - `openai-compatible`
  - `bedrock`
  - heuristic fallback when no remote provider is configured

## Key decisions

- Implementation language: TypeScript on Node 20+.
- MCP SDK: official TypeScript MCP server packages.
- PDF extraction: `pdfjs-dist` for more robust text extraction than `pdf-parse`.
- Persistence model: local filesystem under `profiles/`.
- Similarity engine: deterministic heuristic analysis plus optional model-backed rewriting.
- Rewrite modes:
  - `rewrite`
  - `hint`
  - `snippet`
- Training/fine-tuning: explicitly out of scope for MVP.
- Google Drive and non-PDF ingestion: deferred.
- OCR for scanned PDFs: deferred.
- Multi-tenant/team sharing: deferred.
- OAuth: deferred in favor of simple bearer auth.

## Required interfaces

### MCP tools

- `voice_create_profile`
- `voice_list_profiles`
- `voice_get_profile`
- `voice_compare_text`
- `voice_rewrite_text`
- `voice_generate_text`
- `voice_delete_profile`
- `voice_validate_source`

### MCP resources

- `voice://profiles`
- `voice://profiles/{voiceId}/summary`
- `voice://profiles/{voiceId}/guide`
- `voice://profiles/{voiceId}/metrics`

### Storage layout

```text
profiles/
  index.json
  <voiceId>/
    source.pdf
    extracted.txt
    guide.json
    guide.md
```

## What is implemented

### Runtime and packaging

- TypeScript project scaffold with build, test, stdio, and HTTP scripts.
- MCP server registration for all planned tools and resources.
- Native Node HTTP server exposing:
  - `POST /mcp`
  - `GET /healthz`
- Docker image for HTTP deployment.
- `.env.example` and README setup guidance.
- Local git repository initialized.

### Voice profile pipeline

- Local PDF validation and extraction.
- Explicit rejection path for unsupported or non-text PDFs.
- Extracted-text normalization, token estimation, and hard source limits.
- Compact voice profile generation with:
  - style dimensions
  - structure patterns
  - lexical markers
  - rhetorical devices
  - anti-patterns
  - compact prompt pack
- `guide.json` and `guide.md` persistence.

### Style compare and rewrite

- Deterministic text snapshot generation.
- Similarity scoring with:
  - dimension matching
  - lexical marker overlap
  - structure-pattern comparison
  - rhetorical-device overlap
- Rewrite service with:
  - provider adapter resolution
  - heuristic fallback
  - `rewrite`, `hint`, and `snippet` modes
- Prompt-to-draft generation service with provider-backed or heuristic output in a selected voice.
- Before/after similarity reporting.

### Providers

- Ollama adapter.
- OpenAI-compatible HTTP adapter.
- AWS Bedrock adapter.
- Heuristic fallback provider for offline/local use or provider failure.

### Verification

- Build passes with `npm.cmd run build`.
- Test suite passes with `npm.cmd test`.
- Verified scenarios:
  - create a voice profile from a text PDF
  - reject scanned/image-only or unreadable PDFs
  - reject oversized inputs
  - score stylistically similar text above dissimilar text
  - rewrite/hint/snippet flows return useful output
  - HTTP bearer auth blocks unauthenticated access when localhost bypass is disabled

## Known MVP limitations

- `voice_create_profile` accepts `providerOverride` for interface compatibility, but profile creation is currently heuristic-first and does not yet use a model refinement pass.
- Google Drive ingestion is not implemented.
- DOCX, TXT, and Markdown ingestion are not implemented.
- OCR is not implemented.
- Profile merging across multiple source documents is not implemented.
- The HTTP server is stateless per request and optimized for MVP simplicity rather than advanced session features.
- The rewrite quality is best when a remote model provider is configured; heuristic mode is intentionally modest.

## Next recommended work

1. Add provider-assisted profile distillation so `voice_create_profile` can optionally refine lexical and tonal rules with an LLM.
2. Add Google Drive PDF import and profile source provenance for Drive-backed workflows.
3. Add Open WebUI and Ollama integration notes with example MCP client configs.
4. Add richer auth configuration and token rotation guidance.
5. Add snapshot fixtures or end-to-end MCP client smoke tests.
6. Add profile export/import commands for moving voices between machines.
7. Add usage guidance around minimum and maximum source sizes to avoid poor voice extraction.

## Notes for future implementation

- If git operations continue to fail because of Windows ownership changes, reconfigure `safe.directory` from the active user context before doing commit/push work.
- Pushing to GitHub user `timetoady` is not yet configured in this workspace and should be handled as a separate authenticated step.
