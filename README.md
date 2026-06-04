# n0x-cli 🌿

[![CI](https://github.com/ixchio/n0x-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/ixchio/n0x-cli/actions/workflows/ci.yml)

> I just wanted to build my coffee shop website easily using Bonsai models. So I built this.

**n0x-cli** is a fast, local-first terminal coding agent designed specifically to run on **Bonsai** models. It skips the cloud API keys and limits so you can just spin up a local model and get straight to building your projects. It's an autonomous ReAct agent that loops through thoughts, acts on your codebase, and gets the job done.

**Repository:** [github.com/ixchio/n0x-cli](https://github.com/ixchio/n0x-cli)

---

### Why n0x-cli?

Because it should be easy to build apps locally:
- **Local compute**: Runs on `llama-server` with `prism-ml/Bonsai` models. Fast as hell.
- **Smart Context**: It doesn't blindly stuff your whole repo into the context window. It surgically picks relevant files, uses `.n0xignore`, and tracks its own token budget.
- **Trust via `n0x undo`**: The #1 reason people hate agents is they destroy files. `n0x` automatically backs up files to `~/.n0x/backups` before any edit, write, or patch. Plus, `--interactive` mode lets you confirm every diff. 
- **Killer workflow features**: One-shot explanations (`n0x explain`), git-aware commit generation (`n0x commit`), and interactive REPLs (`n0x chat`).

---

## The Stack

| Feature | What it actually does |
|---------|-------------|
| **Agent Loop** | Think → Act (use a tool) → Observe → Repeat until DONE. |
| **File Ops** | Read, Write, Edit (fuzzy + AST-safe), Delete, Rename. |
| **Terminal** | Bash execution with a safety denylist (no fork bombs) + Docker sandbox. |
| **Search** | Superfast `ripgrep` + `glob` under the hood. |
| **MCP** | Plug in `@modelcontextprotocol` servers for GitHub, DBs, etc. |
| **Tavily Web** | SDK built-in for deep web searches when the agent gets stuck. |

---

## Commands You'll Actually Use

```bash
n0x run "refactor the auth flow"  # The main agent loop (max 20 steps)
n0x run "fix login" -i            # Interactive mode: confirm every single diff before it saves
n0x commit                        # Reads staged files, writes a conventional commit, prompts to apply
n0x explain src/utils.ts          # Fast, single-shot breakdown of what a file does
n0x fix "error text"              # Auto-patch based on a stack trace
n0x chat                          # Interactive REPL session
n0x doctor                        # Pings your local LLM server and checks your environment
n0x map                           # Generates a tree-map of your repo structure
```

---

## Model Guide

Bonsai models punch way above their weight. Here's what we recommend:

| Task | Model to use |
|------|-------|
| **Fast edits** | `prism-ml/Bonsai-1.7B-gguf:Q4_K_M` |
| **Daily Driver (Default)** | `prism-ml/Bonsai-4B-gguf:Q4_K_M` |
| **Complex Refactors** | `prism-ml/Bonsai-8B-gguf:Q4_K_M` |
| **Apple Silicon (Macs)** | `prism-ml/Bonsai-8B-mlx-1bit` |

*Pro-tip: Run `n0x models` in your terminal for a full breakdown.*

---

## Quick Start (Get it running in 60s)

### 1. Fire up Bonsai
We recommend `llama-server`. Just let it run in the background.
```bash
llama-server -hf prism-ml/Bonsai-4B-gguf:Q4_K_M
```
*(Runs on `http://localhost:8080/v1`)*

### 2. Install n0x
```bash
npm install -g n0x-cli
```

### 3. Initialize your project
Go to any codebase you want to work on:
```bash
cd ~/my-project
n0x init      # Builds symbol index, sets up .n0xignore
n0x doctor    # Confirms LLM is reachable and models are loaded
```

### 4. Let it rip
```bash
n0x run "analyze this project and list entry points"
```

---

## Configuration

Your global config lives in `~/.n0x/config.toml`. It looks something like this:

```toml
default_model = "bonsai-4b"
base_url = "http://localhost:8080/v1"
api_key = "none"
max_steps = 20
bash_timeout_ms = 120000
llm_timeout_ms = 120000

# Tavily (Keyless mode by default, or bring your own API key)
tavily_enabled = true
tavily_search_depth = "advanced"
```

---

## Documentation

Check out the `docs/` folder for deeper dives:
- [**workflow.md**](./docs/workflow.md): How to actually use n0x effectively in your daily dev loop.
- [**development.md**](./docs/development.md): How to hack on n0x itself.
- [**changelog.md**](./docs/changelog.md): What's new.

---

## Safety First
- **Confined Paths**: Tools cannot escape the workspace via `../`.
- **Bash Denylist**: Hardcoded rules block `rm -rf /`, fork bombs, etc.
- **Docker Sandbox**: Optional containerized execution (`sandbox_docker = true`).
- **Secret Redaction**: API keys are scrubbed from the agent logs.
- **Backups**: Every file edit automatically backs up the old version to `~/.n0x/backups/`.

---

**License:** MIT
