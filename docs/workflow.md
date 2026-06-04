# n0x-cli Workflow

This isn't just an agent; it's a tool meant to fit into your existing development flow. Here is how to use `n0x-cli` effectively:

### 1. Scoping the Task
Don't ask the agent to "build a whole app". It's a local model with a 4B parameter count, not magic.
Give it focused, scoped tasks:
- `n0x run "refactor auth.ts to use the new JWT validation method"`
- `n0x run "write unit tests for the utility functions in src/helpers"`

### 2. Using Interactive Mode
If you're skeptical about what the agent is going to do, run it with the `-i` flag:
```bash
n0x run "update the dependencies" -i
```
It will prompt you with a colored diff before it writes any changes.

### 3. Quick Fixes
When you get a stack trace or an error message, don't waste time googling it. Pipe it to n0x:
```bash
n0x fix "TypeError: Cannot read properties of undefined (reading 'id')"
```

### 4. Git Commits
The killer feature. Once you're done coding, just stage your files and let n0x write the commit message.
```bash
git add .
n0x commit
```
It reads your diff, generates a conventional commit, and applies it for you.
