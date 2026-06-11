# n0x-cli Workflow

Fit `n0x` into your existing dev loop — it's not a replacement for thinking, it's a multiplier.

---

## 1. The Right Mental Model

n0x is a **ReAct agent** — it Thinks, Acts (calls a tool), Observes the result, and repeats. Each "step" is one tool call. The default limit is 20 steps.

Think of each `n0x run` like giving a focused task to a junior dev who works fast but needs clear instructions.

**Good prompts:**
```bash
n0x run "refactor auth.ts to use the new JWT validation method"
n0x run "write unit tests for all functions in src/helpers/"
n0x run "add a dark mode toggle to the navbar in index.html"
```

**Less effective:**
```bash
n0x run "build a whole app"      # Too vague, no clear end state
n0x run "fix everything"         # Not actionable
```

---

## 2. Picking the Right Model

Your model determines how well n0x performs. Run `n0x models` to see options.

| Situation | Model | Command |
|-----------|-------|---------|
| 8GB RAM laptop | `qwen2.5-coder:3b` | `ollama pull qwen2.5-coder:3b` |
| 16GB RAM | `qwen2.5-coder:7b` | `ollama pull qwen2.5-coder:7b` |
| Complex reasoning task | `qwen3:4b` | `ollama pull qwen3:4b` |
| Minimal RAM / offline | `Bonsai-4B` | llama-server required |

Switch model for a single run without touching config:
```bash
n0x run --model qwen2.5-coder:7b "refactor the entire auth module"
```

---

## 3. Interactive Mode (When You're Nervous)

If you don't fully trust what the agent will do, use `-i`:
```bash
n0x run "update all dependencies" -i
```
It'll show you a colored diff and ask `Apply this? [y/N]` before touching any file.

---

## 4. Quick Fixes from Stack Traces

Got an error? Don't Google it — pipe it to n0x:
```bash
n0x fix "TypeError: Cannot read properties of undefined (reading 'id')"
# Or point at a log file:
n0x fix ./logs/error.log
```

---

## 5. Git Commits

Stage your files, then let n0x write a conventional commit message:
```bash
git add .
n0x commit
```
It reads your diff, generates `feat(auth): add JWT refresh token support`, and applies it.

---

## 6. Explaining Unfamiliar Code

Single-shot explanation of any file (fast, no agent loop):
```bash
n0x explain src/agent/loop.ts
```

---

## 7. Token Budget Tips

Agents fail when context gets too large. Help n0x stay lean:

- Add large generated files to `.n0xignore` (e.g. `dist/`, `*.min.js`)
- Give scoped goals — "update the login form" not "update the whole frontend"
- Disable web search for coding tasks: `tavily_enabled = false` in `~/.n0x/config.toml`
- Use `n0x init` once per project — it builds a symbol index so the agent finds files faster

---

## 8. Undo Anything

n0x backs up every file before editing. Revert the last change:
```bash
n0x undo
```
Manual backups live in `~/.n0x/backups/` if you need to dig further.

---

## 9. Backend Setup

```bash
# Check what's running
n0x doctor

# Switch to Ollama (recommended)
n0x use ollama

# Switch to llama-server
n0x use llama-server

# Auto-detect whichever backend is alive
n0x use auto
```
