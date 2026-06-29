# n0x-cli 🌿

[![CI](https://github.com/ixchio/n0x-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/ixchio/n0x-cli/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/n0x-cli)](https://www.npmjs.com/package/n0x-cli)
[![Downloads](https://img.shields.io/npm/dw/n0x-cli)](https://www.npmjs.com/package/n0x-cli)

> **Claude Code quality, but local-first for 4GB systems.** No cloud APIs. No subscriptions. Just your machine.

**n0x-cli** is an autonomous ReAct coding agent optimized for **ultra-low RAM systems**. Powered by **Bonsai models** (1-bit quantization), it delivers excellent coding performance while using only **370MB-1.75GB RAM**. Perfect for 4GB laptops running VS Code, Docker, and browsers simultaneously.

**Repository:** [github.com/ixchio/n0x-cli](https://github.com/ixchio/n0x-cli)

---

## ⚡ Quick Start (Under 2 Minutes)

```bash
# 1. Install n0x
npm install -g n0x-cli

# 2. Run (auto-setup on first use!)
cd ~/my-project
n0x run "add a login page"

# First run shows:
🌿 Welcome to n0x!
Detecting hardware...
  ✓ RAM: 4GB (low tier)
  
Recommended: Ternary Bonsai 4B
  • Size: 860MB
  • Quality: 83% accuracy
  • Perfect for 4GB systems
  
Download Ternary Bonsai 4B? [Y/n]: _
```

**That's it!** Model downloads automatically, server starts, and you're coding.

---

## 🎯 Why Choose n0x?

**Perfect for Low-RAM Systems:**
- ✅ **Works on 4GB RAM** (with VS Code, Docker, browsers running)
- ✅ **370MB-1.75GB models** (Ternary Bonsai 1.7B/4B/8B)
- ✅ **83-85% accuracy** (matches larger models)
- ✅ **60-100 tokens/sec** on CPU (no GPU needed)

**Privacy & Cost:**
- ✅ **100% local** - code never leaves your machine
- ✅ **Free forever** - no subscriptions ($0 vs $20/mo for Claude Code)
- ✅ **No internet required** - works offline

**Developer Experience:**
- ✅ **Zero configuration** - auto-setup on first run
- ✅ **Auto-managed server** - starts/stops automatically
- ✅ **Beautiful UI** - clear errors, progress bars
- ✅ **Safe by default** - file backups, approval gates

**🧠 AI Intelligence (NEW):**
- ✅ **Learns from mistakes** - never repeats failed approaches
- ✅ **Cross-session memory** - gets smarter over time
- ✅ **Auto context compression** - never runs out of memory
- ✅ **Smart loop prevention** - forces strategy changes

---

## 📊 Model Comparison (4GB RAM Systems)

| Model | RAM | Accuracy | Your System | Speed |
|-------|-----|----------|-------------|-------|
| **Ternary Bonsai 4B** | **860MB** | **83%** | ✅ **Perfect** | **60-80 tok/s** |
| Ternary Bonsai 8B | 1.75GB | 85% | ⚠️ Must close apps | 40-60 tok/s |
| Ternary Bonsai 1.7B | 370MB | 70% | ✅ Always works | 100+ tok/s |
| qwen2.5-coder:3b | 3GB | 75% | ❌ **Will swap** | Slow |
| Claude Code | Cloud | 90%+ | ❌ Needs cloud | N/A |

**Ternary Bonsai 4B** is the sweet spot for 4GB systems - better quality than larger models that don't fit in RAM!

---

## Commands

```bash
# Core agent (with AI learning!)
n0x run "build a REST API for my blog"      # Main agent loop (learns from mistakes!)
n0x run "add dark mode" --model qwen3:4b    # Override model for one run
n0x run "refactor auth" -i                  # Interactive mode: confirm each diff before writing
n0x run "add tests" --dry                   # Preview only — show diffs, don't write

# NEW: See what the AI learned
n0x reflections                  # Show what agent learned from past failures
n0x reflections --stats          # Show learning statistics

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
