# Testing My Voice MCP

Last updated: June 10, 2026

This guide is the current step-by-step MVP validation path. The main thing we are validating now is not just whether the MCP connects, but whether the bundled formal-email process is good enough to reduce real editing work.

## Primary workflow to validate

1. Create a bundled `email-formal` voice profile from at least 3 real email samples.
2. Rewrite existing text in that voice with `qualityMode: "reviewed"`.
3. Generate new text in that voice with `qualityMode: "reviewed"`.
4. Compare `fast` versus `reviewed` on the fixed review set.
5. Run human review scoring on the outputs.

Client setup for Codex, Claude Code, and Open WebUI still matters, but it is a delivery check after the process-quality pass.

## Prerequisites

- Node 20+ installed
- Dependencies installed with `npm install --no-audit --no-fund`
- Project built with `npm run build`
- Automated tests passing with `npm test`
- A configured model-backed provider if you want true reviewed-mode quality on this machine

Recommended for this computer:

- OpenAI-compatible endpoint configured through:
  - `MY_VOICE_PROVIDER=openai-compatible`
  - `MY_VOICE_BASE_URL=<base-url>`
  - `MY_VOICE_MODEL=<model>`
  - `MY_VOICE_API_KEY=<token-if-needed>`

Still deferred on this computer:

- live Ollama validation

## Provider and endpoint setup

### What the repo actually supports

Implemented in code:

- `openai-compatible`
- `ollama`
- `bedrock`

Documented compatibility candidates through the existing `openai-compatible` adapter:

- Gemini
- Claude

This means Gemini and Claude can be configured here if their OpenAI-style compatibility endpoints fit the repo's current expectations, but they are not separate first-class provider kinds in `ProviderKind`.

### Generic OpenAI-compatible endpoint

Use this for any hosted or local service that accepts OpenAI-style chat completions.

```powershell
$env:MY_VOICE_PROVIDER="openai-compatible"
$env:MY_VOICE_BASE_URL="https://your-endpoint.example/v1"
$env:MY_VOICE_MODEL="your-model"
$env:MY_VOICE_API_KEY="your-token"
```

### Gemini compatibility example

```powershell
$env:MY_VOICE_PROVIDER="openai-compatible"
$env:MY_VOICE_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
$env:MY_VOICE_MODEL="gemini-3.5-flash"
$env:MY_VOICE_API_KEY="<your-gemini-api-key>"
```

### Claude compatibility example

```powershell
$env:MY_VOICE_PROVIDER="openai-compatible"
$env:MY_VOICE_BASE_URL="https://api.anthropic.com/v1/"
$env:MY_VOICE_MODEL="claude-sonnet-4-5"
$env:MY_VOICE_API_KEY="<your-claude-api-key>"
```

Important note:

- Anthropic documents this as an OpenAI SDK compatibility layer, not the full native Claude API surface.
- In this repo, that makes Claude a compatibility-path option, not native first-class provider support.

### Native Bedrock provider path

```powershell
$env:MY_VOICE_PROVIDER="bedrock"
$env:MY_VOICE_MODEL="<bedrock-model-id>"
$env:MY_VOICE_BEDROCK_REGION="us-east-1"
```

### Bedrock through an OpenAI-compatible endpoint

If you want to point the repo at Bedrock's OpenAI-compatible endpoint instead of using the repo's native Bedrock provider:

```powershell
$env:MY_VOICE_PROVIDER="openai-compatible"
$env:MY_VOICE_BASE_URL="https://bedrock-mantle.us-east-1.api.aws/v1"
$env:MY_VOICE_MODEL="<bedrock-openai-compatible-model>"
$env:MY_VOICE_API_KEY="<bedrock-api-key>"
```

### First-class local path: Ollama

```powershell
$env:MY_VOICE_PROVIDER="ollama"
$env:MY_VOICE_BASE_URL="http://localhost:11434"
$env:MY_VOICE_MODEL="qwen3-coder"
```

