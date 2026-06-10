# My Voice MCP

`my-voice-mcp` is a local-first MCP server that turns a sample PDF into a compact voice profile, then uses that profile to compare, hint, or rewrite new text in the same style.

## What the MVP does

- Ingests one local text-based PDF per voice profile.
- Extracts a compact `guide.json` plus a human-readable `guide.md`.
- Scores incoming text against the saved voice profile.
- Rewrites text in three modes: `rewrite`, `hint`, and `snippet`.
- Generates brand-new content from a prompt in a selected voice profile.
- Supports `stdio` for local MCP clients and Streamable HTTP for Open WebUI or containerized use.
- Uses a provider adapter layer for Ollama, OpenAI-compatible APIs, and AWS Bedrock, with a heuristic fallback when no remote model is configured.

## Quick start

1. Install dependencies:

```bash
npm install --no-audit --no-fund
```

2. Copy `.env.example` to `.env` and set provider/auth values as needed.

3. Build:

```bash
npm run build
```

4. Run over stdio:

```bash
npm run start:stdio
```

5. Run over HTTP:

```bash
npm run start:http
```

The HTTP server exposes:

- `POST /mcp`
- `GET /healthz`

## Environment

- `MY_VOICE_PROVIDER`: `none`, `ollama`, `openai-compatible`, or `bedrock`
- `MY_VOICE_MODEL`: model name or ID
- `MY_VOICE_BASE_URL`: provider base URL for Ollama or OpenAI-compatible APIs
- `MY_VOICE_API_KEY`: bearer token for OpenAI-compatible providers
- `MY_VOICE_BEDROCK_REGION`: AWS region for Bedrock
- `MY_VOICE_HTTP_BEARER_TOKEN`: token required for HTTP MCP access
- `MY_VOICE_HTTP_ALLOW_UNAUTH_LOCALHOST`: allow localhost HTTP calls without a bearer token
- `MY_VOICE_DATA_DIR`: local profile storage directory
- `MY_VOICE_MAX_SOURCE_CHARS`: hard character cap for extracted PDF text
- `MY_VOICE_MAX_SOURCE_TOKENS`: hard token estimate cap for extracted PDF text

## MCP tools

- `voice_create_profile`
- `voice_list_profiles`
- `voice_get_profile`
- `voice_compare_text`
- `voice_rewrite_text`
- `voice_generate_text`
- `voice_delete_profile`
- `voice_validate_source`

## MCP resources

- `voice://profiles`
- `voice://profiles/{voiceId}/summary`
- `voice://profiles/{voiceId}/guide`
- `voice://profiles/{voiceId}/metrics`

## Storage layout

Profiles are stored under `profiles/` by default:

```text
profiles/
  index.json
  <voiceId>/
    source.pdf
    extracted.txt
    guide.json
    guide.md
```

## Notes

- The MVP only supports PDFs with extractable text.
- Scanned/image PDFs are rejected with guidance.
- Similarity scoring is heuristic and deterministic; rewrite quality improves when a model provider is configured.

## Project tracking

- Requirements and decisions: [REQUIREMENTS.md](./REQUIREMENTS.md)
- Working checklist: [TODO.md](./TODO.md)
- Step-by-step client and backend test guide: [TESTING.md](./TESTING.md)
