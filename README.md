# n0x-cli 🌿

[![CI](https://github.com/ixchio/n0x-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/ixchio/n0x-cli/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/n0x-cli)](https://www.npmjs.com/package/n0x-cli)
[![Downloads](https://img.shields.io/npm/dw/n0x-cli)](https://www.npmjs.com/package/n0x-cli)

> A local-first terminal coding agent. No cloud APIs. No subscriptions. Just your machine.

**n0x-cli** is an autonomous ReAct coding agent that runs on **any local LLM** — Ollama, llama-server, or anything with an OpenAI-compatible API. It loops through thoughts, uses tools to read/write/run code, and gets your task done without sending your code to the cloud.

**Repository:** [github.com/ixchio/n0x-cli](https://github.com/ixchio/n0x-cli)

---

## Quick Start (60 seconds)

### Option A — Ollama (Recommended, zero-setup)

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull a model (qwen2.5-coder:3b is the sweet spot for most laptops)
ollama pull qwen2.5-coder:3b

# 3. Install n0x-cli
npm install -g n0x-cli

# 4. Auto-configure n0x for your hardware
n0x setup

# 5. Build something
cd ~/my-project
n0x run "analyze this project and list the entry points"
```

### Option B — Bonsai via llama-server (ultra-tiny RAM)

```bash
# 1. Start llama-server with Bonsai-4B (requires compiled llama.cpp)
llama-server -hf prism-ml/Bonsai-4B-gguf --hf-file Bonsai-4B.gguf

# 2. Install n0x-cli and point it at llama-server
npm install -g n0x-cli
n0x use llama-server

# 3. Run
n0x run "create an index.html coffee shop landing page"
```

---

## Why n0x-cli?

- **No API keys** — runs entirely on your machine.
- **Works with any model** — Ollama, llama-server, or custom OpenAI-compatible endpoint.
- **Smart context** — doesn't blindly stuff your whole repo into the prompt. Uses `.n0xignore`, symbol indexing, and a token budget.
- **Safe by design** — backs up every file before editing. `n0x undo` reverts any change.
- **Built for agents** — real ReAct loop with tool-call parsing, retry logic, and anti-loop detection.

---

## Commands

```bash
# Core agent
n0x run "build a REST API for my blog"      # Main agent loop (max 20 steps by default)
n0x run "add dark mode" --model qwen3:4b    # Override model for one run
n0x run "refactor auth" -i                  # Interactive mode: confirm each diff before writing
n0x run "add tests" --dry                   # Preview only — show diffs, don't write

# Utilities
n0x chat                     # Interactive REPL session
n0x explain src/auth.ts      # Fast single-shot file breakdown
n0x fix "TypeError: ..."     # Auto-patch from a stack trace
n0x commit                   # AI-written conventional commit from staged diff

# Setup & diagnostics
n0x setup                    # Auto-detect RAM, pull best model via Ollama
n0x doctor                   # Check LLM connectivity, tool availability
n0x use ollama               # Switch backend to Ollama (port 11434)
n0x use llama-server         # Switch backend to llama-server (port 8080)
n0x use auto                 # Auto-detect whichever backend is running

# Info
n0x models                   # Full model recommendations with pull commands
n0x map                      # Repo structure tree-map
n0x symbols                  # Symbol index from .n0x/context.json
n0x config                   # Show current config
n0x memory                   # Show/set project memory (persistent agent notes)
```

---

## Model Guide

n0x works with any model, but here are the ones that are tested and reliable:

### Ollama (Recommended — native tool calling, easy install)

| Model | RAM | Best For | Pull Command |
|-------|-----|----------|-------------|
| `qwen2.5-coder:3b` ⭐ | ~2 GB | **Default** — fast, great tool use | `ollama pull qwen2.5-coder:3b` |
| `qwen2.5-coder:7b` | ~5 GB | Complex multi-file refactors | `ollama pull qwen2.5-coder:7b` |
| `qwen3:4b` | ~3 GB | Best reasoning at 4B | `ollama pull qwen3:4b` |
| `gemma3:4b` | ~3 GB | Great instruction following | `ollama pull gemma3:4b` |
| `qwen2.5-coder:14b` | ~9 GB | Near-frontier coding quality | `ollama pull qwen2.5-coder:14b` |

### Bonsai via llama-server (1-bit, ultra-tiny RAM, no GPU required)

| Model | RAM | Notes |
|-------|-----|-------|
| `Bonsai-4B` | ~0.6 GB | Fast, but weaker on long agent tasks |
| `Bonsai-8B` | ~1.2 GB | Better reasoning for complex tasks |

> **Which one should I pick?**
> - 8GB RAM laptop → `qwen2.5-coder:3b` (Ollama)
> - 16GB RAM → `qwen2.5-coder:7b` (Ollama)
> - Only 4GB RAM or need minimal footprint → Bonsai-4B (llama-server)
>
> Run `n0x models` for the full breakdown with pull commands.

---

## Configuration

`~/.n0x/config.toml` — created automatically on first run:

```toml
default_model = "qwen2.5-coder:3b"
base_url = "http://localhost:11434/v1"    # Ollama
api_key = "none"
max_steps = 20
bash_timeout_ms = 120000
llm_timeout_ms = 300000                   # 5 min — plenty for large files

# Tavily web search — off by default (causes context overflow on small models)
tavily_enabled = false
# tavily_api_key = "tvly-..."             # Get a free key at tavily.com
tavily_search_depth = "basic"
```

**Switch model for a single task** (no config edit needed):
```bash
n0x run --model qwen2.5-coder:7b "refactor the entire auth module"
```

**Switch backend permanently:**
```bash
n0x use ollama        # → http://localhost:11434/v1
n0x use llama-server  # → http://localhost:8080/v1
n0x use auto          # → auto-detect whichever is alive
```

---

## The Stack

| Feature | Detail |
|---------|--------|
| **Agent Loop** | ReAct: Think → Act (tool call) → Observe → Repeat |
| **File Tools** | Read, Write, Edit (fuzzy match), ApplyPatch (unified diff), Delete, Rename |
| **Terminal** | Bash execution with safety denylist (no `rm -rf /`, no fork bombs) |
| **Search** | `ripgrep` + `glob` under the hood |
| **MCP** | Plug in `@modelcontextprotocol` servers (GitHub, databases, etc.) |
| **Streaming** | Real-time syntax-highlighted output via `markstream-cli` |
| **Memory** | Persistent project notes across sessions |
| **Backups** | Every file edit backed up to `~/.n0x/backups/` |

---

## Safety

- **Path confinement** — tools cannot escape the workspace via `../`
- **Bash denylist** — blocks `rm -rf /`, fork bombs, and other destructive patterns
- **Docker sandbox** — optional containerized execution (`sandbox_docker = true`)
- **Secret redaction** — API keys are scrubbed from agent logs
- **Auto-backups** — every file write/patch/edit is backed up before mutation
- **`n0x undo`** — reverts the last agent action from backup

---

## Documentation

- [**workflow.md**](./docs/workflow.md) — How to use n0x effectively in your daily dev loop
- [**development.md**](./docs/development.md) — How to hack on n0x itself
- [**changelog.md**](./docs/changelog.md) — What's changed

---

**License:** MIT