### Secondary local path: another OpenAI-compatible server

```powershell
$env:MY_VOICE_PROVIDER="openai-compatible"
$env:MY_VOICE_BASE_URL="http://127.0.0.1:8000/v1"
$env:MY_VOICE_MODEL="your-local-model"
$env:MY_VOICE_API_KEY="local-token-or-placeholder"
```

## Local LLM setup steps

### Ollama workflow

1. Install Ollama.
2. Pull a local model:

```powershell
ollama pull qwen3-coder
```

3. Confirm the service is responding:

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

6. Run one bundled-profile rewrite or generate test through your MCP client.

### Another local OpenAI-compatible server

1. Start the server.
2. Verify its OpenAI-style endpoint:

```powershell
curl http://127.0.0.1:8000/v1/models
```

3. Set env vars for `openai-compatible`.
4. Run:

```powershell
npm.cmd run build
node dist/index.js stdio
```

5. Run one rewrite or generate smoke test.

## Local verification first

Run these commands from the repo root:

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run eval:email-formal
npm.cmd run eval:fiction-prose
```

Expected result:

- build succeeds
- tests pass
- `evals/email-formal/output/latest-report.md` and `.json`
- `evals/fiction-prose/output/latest-report.md` and `.json`

## Formal-email evaluation harness

The fixed review set lives in `evals/email-formal/`.

It includes:

- bundled source samples under `samples/`
- 3 rewrite cases
- 3 generation cases
- a human review rubric

### Run the harness

```powershell
npm.cmd run eval:email-formal
```

### What the harness does

1. creates a bundled `email-formal` profile
2. runs each rewrite case in `fast` mode
3. runs each rewrite case in `reviewed` mode
4. runs each generation case in `fast` mode
5. runs each generation case in `reviewed` mode
6. writes report artifacts for human scoring

### Human acceptance target

- average at least 4/5 for voice match
- average at least 4/5 for usefulness with fewer manual edits
- no case below 3/5 on correctness
- reviewed mode should outperform fast mode in at least 4 of 6 total tasks

## Fiction-prose evaluation harness

The fixed review set lives in `evals/fiction-prose/` (4 bundled prose excerpts in one consistent narrative voice, 3 rewrite cases, 3 scene-continuation cases, and a fiction rubric).

```powershell
npm.cmd run eval:fiction-prose
```

It runs the same fast-vs-reviewed flow as the email harness, but the profile is built with `profileType: "fiction-prose"`, so it also computes narrative metrics (narration distance, pacing, dialogue behavior, etc.) and scores them. Human acceptance target: average ≥4/5 voice match and scene-intent/POV preservation, no case below 3/5 on meaning/coherence, and reviewed beating fast on ≥4/6 tasks.

Note: with no model provider configured, fast and reviewed fall back to the heuristic baseline and read identically; a configured provider is required to exercise the reviewed-vs-fast gap.

## Start the MCP server

### Option A: stdio

Use this for Codex or Claude Code local-process testing.

```powershell
node dist/index.js stdio
```

### Option B: HTTP

Use this for Open WebUI or another Streamable HTTP MCP client.

```powershell
$env:MY_VOICE_HTTP_BEARER_TOKEN="change-me"
$env:MY_VOICE_HTTP_ALLOW_UNAUTH_LOCALHOST="true"
node dist/index.js http
```

Health check:

```powershell
curl http://127.0.0.1:3000/healthz
```

Expected result:

- JSON with `ok: true`

## Recommended live test flow

### Step 1: configure a model-backed provider

Example for an OpenAI-compatible endpoint:

```powershell
$env:MY_VOICE_PROVIDER="openai-compatible"
$env:MY_VOICE_BASE_URL="https://your-endpoint.example/v1"
$env:MY_VOICE_MODEL="your-model"
$env:MY_VOICE_API_KEY="your-token"
```

Then build and start the server:

```powershell
npm.cmd run build
node dist/index.js stdio
```

If you are testing a local OpenAI-compatible server instead, keep the same pattern and only swap `MY_VOICE_BASE_URL`, `MY_VOICE_MODEL`, and `MY_VOICE_API_KEY` as needed.

### Step 2: create a bundled profile

Use `voice_create_profile_bundle` with at least 3 email samples. Each sample can supply:

- `text`
- or local `path`

Input shape:

```json
{
  "voiceName": "formal-email",
  "profileType": "email-formal",
  "description": "My work email voice",
  "samples": [
    { "label": "sample-1", "text": "..." },
    { "label": "sample-2", "text": "..." },
    { "label": "sample-3", "text": "..." }
  ]
}
```

For a fiction voice, set `"profileType": "fiction-prose"` and supply 3+ prose excerpts in one consistent narrative voice instead of emails. The response and `voice://profiles/{voiceId}/metrics` resource then include a `narrativeMetrics` block.

