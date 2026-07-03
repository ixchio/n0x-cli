# n0x

A local-first coding agent for laptops that should not be running coding agents.

n0x reads your repo, edits files, runs shell commands, writes tests, explains code,
and can generate commits. The default setup runs a tiny Bonsai GGUF model through
`llama-server`, so it works on machines where normal coding models would swap
the system to death.

[![CI](https://github.com/ixchio/n0x-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/ixchio/n0x-cli/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/n0x-cli)](https://www.npmjs.com/package/n0x-cli)
[![Downloads](https://img.shields.io/npm/dw/n0x-cli)](https://www.npmjs.com/package/n0x-cli)

## Why n0x exists

Most coding agents assume one of two things:

- you are fine sending your repo to a hosted model
- your machine has enough RAM for a serious local model

That leaves out a lot of people: students, cheap VPS users, old ThinkPads,
offline setups, privacy-sensitive work, and anyone who just does not want another
monthly bill.

n0x is the opposite bet. It is small, local, hackable, and honest about the
tradeoff. Bonsai is not a frontier model. It will not beat Claude Code on a hard
multi-file refactor. But it can run locally, for free, on modest hardware, and it
can still do useful work.

## Install

```bash
npm install -g n0x-cli
```

Then run it inside a project:

```bash
cd ~/my-project
n0x run "add a dark mode toggle"
```

On first run, n0x creates `~/.n0x/config.toml`, helps you choose a model,
downloads it, and starts the local backend.

Check your setup any time:

```bash
n0x doctor
```

## What it can do

```bash
# Core agent loop
n0x run "fix the login redirect bug"
n0x run "write tests for src/auth.ts" --dry
n0x run "refactor this module" -i
n0x run --model qwen2.5-coder:7b "clean up the API layer"

# Interactive session
n0x chat

# One-shot utilities
n0x explain src/server.ts
n0x fix "TypeError: Cannot read properties of undefined"
n0x commit

# Project context
n0x init
n0x map
n0x symbols
n0x memory
n0x reflections
n0x checkpoint "before refactor"
n0x checkpoints
n0x restore latest

# Models and backends
n0x setup
n0x models
n0x use llama-server
n0x use ollama
n0x use auto
```

Inside `n0x chat`, use slash commands:

```text
/help
/status
/model qwen2.5-coder:7b
/memory
/checkpoint before risky edit
/checkpoints
/restore latest
/clear
/exit
```

## How it works

n0x is a ReAct-style agent:

```text
read goal
build context
make a plan
call a tool
observe output
repeat
```

The model gets tools for reading files, editing files, applying patches,
searching with ripgrep/glob, running bash, and inspecting the repo. The loop is
plain TypeScript, not a hidden service.

The default backend is:

```text
n0x -> llama-server -> local GGUF model
```

You can also point it at Ollama or any OpenAI-compatible endpoint:

```text
n0x -> Ollama
n0x -> OpenAI-compatible local or remote server
```

## Models

n0x defaults to Bonsai through `llama-server`.

| Model | Approx RAM | Use it for |
| --- | ---: | --- |
| Ternary Bonsai 1.7B | 370MB | very low RAM, small edits |
| Ternary Bonsai 4B | 860MB | default for 4GB-ish machines |
| Ternary Bonsai 8B | 1.75GB | better quality if you have room |

If you already use Ollama:

```bash
ollama pull qwen2.5-coder:3b
n0x use ollama
n0x run --model qwen2.5-coder:3b "write tests for utils"
```

For a custom OpenAI-compatible server, edit `~/.n0x/config.toml`:

```toml
default_model = "your-model"
base_url = "http://localhost:8000/v1"
backend = "openai-compatible"
api_key = "none"
```

## Configuration

The config lives at:

```text
~/.n0x/config.toml
```

Typical llama-server config:

```toml
default_provider = "local"
default_model = "ternary-bonsai-4b"
base_url = "http://localhost:8080/v1"
backend = "llama-cpp"
api_key = "none"

max_steps = 20
bash_timeout_ms = 120000
llm_timeout_ms = 300000
stream_output = true

sandbox_docker = false
sandbox_image = "node:22-alpine"

model_path = "/home/you/.n0x/models/ternary-bonsai-4b-q2.gguf"

tavily_enabled = false
tavily_search_depth = "basic"
tavily_extract_depth = "basic"
# tavily_api_key = "tvly-..."
```

Backend rules are simple:

- `backend = "llama-cpp"` uses your GGUF file and can auto-start `llama-server`
- `backend = "ollama"` calls Ollama on port `11434`
- `backend = "openai-compatible"` calls whatever `base_url` points to
- `backend = "auto"` probes common local ports and uses what is alive

`n0x use ...` updates both `base_url` and `backend`.

## Safety

n0x is an agent that can edit files and run commands. Treat it like a junior
developer with shell access.

What is built in:

- `--dry` previews changes without writing files
- `-i` asks before applying writes and patches
- apply/interactive runs create a checkpoint before the agent can edit
- `n0x restore latest` reverts the workspace to the last checkpoint
- file tools are confined to the current workspace
- symlink traversal is blocked
- risky shell patterns like `rm -rf /`, fork bombs, and `curl | bash` are denied
- existing files are backed up under `~/.n0x/backups/` before mutation
- Docker sandboxing is available with `sandbox_docker = true`

There is no magic trust layer. Review diffs for important code.

## When to use it

Good fits:

- small apps
- tests
- one-file refactors
- bug fixes from stack traces
- code explanation
- learning how coding agents work
- offline or private repos

Bad fits:

- big architecture rewrites
- production-critical edits without review
- huge monorepos on tiny context windows
- tasks where you need frontier-model reasoning

If you have a strong hosted agent and do not care about local/offline use, use
that. n0x is for the other cases.

## Troubleshooting

Run this first:

```bash
n0x doctor
```

If the model file exists but n0x says it is not configured, check:

```toml
backend = "llama-cpp"
model_path = "/absolute/path/to/model.gguf"
base_url = "http://localhost:8080/v1"
```

If n0x is using Ollama when you wanted llama-server:

```bash
n0x use llama-server
n0x doctor
```

If you want Ollama:

```bash
ollama serve
ollama pull qwen2.5-coder:3b
n0x use ollama
n0x run --model qwen2.5-coder:3b "your task"
```

If `llama-server` is missing:

```bash
which llama-server
```

Install llama.cpp, then rerun:

```bash
n0x doctor
```

If the model gets lost in context, use a narrower prompt:

```bash
n0x run "only edit src/auth.ts: add validation for empty email"
```

Or reduce the run:

```bash
n0x run --max-steps 8 --dry "inspect the bug and propose a patch"
```

If an agent run made bad edits:

```bash
n0x checkpoints
n0x restore latest
```

Restore is destructive by design: it returns the workspace to the checkpoint and
removes files created after that checkpoint. Use git too.

## Architecture

```text
src/
  agent/       loop, planner, memory, reflection
  tools/       read, write, edit, patch, bash, grep, glob
  llm/         OpenAI-compatible client, backend detection, health checks
  context/     repo context, symbols, session, compression
  setup/       model download, llama-server lifecycle, terminal UI
  config/      schema and config parsing
```

The important files:

- `src/agent/loop.ts` is the main ReAct loop
- `src/tools/` is the tool surface
- `src/llm/client.ts` is the OpenAI-compatible chat client
- `src/config.ts` owns config loading and backend selection
- `src/setup/manager.ts` starts `llama-server`

## Development

```bash
git clone https://github.com/ixchio/n0x-cli.git
cd n0x-cli
npm install
npm run dev -- run "read the repo and summarize it" --dry
```

Checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

One command:

```bash
npm run check
```

## FAQ

### Is this trying to replace Claude Code?

No. Claude Code is better for hard agentic coding. n0x is for local, cheap,
offline, low-RAM work. Different constraint, different product.

### Why Bonsai?

Because memory is the bottleneck on cheap machines. Ternary weights make the
model small enough to run where normal local coding models do not fit.

### Can I use bigger models?

Yes. Use Ollama or point `base_url` at another OpenAI-compatible server.

```bash
ollama pull qwen2.5-coder:7b
n0x use ollama
n0x run --model qwen2.5-coder:7b "refactor the router"
```

### Does it work offline?

Yes after the model is downloaded. Web search is off by default.

### Is it secure?

The model can run locally, and tools are constrained, but this is still an
agent with filesystem and shell access. Use `--dry`, `-i`, git, and code review.

## License

MIT

## Credits

- [llama.cpp](https://github.com/ggerganov/llama.cpp) for local GGUF inference
- [Prism](https://huggingface.co/prism-ml) for Bonsai models
- [Ollama](https://ollama.com) for easy local model serving
- [MCP](https://modelcontextprotocol.io) for the tool protocol
