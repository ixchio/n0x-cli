# n0x

A terminal coding agent that runs on your laptop. Built for developers who want to use local LLMs for code generation without spending money or needing powerful hardware.

[![CI](https://github.com/ixchio/n0x-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/ixchio/n0x-cli/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/n0x-cli)](https://www.npmjs.com/package/n0x-cli)
[![Downloads](https://img.shields.io/npm/dw/n0x-cli)](https://www.npmjs.com/package/n0x-cli)

---

## What this is

I wanted to build websites using AI assistance but:
- My laptop has 4GB RAM
- I don't want to pay monthly subscriptions
- I prefer running things locally

So I built n0x. It's a ReAct-style coding agent that runs Bonsai models (1-bit quantized LLMs) — they fit in 370MB-1.75GB RAM and work on modest hardware. The agent loops through: think → call tool (read/write/bash) → observe → repeat.

It's not state-of-the-art. But it's free, runs offline, and gets real work done on a 4GB laptop.

**Repository:** [github.com/ixchio/n0x-cli](https://github.com/ixchio/n0x-cli)

---

## Install and run

```bash
npm install -g n0x-cli
cd ~/my-project
n0x run "add dark mode"
```

First run auto-detects your RAM, downloads the appropriate model, starts llama-server. Takes ~2 minutes.

---

## Why this exists (design philosophy)

**Zero cost infrastructure:** Everything runs locally. No API keys, no monthly fees, no usage limits. Download models once, use forever.

**Low-end hardware support:** Built for 4GB laptops. Bonsai uses 1-bit quantization (ternary weights: -1, 0, +1) which compresses models 16× smaller than fp16. The 4B model runs in 860MB.

**No internet dependency:** Works offline. Models download once via HuggingFace. After that, completely air-gapped.

**Educational:** Code is readable TypeScript. The agent loop is ~200 lines. Tool system is pluggable. You can understand and modify how it works.

**Practical tradeoffs:** Bonsai 4B scores ~83% on code benchmarks. Larger models score higher but need more RAM. This is about making AI assistance accessible on hardware you already own.

---

## What it does

The agent can:
- Read and write files
- Execute bash commands (with safety denylist)
- Search with ripgrep/glob
- Apply unified diffs
- Generate git commits
- Persist memory across sessions
- Learn from failures (reflection system)

Basic ReAct loop:
```
1. Read goal
2. Think (LLM inference)
3. Call tool (e.g., Read('src/auth.ts'))
4. Observe result
5. Think again
6. Call next tool
7. Repeat until done (max 20 steps)
```

---

## Commands

```bash
# Core agent
n0x run "refactor auth.ts to use JWT"
n0x run "write tests for utils/" -i      # interactive mode
n0x run "optimize queries" --dry         # preview only

# Utilities
n0x chat                    # REPL
n0x explain src/file.ts     # one-shot explanation
n0x fix "error message"     # auto-patch from stack trace
n0x commit                  # generate commit from staged diff

# Setup
n0x setup                   # hardware detection + model download
n0x doctor                  # check server status
n0x models                  # list available models

# Info
n0x map                     # repo tree
n0x symbols                 # symbol index
n0x reflections             # what the agent learned from failures
```

---

## Models

n0x defaults to **Bonsai via llama-server** (Ternary quantization, runs on CPU):

| Model | RAM | Notes |
|-------|-----|-------|
| Bonsai-4B | 860MB | Recommended for 4GB systems |
| Bonsai-8B | 1.75GB | Better accuracy, needs 8GB |
| Bonsai-1.7B | 370MB | Fastest, lower quality |

Also works with **Ollama** (easier install, native tool calling):
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5-coder:3b
n0x use ollama
```

Or any OpenAI-compatible API endpoint. Set `base_url` and `default_model` in `~/.n0x/config.toml`.

**Model selection logic:**
- 4GB RAM → Bonsai-4B (default)
- 8GB RAM → qwen2.5-coder:3b via Ollama
- 16GB+ RAM → qwen2.5-coder:7b via Ollama

Run `n0x setup` and it auto-detects hardware and suggests the best model.

---

## Configuration

`~/.n0x/config.toml`:

```toml
default_model = "ternary-bonsai-4b"
base_url = "http://localhost:8080/v1"
api_key = "none"
max_steps = 20
bash_timeout_ms = 120000
llm_timeout_ms = 300000

# Web search (requires Tavily API key, free tier available)
tavily_enabled = false
# tavily_api_key = "tvly-..."
```

Override model per-run:
```bash
n0x run --model qwen2.5-coder:7b "complex refactor"
```

Switch backends:
```bash
n0x use ollama        # → port 11434
n0x use llama-server  # → port 8080
n0x use auto          # → auto-detect
```

---

## Architecture

```
src/
├── agent/
│   ├── loop.ts         # Main ReAct loop
│   ├── planner.ts      # Task planning
│   ├── memory.ts       # Persistent notes
│   └── reflection.ts   # Learn from failures
│
├── tools/
│   ├── bash.ts         # Shell execution
│   ├── read.ts         # File reading
│   ├── write.ts        # File writing
│   ├── edit.ts         # In-place string replace
│   ├── patch.ts        # Unified diff application
│   ├── grep.ts         # ripgrep wrapper
│   └── ...
│
├── llm/
│   ├── client.ts       # OpenAI-compatible API client
│   ├── detect.ts       # Backend auto-detection
│   └── health.ts       # Health checks
│
├── context/
│   ├── build.ts        # Context assembly
│   ├── symbols.ts      # Symbol indexing
│   ├── compressor.ts   # Context compression
│   └── session.ts      # Session persistence
│
└── setup/
    ├── manager.ts      # Model lifecycle
    ├── downloader.ts   # Model downloads
    └── ui.ts           # Setup UI
```

The agent is stateless per-run. Context building reads git status, file trees, symbol index. Tools execute in cwd with safety checks (path confinement, bash denylist).

---

## How 1-bit quantization works

Normal models store weights as 16-bit floats (fp16). Bonsai uses **ternary quantization**:
- Each weight becomes -1, 0, or +1
- 16× smaller than fp16
- ~7-10% accuracy loss on benchmarks

This is why Bonsai-4B (860MB) runs where qwen2.5-coder:3b (3GB) would swap on a 4GB system.

**Trade-off:** Lower accuracy for massive memory savings. Practical for code generation on constrained hardware.

---

## Safety mechanisms

- **Path confinement:** Tools reject paths outside workspace (`../` escape blocked)
- **Bash denylist:** Blocks `rm -rf /`, fork bombs, destructive patterns
- **Auto-backups:** Every file edit saved to `~/.n0x/backups/` before mutation
- **Docker sandbox:** Optional containerized execution (`sandbox_docker = true`)
- **Secret redaction:** API keys scrubbed from logs
- **Interactive mode:** Review diffs before applying (`-i` flag)

Undo last action:
```bash
n0x undo
```

---

## Limitations (important)

**Not production-grade AI:**
- Bonsai-4B is 83% accurate on coding benchmarks
- Makes mistakes (use `-i` flag to review diffs)
- Limited context window (2048-4096 tokens depending on model)
- Weaker at complex multi-file refactors

**Hardware constraints:**
- 4GB RAM works but is tight (close other apps during agent runs)
- CPU inference is 10-100× slower than GPU
- Large repos (>10k files) may cause context overflow

**Use cases this is good for:**
- Adding features to small projects
- Writing tests
- Refactoring single files
- Fixing bugs from stack traces
- Learning how AI coding agents work

**Not good for:**
- Production-critical code generation without review
- Large-scale refactors
- Performance-critical operations (use GPU inference)

---

## Development

```bash
git clone https://github.com/ixchio/n0x-cli.git
cd n0x-cli
npm install
npm run dev -- run "test prompt"
```

Run tests:
```bash
npm run check   # typecheck + lint + tests
```

TypeScript strict mode enabled. PRs welcome.

---

## Documentation

- [workflow.md](./docs/workflow.md) — Daily usage patterns
- [development.md](./docs/development.md) — Contributing guide
- [changelog.md](./docs/changelog.md) — Version history

---

## FAQ

**Why 1-bit quantization?**  
Memory efficiency. On a 4GB laptop running VS Code + Docker + browser, you have ~1-2GB free RAM. Normal quantized models (Q4, Q8) don't fit. Ternary weights do.

**Why not just use [commercial service]?**  
This is for people who want free, offline, local-first tools. If you can afford subscriptions and don't care about privacy, commercial services are better.

**Does this work on M1 Macs?**  
Yes. llama-server has native Apple Silicon support.

**Can I use bigger models if I have more RAM?**  
Yes. Set `default_model` in config to any model your system can load. Ollama makes this easy:
```bash
ollama pull qwen2.5-coder:7b
n0x use ollama
```

**How does this compare to [other tool]?**  
It doesn't. This is a free, educational tool for modest hardware. Use whatever works for you.

**Is this secure?**  
Models run locally (can't exfiltrate data). But agents execute bash commands — review prompts carefully. Use `--dry` or `-i` flags when unsure. Enable Docker sandbox for untrusted inputs.

---

## License

MIT

---

## Acknowledgments

- [llama.cpp](https://github.com/ggerganov/llama.cpp) — GGUF inference engine
- [Bonsai models](https://huggingface.co/prism-ml) — 1-bit quantization research
- [Ollama](https://ollama.com) — Easy model distribution
- [MCP](https://modelcontextprotocol.io) — Tool protocol

Built by developers who want accessible AI tooling on modest hardware.
