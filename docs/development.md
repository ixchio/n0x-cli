# Hacking on n0x-cli

Want to add a tool, fix a bug, or extend the agent? The codebase is modular and typed end-to-end.

---

## Local Setup

```bash
git clone https://github.com/ixchio/n0x-cli.git
cd n0x-cli
npm install
```

You need Node.js 20+ and a running LLM backend (Ollama recommended):
```bash
ollama pull qwen2.5-coder:3b
```

---

## Running from Source

Use `tsx` to run without compiling:
```bash
npm run dev -- run "test task"
npm run dev -- explain src/cli.ts
npm run dev -- doctor
```

---

## Architecture

```
src/
├── cli.ts              # Commander.js entry point — all commands defined here
├── config.ts           # Config loading, default template, auto-detection
├── constants.ts        # Model lists, context budgets, recommendations
│
├── agent/
│   ├── loop.ts         # ⭐ Core ReAct loop — LLM → parse tool calls → execute → repeat
│   ├── planner.ts      # Optional plan generation before the loop starts
│   └── memory.ts       # Persistent project notes (memory.json)
│
├── llm/
│   ├── client.ts       # Fetch wrapper for OpenAI-compatible chat/completions
│   ├── detect.ts       # Auto-detect Ollama / llama-server by probing ports
│   ├── health.ts       # Health check for /models endpoint
│   └── types.ts        # ChatMessage, ToolDef, LLMResponse types
│
├── tools/
│   ├── index.ts        # Tool registry — buildTools(), getToolByName(), executeTool()
│   ├── types.ts        # Tool interface definition
│   ├── bash.ts         # Bash execution with denylist
│   ├── write.ts        # Write file
│   ├── read.ts         # Read file
│   ├── edit.ts         # In-place string replace (fuzzy match)
│   ├── patch.ts        # Unified diff apply
│   ├── grep.ts         # ripgrep wrapper
│   ├── glob.ts         # Glob file search
│   ├── search-dir.ts   # Directory tree search
│   ├── delete.ts       # Delete file
│   ├── rename.ts       # Rename/move file
│   ├── web-search.ts   # Tavily web search
│   └── web-extract.ts  # Tavily URL extraction
│
├── context/
│   ├── build.ts        # Builds agent context (repo map, symbol index, git diff)
│   ├── symbols.ts      # Symbol index builder (functions, classes, exports)
│   ├── session.ts      # Session persistence (saves conversation to disk)
│   └── chunk.ts        # Token budget chunking
│
├── prompts/
│   └── system.ts       # System prompt for the ReAct agent
│
└── lib/
    ├── errors.ts       # N0xError with code + hint
    ├── logger.ts       # Debug logging
    ├── retry.ts        # withRetry() utility
    ├── backup.ts       # File backup before mutation
    └── output.ts       # truncate(), redactSecrets()
```

---

## Adding a New Tool

1. Create `src/tools/my-tool.ts` implementing the `Tool` interface:

```typescript
import type { Tool } from './types.js';

export const myTool: Tool = {
  name: 'MyTool',
  description: 'What it does (shown to the model)',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'First param' },
    },
    required: ['param1'],
  },
  async execute({ param1 }, { cwd, editMode }) {
    // your logic here
    return { output: `Did the thing with ${param1}`, isError: false };
  },
};
```

2. Register it in `src/tools/index.ts` — add to the `buildTools()` array and the `toolDefinitions` export.

3. Add a row to the system prompt's tool routing table in `src/prompts/system.ts`.

---

## Switching the Default Model

Edit `src/constants.ts`:
```typescript
export const DEFAULT_MODEL = 'qwen2.5-coder:7b';
export const DEFAULT_BASE_URL = 'http://localhost:11434/v1';
```

---

## Quality Standards

Before submitting a PR:
```bash
npm run check   # typecheck + lint + tests (all 3 must pass)
npm run build   # ensure it compiles clean
```

TypeScript is strict — `noUncheckedIndexedAccess`, `strict: true`. No `any` allowed without a comment.

---

## Versioning

We use `npm version minor|patch` to bump versions. Every publish runs the full `check` + `build` chain via `prepublishOnly`.
