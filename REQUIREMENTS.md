# My Voice MCP Requirements and Delivery Tracker

Last updated: June 10, 2026

## Product intent

`my-voice-mcp` is an MVP MCP server for turning a user's writing samples into compact, reusable voice profiles and then applying those profiles to new text through comparison, rewrite, hint, snippet, and generation flows.

The current milestone is intentionally process-first for formal/work email. The goal is not to over-optimize one output at a time, but to improve the repeatable workflow for:

1. curating a stable email voice profile from multiple samples
2. rewriting or generating drafts in that voice
3. comparing `fast` versus `reviewed` quality with a fixed human review set

## Scope now in play

- Single-user local voice library
- English-language prose
- Local `stdio` and Streamable HTTP MCP transports
- Bearer-token HTTP auth with optional localhost bypass
- Provider adapters for heuristic, OpenAI-compatible, Ollama, and Bedrock backends
- Legacy single-PDF profile creation
- Preferred bundled profile creation from 3+ samples (`email-formal` and `fiction-prose`)
- Rewrite and generation with `qualityMode: "fast" | "reviewed"`
- Evaluation harnesses under `evals/email-formal` and `evals/fiction-prose`

## Explicitly deferred

- OCR or scanned PDF handling
- Google Drive import
- DOCX/TXT generic ingestion beyond the bundle sample path
- Multi-tenant isolation
- OAuth
- Team sharing
- Multi-agent debate beyond one critic-and-revise pass

(Long-form fiction voice was previously deferred and is now implemented as the `fiction-prose` bundle family — see below and `docs/working/fiction-prose-milestone-requirements.md`.)

## Key decisions

- Implementation language: TypeScript on Node 20+
- SDK direction: official MCP TypeScript server packages
- Storage: local filesystem under `profiles/`
- Primary quality path: bundled multi-sample `email-formal` profiles
- Quality loop ceiling: one draft pass, one structured critique pass, one revision pass
- Evaluation method: fixed human review set instead of ad hoc spot checks
- Default model-backed validation path on this machine: OpenAI-compatible endpoint when configured
- Ollama remains supported, but live validation on this computer is still deferred until a machine with Ollama is available

## Public interfaces

### MCP tools

- `voice_create_profile`
- `voice_create_profile_bundle`
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

### Output modes

- Rewrite:
  - `rewrite`
  - `hint`
  - `snippet`
- Quality:
  - `fast`
  - `reviewed`

## Storage layout

```text
profiles/
  index.json
  <voiceId>/
    extracted.txt
    guide.json
    guide.md
    source.pdf
    bundle-sources.json
    samples/
```

Notes:

- `source.pdf` is present for legacy single-PDF profiles.
- `bundle-sources.json` and `samples/` are present for bundled profiles.
- `guide.json` stores provenance, confidence notes, and marker separation for bundled profiles.

## What is implemented

### Runtime and transport

- TypeScript project scaffold with build, test, stdio, HTTP, and eval scripts
- MCP server registration for tools and resources
- HTTP server with:
  - `POST /mcp`
  - `GET /healthz`
- Structured logging for startup, profile creation, rewrite, generate, and provider fallback paths
- Docker packaging

### Legacy profile path

- Local text-PDF validation and extraction
- Rejection for non-text or unsupported PDFs
- Heuristic profile creation from one source PDF
- Stored `guide.json`, `guide.md`, and `extracted.txt`

### Bundled profile paths (`email-formal`, `fiction-prose`)

- `voice_create_profile_bundle` with `profileType: "email-formal" | "fiction-prose"`
- Validation requiring at least 3 samples
- Per-sample and combined size limits (fiction gets a roomier per-sample ceiling)
- Support for sample `text` or local `path`
- Content-aware normalization:
  - email: strips/downweights greetings, signatures, reply headers, one-off routing metadata
  - fiction: strips chapter/section headings, scene-break glyphs, page numbers, and source boilerplate while preserving paragraph and dialogue structure
- Cross-sample analysis (shared across both families) that separates:
  - stable lexical markers
  - topic-specific lexical markers
  - repeated phrases
- Fiction profiles additionally compute first-class narrative metrics (point of view, narration distance, dialogue density, descriptive density, paragraph pacing variance, scene rhythm, interiority, recurring openers), wired into both the prompt pack and the similarity score
- Model-backed bundle distillation with heuristic fallback
- Provenance capture and persistence
- Confidence notes persisted in the profile

### Rewrite and generation process

- `voice_rewrite_text` with `qualityMode`
- `voice_generate_text` with `qualityMode`
- `reviewed` mode with:
  - candidate draft
  - structured critic JSON
  - one revision pass
- Heuristic fallback when no model-backed provider is configured or when the provider fails

### Evaluation harnesses

- Dedicated review areas under `evals/email-formal` and `evals/fiction-prose`
- Each: 4 curated source samples, 3 rewrite cases, 3 generation cases, a content-specific human review rubric
- `npm run eval:email-formal` and `npm run eval:fiction-prose`
- Markdown and JSON report output
- Shared runner (`src/evals/bundleEval.ts`) drives both families

### Verification status

- `npm.cmd run build` passes
- `npm.cmd test` passes (email + fiction workflow tests)
- `npm.cmd run eval:email-formal` and `npm.cmd run eval:fiction-prose` run locally and produce artifacts

## Known limitations

- The bundled profile path supports `profileType: "email-formal"` and `"fiction-prose"`.
- The evaluation harnesses can run in heuristic mode, but real reviewed-mode quality still depends on a configured model-backed provider.
- Human scoring thresholds are defined, but a real human acceptance run is still outstanding.
- Open WebUI, Claude Code, and Codex live smoke tests need to be re-run against this new bundled-profile workflow.
- The current machine still is not set up for live Ollama-backed validation.

## Next recommended work

1. Run both evaluation harnesses with an actual model-backed provider and capture human-scored reports (confirm reviewed beats fast on ≥4/6 tasks per family).
2. Perform live bundled-profile smoke tests in Codex, Claude Code, and Open WebUI for both `email-formal` and `fiction-prose`.
3. Add a small set of real-world failure fixtures for overfit, meaning/POV drift, and style-commentary-instead-of-prose.
4. Consider the next constrained voice family (e.g. executive email, newsletter intro, or a second fiction narrator style).
5. After process quality is stable, add Google Drive ingestion as a source convenience feature.
