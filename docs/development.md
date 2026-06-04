# Hacking on n0x-cli

Want to add a new tool or fix a bug? The codebase is designed to be highly modular.

### Local Setup
```bash
git clone https://github.com/ixchio/n0x-cli.git
cd n0x-cli
npm install
```

### Running Locally
You don't need to build every time you make a change. Use `tsx` to run the CLI directly from source:
```bash
npm run dev -- run "test command"
npm run dev -- explain src/cli.ts
```

### Architecture Overview
- `src/cli.ts`: The main entry point (Commander.js).
- `src/agent/loop.ts`: The core ReAct loop. Parses tool calls, handles LLM responses, and manages context budget.
- `src/tools/`: Where all the agent capabilities live. To add a new tool, implement the `Tool` interface and add it to `src/tools/index.ts`.
- `src/llm/client.ts`: The fetch wrapper for talking to `llama-server`.

### Quality Standards
Before submitting a PR, make sure you run:
```bash
npm run check
```
This runs TypeScript (`noUncheckedIndexedAccess` is enabled!), ESLint, and Vitest.
