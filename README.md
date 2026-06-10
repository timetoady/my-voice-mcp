# My Voice MCP

`my-voice-mcp` is a local-first MCP server that builds compact voice profiles from writing samples, then compares, rewrites, or generates new text in that voice.

The current primary workflow is a process-first formal email flow:

- create a bundled voice profile from multiple curated email samples
- rewrite existing text in that voice
- generate new text in that voice
- compare `fast` versus `reviewed` quality modes with a fixed human review set

## Current MVP surface

- `voice_create_profile` for legacy single-PDF profile creation
- `voice_create_profile_bundle` for preferred multi-sample formal email profile creation
- `voice_compare_text`
- `voice_rewrite_text`
- `voice_generate_text`
- `voice_list_profiles`
- `voice_get_profile`
- `voice_delete_profile`
- `voice_validate_source`

`voice_rewrite_text` and `voice_generate_text` support:

- `qualityMode: "fast"`
- `qualityMode: "reviewed"`

`reviewed` mode uses one internal draft -> critique -> revise loop when a model-backed provider is available. If the server is running in heuristic mode, it falls back to `fast`.

## What is implemented

- TypeScript MCP server on Node 20+
- `stdio` and Streamable HTTP transports from one codebase
- bearer-token HTTP auth with optional localhost dev bypass
- local filesystem profile storage
- single-PDF heuristic profile path
- bundled `email-formal` profile path with:
  - at least 3 samples required
  - email normalization for greetings, signatures, and reply metadata
  - provenance capture
  - stable versus topic-specific marker separation
  - model-backed distillation with heuristic fallback
- provider adapters for:
  - heuristic
  - OpenAI-compatible HTTP
  - Ollama
  - AWS Bedrock
- evaluation harness under `evals/email-formal`

## Quick start

1. Install dependencies

```bash
npm install --no-audit --no-fund
```

2. Build and test

```bash
npm run build
npm test
```

3. Run the email-formal evaluation harness

```bash
npm run eval:email-formal
```

This writes review artifacts to `evals/email-formal/output/`.

4. Start the MCP server

```bash
npm run start:stdio
```

or

```bash
npm run start:http
```

HTTP endpoints:

- `POST /mcp`
- `GET /healthz`

## Provider and Endpoint Setup

This repo has three provider paths in code today:

- `openai-compatible`
- `ollama`
- `bedrock`

That distinction matters:

- `openai-compatible` means any endpoint that accepts OpenAI-style chat completions with a `baseUrl`, bearer token, and model name
- `ollama` is the first-class local-model path already implemented in this repo
- `bedrock` is also an explicit provider path already implemented in this repo

### Support status

Implemented in code:

- `openai-compatible`
- `ollama`
- `bedrock`

Documented compatibility candidates through the generic `openai-compatible` adapter:

- Gemini via Google's OpenAI compatibility endpoint
- Claude via Anthropic's OpenAI SDK compatibility endpoint

Validated on this machine:

- heuristic fallback
- local build, test, and email-formal eval harness

Not yet validated on this machine:

- live model-backed reviewed mode
- live Ollama-backed runs
- live Gemini-backed or Claude-backed compatibility runs

### Generic OpenAI-compatible endpoint

Use this when your provider exposes an OpenAI-style chat completions API.

```powershell
$env:MY_VOICE_PROVIDER="openai-compatible"
$env:MY_VOICE_BASE_URL="https://your-endpoint.example/v1"
$env:MY_VOICE_MODEL="your-model"
$env:MY_VOICE_API_KEY="your-token"
```

### Gemini through the OpenAI-compatible adapter

This repo does not have a native Gemini provider. Use the existing `openai-compatible` adapter.

```powershell
$env:MY_VOICE_PROVIDER="openai-compatible"
$env:MY_VOICE_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
$env:MY_VOICE_MODEL="gemini-3.5-flash"
$env:MY_VOICE_API_KEY="<your-gemini-api-key>"
```

### Claude through the OpenAI-compatible adapter

This repo does not have a native Claude provider. Use the existing `openai-compatible` adapter.

```powershell
$env:MY_VOICE_PROVIDER="openai-compatible"
$env:MY_VOICE_BASE_URL="https://api.anthropic.com/v1/"
$env:MY_VOICE_MODEL="claude-sonnet-4-5"
$env:MY_VOICE_API_KEY="<your-claude-api-key>"
```

Anthropic describes this as an OpenAI SDK compatibility layer rather than the full native Claude API surface, so it is useful for compatibility testing but should not be documented as first-class native support in this repo.

### Ollama as the first-class local runtime

Use this when you want the simplest local-model path currently supported by the repo.

```powershell
$env:MY_VOICE_PROVIDER="ollama"
$env:MY_VOICE_BASE_URL="http://localhost:11434"
$env:MY_VOICE_MODEL="qwen3-coder"
```

### Other locally hosted OpenAI-compatible servers

