# Changelog

## v0.4.0 — 2026-06-11

**🚀 n0x is now model-agnostic — Ollama is the recommended backend**

### Breaking Changes
- Default model changed from `bonsai-4b` to `qwen2.5-coder:3b`
- Default `base_url` changed from `http://localhost:8080/v1` (llama-server) to `http://localhost:11434/v1` (Ollama)
- `tavily_enabled` now defaults to `false` (was causing context overflow on small models)
- `tavily_search_depth` now defaults to `basic` (was `advanced`)
- `llm_timeout_ms` now defaults to `300000` (5 min, was 2 min)

### New Features
- **`n0x setup`** — One command to detect your RAM and pull the optimal model via Ollama
- **`--model` flag on `n0x run`** — Override model for a single task without editing config
- **Ollama auto-detection** — If your configured backend is offline, n0x probes both `:8080` and `:11434` and uses whichever is live
- **`n0x use`** — Switch backends with `n0x use ollama`, `n0x use llama-server`, or `n0x use auto`
- **Real-time syntax-highlighted streaming** via `markstream-cli` (Shiki-powered, same engine as VS Code)

### Improvements
- Removed `validateBonsai()` gate — n0x now works with any model (qwen, gemma, llama, bonsai, etc.)
- `n0x doctor` now shows backend type (Ollama vs llama-server), model name, and more helpful error messages
- `n0x models` shows full recommendation table with pull commands
- Updated `n0x init` output to show both Ollama and llama-server options

### Why this change?
Bonsai 4B at Q1_0 quantization only generated ~32 tokens after processing web search results — not enough to write meaningful code. The root issue is 1-bit quantization sacrifices reasoning for size. `qwen2.5-coder:3b` via Ollama has native tool-calling support, generates complete files reliably, and installs in seconds with `ollama pull`.

---

## v0.3.x — 2026-06-05

- **`markstream-cli` integration** — real-time syntax-highlighted streaming
- **`n0x use` command** — switch between Ollama and llama-server backends
- **Ollama auto-detection** — probes `:8080` and `:11434` in parallel
- **Enhanced `n0x doctor`** — shows backend type and model name

## v0.2.0 — 2026-06-05

- Replaced plaintext streaming with `markstream-cli` syntax highlighting
- Added `⠋ Thinking...` spinner during model inference

## v0.1.3 — 2026-06-04

- **Fix:** Regex-based tool call fallback for llama-server peg-native output
- **Fix:** LLM timeout increased to 300s for large code generation tasks

## v0.1.2 — 2026-06-04

- Initial publish with Bonsai + llama-server support
- ReAct agent loop with full tool suite
- `n0x commit`, `n0x explain`, `n0x fix`, `n0x chat`
- File backups before every edit
- Docker sandbox support
- Tavily web search integration
