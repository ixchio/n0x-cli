# Contributing to n0x-cli

Thanks for your interest in contributing. n0x is a local-first coding agent — contributions that keep it fast, lean, and offline-capable are most welcome.

## What we're looking for

- Bug fixes with a clear reproduction case
- New tools that fit the existing agent loop (`src/tools/`)
- Performance improvements to context management
- Better Bonsai model support / llama-server compatibility

## What we're NOT looking for

- Cloud API integrations (this is a local-first project)
- Features that require an internet connection to function
- Dependency bloat

---

## Getting started

```bash
git clone https://github.com/ixchio/n0x-cli.git
cd n0x-cli
npm install
```

Run the full check before touching anything:
```bash
npm run check   # typecheck + lint + tests
```

For local development, use `tsx` to skip the build step:
```bash
npm run dev -- run "your test task"
```

---

## Adding a new tool

1. Create `src/tools/your-tool.ts` implementing the `Tool` interface
2. Register it in `src/tools/index.ts`
3. Add a row to the tool routing table in `src/prompts/system.ts`
4. Write a test in `test/`

See [`docs/development.md`](./docs/development.md) for the full architecture guide.

---

## Pull Request checklist

- [ ] `npm run check` passes (typecheck + lint + all tests green)
- [ ] New behavior has a test in `test/`
- [ ] No new dependencies added without discussion
- [ ] Commit messages follow conventional commits (`feat:`, `fix:`, `refactor:`, etc.)

---

## Commit style

```
feat: add grep tool with ripgrep backend
fix: handle empty context window gracefully
refactor: split agent loop into smaller functions
docs: update model guide for Bonsai 4B
```

---

## Reporting bugs

Open an issue with:
1. Your OS + Node.js version
2. Your `~/.n0x/config.toml` (redact any API keys)
3. The exact command you ran
4. What happened vs what you expected