If you run another local server that exposes an OpenAI-style endpoint, keep the provider as `openai-compatible` and point `MY_VOICE_BASE_URL` to that local server.

```powershell
$env:MY_VOICE_PROVIDER="openai-compatible"
$env:MY_VOICE_BASE_URL="http://127.0.0.1:8000/v1"
$env:MY_VOICE_MODEL="your-local-model"
$env:MY_VOICE_API_KEY="not-needed-or-local-token"
```

### Bedrock: native provider path vs OpenAI-compatible endpoint

This repo already has a native `bedrock` provider path:

```powershell
$env:MY_VOICE_PROVIDER="bedrock"
$env:MY_VOICE_MODEL="<bedrock-model-id>"
$env:MY_VOICE_BEDROCK_REGION="us-east-1"
```

Amazon Bedrock also offers OpenAI-compatible APIs. If you want to use that route instead, treat it as `openai-compatible` rather than `bedrock`:

```powershell
$env:MY_VOICE_PROVIDER="openai-compatible"
$env:MY_VOICE_BASE_URL="https://bedrock-mantle.us-east-1.api.aws/v1"
$env:MY_VOICE_MODEL="<bedrock-openai-compatible-model>"
$env:MY_VOICE_API_KEY="<bedrock-api-key>"
```

## Local LLM Setup

### Recommended local path: Ollama

1. Install Ollama on the machine where `my-voice-mcp` will run.
2. Pull a model:

```powershell
ollama pull qwen3-coder
```

3. Confirm the service is up:

```powershell
curl http://localhost:11434/api/tags
```

4. Set env vars:

```powershell
$env:MY_VOICE_PROVIDER="ollama"
$env:MY_VOICE_BASE_URL="http://localhost:11434"
$env:MY_VOICE_MODEL="qwen3-coder"
```

5. Build and start:

```powershell
npm.cmd run build
node dist/index.js stdio
```

6. Run one rewrite or generate smoke test through your MCP client.

### Advanced local path: another OpenAI-compatible server

1. Start your local server and confirm its OpenAI-style base URL.
2. Confirm the endpoint responds:

```powershell
curl http://127.0.0.1:8000/v1/models
```

3. Set env vars:

```powershell
$env:MY_VOICE_PROVIDER="openai-compatible"
$env:MY_VOICE_BASE_URL="http://127.0.0.1:8000/v1"
$env:MY_VOICE_MODEL="your-local-model"
$env:MY_VOICE_API_KEY="local-token-or-placeholder"
```

4. Build, start, and run one smoke test through the MCP tool flow.

## Environment

- `MY_VOICE_PROVIDER`: `none`, `ollama`, `openai-compatible`, or `bedrock`
- `MY_VOICE_MODEL`: model name or ID
- `MY_VOICE_BASE_URL`: provider base URL for Ollama or OpenAI-compatible APIs
- `MY_VOICE_API_KEY`: bearer token for OpenAI-compatible providers
- `MY_VOICE_BEDROCK_REGION`: AWS region for Bedrock
- `MY_VOICE_HTTP_BEARER_TOKEN`: token required for HTTP MCP access
- `MY_VOICE_HTTP_ALLOW_UNAUTH_LOCALHOST`: allow localhost HTTP calls without a bearer token
- `MY_VOICE_DATA_DIR`: local profile storage directory
- `MY_VOICE_MAX_SOURCE_CHARS`: hard character cap for extracted source text
- `MY_VOICE_MAX_SOURCE_TOKENS`: hard token estimate cap for extracted source text

## Storage layout

Profiles are stored under `profiles/` by default:

```text
profiles/
  index.json
  <voiceId>/
    extracted.txt
    guide.json
    guide.md
    source.pdf                  # legacy single-PDF profiles only
    bundle-sources.json         # bundled profiles only
    samples/                    # bundled profiles only
      01-<sample>.txt
      02-<sample>.txt
```

## Evaluation set

The current review harness lives in `evals/email-formal/` and includes:

- 4 bundled source samples
- 3 rewrite cases
- 3 prompt-to-draft generation cases
- a human review rubric

Use this to compare `fast` and `reviewed` output before claiming process quality.

## Setup guides

- Requirements and decision log: [REQUIREMENTS.md](./REQUIREMENTS.md)
- Active checklist: [TODO.md](./TODO.md)
- Step-by-step testing and MCP client setup: [TESTING.md](./TESTING.md)
- Future long-form fiction handoff: [NOVEL_VOICE_BOOTSTRAP.md](./NOVEL_VOICE_BOOTSTRAP.md)

## Reference docs

- Gemini OpenAI compatibility: [Google AI for Developers](https://ai.google.dev/gemini-api/docs/openai)
- Claude OpenAI SDK compatibility: [Anthropic](https://docs.anthropic.com/en/api/openai-sdk)
- Bedrock OpenAI-compatible APIs: [AWS API compatibility](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html)
- Bedrock Mantle endpoint: [AWS Responses API docs](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html)
