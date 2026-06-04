# Changelog

### Unreleased
- **Feature:** Added `n0x commit` for AI-generated conventional commits.
- **Feature:** Added `--interactive` diff preview before applying edits.
- **Feature:** Added git-agnostic file backups (`~/.n0x/backups/`) prior to mutating files.
- **Feature:** Added robust structured JSON tool call extraction for quantized models.
- **Improvement:** `n0x explain` now uses a single-shot inference bypass for lightning-fast responses.
- **Improvement:** `n0x doctor` now pings `llama-server` and outputs currently loaded models and latency.
- **Improvement:** Changed default fallback quantization from `Q1_0` to `Q4_K_M`.
- **Improvement:** Fuzzy-match fallback added to the edit tool to handle indentation hallucinations.
- **Safety:** Token budget warning emitted when context reaches >80% capacity.
- **Safety:** Enabled `noUncheckedIndexedAccess` in TypeScript for tighter type safety.
