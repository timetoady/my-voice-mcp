# Testing My Voice MCP

This guide is the practical MVP test path. If all sections marked "MVP required" work, we can reasonably call the project a usable MVP.

## What is being tested

There are two separate layers:

1. MCP client connection
   - Codex
   - Claude Code
   - Open WebUI
2. Rewrite backend
   - heuristic fallback
   - Ollama
   - OpenAI-compatible endpoint
   - Bedrock

Ollama is not the MCP client here. It is a model backend used by `my-voice-mcp` when rewriting text.

## Core user flows for MVP

The MVP should support all three of these:

1. Create a voice guide from a source PDF.
2. Rewrite existing text into the selected voice.
3. Generate new content from a prompt in the selected voice.

## Prerequisites

- Node 20+ installed.
- Dependencies installed with `npm install --no-audit --no-fund`.
- Project built with `npm run build`.
- A text-based sample PDF ready for ingestion.

Optional but recommended:

- Ollama installed and running if you want to test local model-backed rewriting.
- Open WebUI running if you want to test HTTP MCP integration.
- Claude Code installed if you want to test Anthropic’s MCP client.
- Codex CLI or Codex app access if you want to test OpenAI’s MCP client.

## Local verification first

Run these from the repo root:

```powershell
npm.cmd run build
npm.cmd test
```

Expected result:

- Build succeeds.
- Test suite passes.

## Start the server

### Option A: stdio server

Use this for Codex and Claude Code local-process testing.

```powershell
node dist/index.js stdio
```

### Option B: HTTP server

Use this for Open WebUI and any HTTP MCP client.

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

- JSON response with `ok: true`.

## Test a real voice profile

Use a real PDF with extractable text. The MVP rejects scanned/image PDFs.

Suggested sample workflow:

1. Create a profile named `email-formal` from a short but representative PDF.
2. Compare a paragraph you wrote recently.
3. Run all three rewrite modes:
   - `rewrite`
   - `hint`
   - `snippet`
4. Generate a fresh draft from a prompt using the same voice.

Success criteria:

- The profile creates successfully.
- Similarity score is returned.
- Rewrite output preserves meaning while shifting style.
- Prompt generation produces original content that still matches the selected voice.

## Codex setup and test

MVP required: yes