Success checks:

- tool returns a `voiceId`
- warnings are understandable
- `confidenceNotes` are present when useful
- `guide.json` shows stable markers separately from topic-specific ones

### Step 3: test rewrite in reviewed mode

Use `voice_rewrite_text` with:

```json
{
  "voiceId": "<voice-id>",
  "text": "Can you tell me if the timeline still works? We need to know soon.",
  "mode": "rewrite",
  "qualityMode": "reviewed"
}
```

Success checks:

- output preserves meaning
- tone feels closer to the source voice
- `critique` is returned
- output sounds like an email draft, not prompt instructions

### Step 4: test generation in reviewed mode

Use `voice_generate_text` with:

```json
{
  "voiceId": "<voice-id>",
  "prompt": "Draft an email on top-level takeaways from AI Con with ideas about generate-and-score, critique personas, and automating boring important work.",
  "length": "medium",
  "qualityMode": "reviewed"
}
```

Success checks:

- output reads like a real email
- content stays on brief
- voice feels like the bundled samples
- `providerUsed` reports the expected model-backed provider

## Codex setup

Codex supports MCP servers through `config.toml` or the CLI.

### Add the stdio server

```powershell
codex mcp add my-voice -- node C:\Users\adamandreason\Documents\gitRepos\my-voice-mcp\dist\index.js stdio
```

Verify:

```powershell
codex mcp list
```

### Alternative config

```toml
[mcp_servers.my-voice]
command = "node"
args = ["C:/Users/adamandreason/Documents/gitRepos/my-voice-mcp/dist/index.js", "stdio"]
cwd = "C:/Users/adamandreason/Documents/gitRepos/my-voice-mcp"
```

### Codex smoke test prompt

```text
Use the my-voice MCP server to create a bundled email-formal profile from my three sample emails, then rewrite this email in reviewed mode and tell me the similarity score before and after.
```

Then test generation:

```text
Use the my-voice MCP server to generate an email in that same voice about top-level takeaways from AI Con. Use reviewed mode.
```

## Claude Code setup

### Add stdio transport

```powershell
claude mcp add --transport stdio my-voice -- node C:\Users\adamandreason\Documents\gitRepos\my-voice-mcp\dist\index.js stdio
```

Verify:

```powershell
claude mcp list
claude mcp get my-voice
```

### Add HTTP transport

```powershell
claude mcp add --transport http my-voice http://127.0.0.1:3000/mcp
```

If bearer auth is required:

```powershell
claude mcp add --transport http my-voice http://127.0.0.1:3000/mcp --header "Authorization: Bearer change-me"
```

### Claude smoke test prompt

```text
Use the my-voice MCP tools to create a bundled email-formal profile from three real samples, then rewrite this draft in reviewed mode and show the critique fields.
```

## Open WebUI setup

Open WebUI uses the HTTP server path.

### Start the server

