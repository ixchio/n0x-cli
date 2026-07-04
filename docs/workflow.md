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
| 4GB RAM laptop | Ternary Bonsai 4B | `n0x setup` |
| 6GB+ RAM laptop | Ternary Bonsai 8B | `n0x setup` |
| Existing Ollama setup | `qwen2.5-coder:3b` | `ollama pull qwen2.5-coder:3b && n0x use ollama` |
| Custom OpenAI-compatible backend | Your served model | `n0x use http://localhost:PORT/v1` |

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
It asks before applying file writes, edits, patches, deletes, and renames.

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

## 8. Restore Checkpoints

n0x creates checkpoints before apply and interactive runs. List and restore them:
```bash
n0x checkpoints
n0x restore latest
```
Manual backups also live in `~/.n0x/backups/` if you need to dig further.

---

## 9. Backend Setup

```bash
# Check what's running
n0x doctor

# Switch to llama-server
n0x use llama-server

# Switch to Ollama
n0x use ollama

# Auto-detect whichever backend is alive
n0x use auto
```