Codex supports MCP servers through `config.toml`, and its CLI/IDE share that configuration according to OpenAI’s Codex MCP docs:
- [OpenAI Codex MCP docs](https://developers.openai.com/codex/mcp)
- [OpenAI Docs MCP quickstart](https://developers.openai.com/learn/docs-mcp)

### Codex stdio setup

Add a server with the CLI:

```powershell
codex mcp add my-voice -- node C:\Users\adamandreason\Documents\gitRepos\my-voice-mcp\dist\index.js stdio
```

Verify:

```powershell
codex mcp list
```

Alternative `~/.codex/config.toml` snippet:

```toml
[mcp_servers.my-voice]
command = "node"
args = ["C:/Users/adamandreason/Documents/gitRepos/my-voice-mcp/dist/index.js", "stdio"]
cwd = "C:/Users/adamandreason/Documents/gitRepos/my-voice-mcp"
```

### Codex HTTP setup

If you prefer HTTP:

```toml
[mcp_servers.my-voice]
url = "http://127.0.0.1:3000/mcp"
```

If you disable localhost bypass and require a bearer token:

```toml
[mcp_servers.my-voice]
url = "http://127.0.0.1:3000/mcp"
bearer_token_env_var = "MY_VOICE_HTTP_BEARER_TOKEN"
```

### Codex smoke test prompt

Once the server is loaded in Codex:

```text
Use the my-voice MCP server to validate a source PDF, create a voice profile named "email-formal", compare this paragraph to that profile, then rewrite it in hint mode.
```

Expected result:

- Codex sees the tools.
- The tool calls succeed.
- Returned JSON/text includes the profile id, similarity score, and rewrite hints.

Then test generation:

```text
Use the my-voice MCP server to generate a short welcome email in the "email-formal" voice profile from this prompt: "Welcome a new donor and thank them for supporting the project."
```

## Claude Code setup and test

MVP required: yes

Claude Code’s current MCP docs support both HTTP and stdio transports:
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)

### Claude stdio setup

```powershell
claude mcp add --transport stdio my-voice -- node C:\Users\adamandreason\Documents\gitRepos\my-voice-mcp\dist\index.js stdio
```

Verify:

```powershell
claude mcp list
claude mcp get my-voice
```

### Claude HTTP setup

```powershell
claude mcp add --transport http my-voice http://127.0.0.1:3000/mcp
```

If bearer auth is required:

```powershell
claude mcp add --transport http my-voice http://127.0.0.1:3000/mcp --header "Authorization: Bearer change-me"
```

### Claude smoke test

Inside Claude Code, use:

```text
Use the my-voice MCP tools to create a profile from my sample PDF, compare this draft to that profile, and give me a snippet-mode rewrite.
```

Then test:

```text
Use the my-voice MCP tools to generate a medium-length introduction in that same voice from this prompt: "Introduce a reflective weekly update about creative work and patience."
```

Check `/mcp` if the server does not appear connected.

## Open WebUI setup and test

MVP required: yes for one HTTP client path

Open WebUI’s MCP docs currently say to add MCP servers under Admin Settings → External Tools using Type `MCP (Streamable HTTP)`:
- [Open WebUI MCP docs](https://docs.openwebui.com/features/extensibility/mcp/)
- [Open WebUI FAQ on host access from Docker](https://docs.openwebui.com/faq/)

### Important networking note

If Open WebUI runs in Docker and `my-voice-mcp` runs on the host, your HTTP server must listen on `0.0.0.0`, not only `127.0.0.1`.

The default `.env.example` already uses:

```text
MY_VOICE_HOST=0.0.0.0
```

### Open WebUI steps

1. Start `my-voice-mcp` in HTTP mode.
2. Open Open WebUI as an admin.
3. Go to `Admin Settings -> External Tools`.
4. Click `Add Server`.
5. Set `Type` to `MCP (Streamable HTTP)`.
6. Set URL to:
   - `http://host.docker.internal:3000/mcp` if Open WebUI is in Docker on Windows/macOS
   - or another reachable host/IP for your setup
7. Set Auth:
   - `None` if using localhost/dev bypass
   - `Bearer` if your server requires a token
8. Save.
9. Open a chat and enable the tool from `+ -> Integrations -> Tools`.

### Open WebUI smoke test

Ask the model:

```text
Use the my-voice tool to compare this paragraph against the email-formal voice profile and return a rewrite.
```

Then ask:

```text
Use the my-voice tool to generate a short announcement in the email-formal voice profile from this prompt: "Announce that the next newsletter will include a behind-the-scenes essay."
```

Expected result:

- Tool is available in the chat.
- Tool invocation succeeds.
- The response includes transformed text.

## Ollama backend setup and test

MVP required: yes for one local-model-backed rewrite path

Ollama’s docs confirm:
- local API base URL defaults to `http://localhost:11434/api`
- Anthropic-compatible mode can be used by tools like Claude Code
- [Ollama API intro](https://docs.ollama.com/api/introduction)
- [Ollama Anthropic compatibility](https://docs.ollama.com/api/anthropic-compatibility)

### Start Ollama

Make sure Ollama is running and a model is available:

```powershell
ollama list
```

If needed:

```powershell
ollama pull qwen3-coder
```

### Run my-voice-mcp against Ollama

For stdio or HTTP mode, set:

```powershell
$env:MY_VOICE_PROVIDER="ollama"
$env:MY_VOICE_BASE_URL="http://localhost:11434"
$env:MY_VOICE_MODEL="qwen3-coder"
```

Then start the server:

```powershell
node dist/index.js stdio
```

or

```powershell
node dist/index.js http
```

### Ollama-backed smoke test

Create a profile, then run `voice_rewrite_text` in `rewrite` mode.

Also run `voice_generate_text` with a short prompt.

Success criteria:

- `providerUsed` should be `ollama` if the request succeeds.
- The rewrite should be stronger than the heuristic fallback.
- The generated content should also report `providerUsed: ollama`.

## Suggested real-world MVP test sequence

Run this in order:

1. `npm run build`
2. `npm test`
3. Start stdio server and test in Codex
4. Start stdio or HTTP server and test in Claude Code
5. Start HTTP server and test in Open WebUI
6. Repeat one of the above with Ollama configured as the rewrite backend
7. Repeat one of the above with `voice_generate_text`
8. Record quirks and update `TESTING.md`

If all seven steps work, this is a real testable MVP.

## If something fails

### Build/test failure

- Re-run `npm install --no-audit --no-fund`
- Re-run `npm run build`
- Re-run `npm test`

### PDF is rejected

- Confirm it is a text PDF, not scanned/image-only
- Try a shorter, cleaner sample

### Open WebUI cannot reach the server

- Confirm the server is running on `0.0.0.0`
- Confirm the URL is reachable from the container
- Try `host.docker.internal` on Docker Desktop

### Bearer auth issues

- Confirm the token passed by the client exactly matches `MY_VOICE_HTTP_BEARER_TOKEN`
- If testing locally, temporarily use `MY_VOICE_HTTP_ALLOW_UNAUTH_LOCALHOST=true`

### Ollama rewrite does not trigger

- Confirm:
  - `MY_VOICE_PROVIDER=ollama`
  - `MY_VOICE_BASE_URL=http://localhost:11434`
  - `MY_VOICE_MODEL=<installed-model>`
- Confirm Ollama is running and the model exists with `ollama list`

## Current status

As of the current repo state:

- Automated tests pass
- The server can be built locally
- The docs now define the live client smoke-test path
- Real interactive client smoke tests still need to be performed and checked off in `TODO.md`