```powershell
$env:MY_VOICE_HTTP_BEARER_TOKEN="change-me"
$env:MY_VOICE_HTTP_ALLOW_UNAUTH_LOCALHOST="true"
node dist/index.js http
```

### Add the server in Open WebUI

1. Open Open WebUI as an admin.
2. Go to `Admin Settings -> External Tools`.
3. Choose `Add Server`.
4. Set `Type` to `MCP (Streamable HTTP)`.
5. Set `URL` to:
   - `http://host.docker.internal:3000/mcp` if Open WebUI runs in Docker on Windows/macOS
   - or another reachable host/IP for your environment
6. Set auth:
   - `None` for localhost/dev bypass
   - `Bearer` if your server requires a token
7. Save and enable the tool in chat.

### Open WebUI smoke test prompt

```text
Use the my-voice tool to create a bundled formal email profile from these samples, then generate a reviewed-mode email in that voice asking for quick feedback on a proposal.
```

## Ollama backend setup

Supported, but still deferred on this computer until Ollama is available locally.

When a machine with Ollama is available:

```powershell
$env:MY_VOICE_PROVIDER="ollama"
$env:MY_VOICE_BASE_URL="http://localhost:11434"
$env:MY_VOICE_MODEL="qwen3-coder"
node dist/index.js stdio
```

Then repeat the same bundled-profile rewrite and generation tests.

## If something fails

### Build or test failure

- re-run `npm install --no-audit --no-fund`
- re-run `npm run build`
- re-run `npm test`

### Bundle creation is rejected

- confirm there are at least 3 samples
- confirm each sample has real body text, not mostly greeting/signature
- shorten oversized samples

### Reviewed mode falls back to fast

- confirm a model-backed provider is configured
- confirm `MY_VOICE_PROVIDER` is not `none`
- check the logs for provider or JSON-parsing failures

### Wrong base URL shape

- confirm the base URL includes the provider's OpenAI-style root, not a docs URL or browser console URL
- for Gemini, use `https://generativelanguage.googleapis.com/v1beta/openai/`
- for Anthropic compatibility, use `https://api.anthropic.com/v1/`
- for local OpenAI-style servers, confirm whether the server expects `/v1`

### Auth mismatch

- confirm the token type matches the endpoint you chose
- do not reuse an OpenAI key against Gemini, Claude, or Bedrock endpoints
- if the local OpenAI-style server ignores auth, still pass a placeholder only if the server tolerates it

### Model naming mismatch

- confirm the model name is valid for that specific endpoint
- do not assume model names transfer across providers
- if the provider has a `models` endpoint, query it first

### JSON critique parsing failure

- reviewed mode depends on the provider returning machine-readable critique output
- if a provider returns malformed JSON, the service may warn and degrade to a simpler path
- inspect logs for provider failure details before assuming the prompt logic is wrong

### HTTP auth problems

- confirm the bearer token matches `MY_VOICE_HTTP_BEARER_TOKEN`
- if testing locally, temporarily use `MY_VOICE_HTTP_ALLOW_UNAUTH_LOCALHOST=true`

### Open WebUI cannot reach the server

- confirm the server is listening on `0.0.0.0`
- confirm the URL is reachable from the container or host
- try `host.docker.internal` on Docker Desktop

## Reference docs

- Gemini OpenAI compatibility: [Google AI for Developers](https://ai.google.dev/gemini-api/docs/openai)
- Claude OpenAI SDK compatibility: [Anthropic](https://docs.anthropic.com/en/api/openai-sdk)
- Bedrock OpenAI-compatible APIs: [AWS API compatibility](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html)
- Bedrock Mantle endpoint: [AWS Responses API docs](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html)

## Current status

As of June 10, 2026:

- build passes
- tests pass
- `npm run eval:email-formal` runs locally
- bundled formal-email workflow is implemented
- live client validation and human acceptance scoring still remain
