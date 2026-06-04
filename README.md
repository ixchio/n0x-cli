# n0x-cli

[![CI](https://github.com/ixchio/n0x-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/ixchio/n0x-cli/actions/workflows/ci.yml)

Local-first terminal coding agent powered by **Bonsai** models only. No cloud LLM auth.

**Repository:** [github.com/ixchio/n0x-cli](https://github.com/ixchio/n0x-cli)

```
User goal → Plan → Gather context → Agent loop (Think → Tool → Observe) → Done
```

## Features

| Feature | Description |
|---------|-------------|
| Agent loop | Think → Act → Observe → repeat until DONE |
| File tools | Read, Write, Edit (exact match), Delete, Rename |
| Terminal | Bash with safety denylist + optional Docker sandbox |
| Search | ripgrep + glob |
| Planning | Auto task breakdown before execution |
| Context | Relevant files only (token savings) |
| Memory | `~/.n0x/memory.json` |
| Repo map | `n0x map` — framework, routes, deps |
| MCP | `~/.n0x/mcp.json` — GitHub, filesystem, etc. |
| Web search | [Tavily](https://www.tavily.com/) SDK — `WebSearch` + `WebExtract` |

## Quick start

### 1. Start Bonsai

```bash
llama-server -hf prism-ml/Bonsai-4B-gguf:Q1_0
```

Server: `http://localhost:8080/v1`

### 2. Install n0x

```bash
git clone https://github.com/ixchio/n0x-cli.git
cd n0x-cli
npm install
npm run build
npm link
```

### 3. Initialize & verify

```bash
n0x init
n0x doctor
```

### 4. Run

```bash
n0x run "analyze this project and list entry points"
n0x chat
n0x map
```

## Commands

| Command | Description |
|---------|-------------|
| `n0x run "<goal>"` | Run agent on a goal |
| `n0x chat` | Interactive REPL |
| `n0x doctor` | Check LLM, rg, Docker, config |
| `n0x init` | Create `~/.n0x` config |
| `n0x map` | Repository structure map |
| `n0x memory` | View/set project memory |
| `n0x config` | Show configuration |

## Config (`~/.n0x/config.toml`)

```toml
default_model = "bonsai-4b"
base_url = "http://localhost:8080/v1"
api_key = "none"
max_steps = 50
bash_timeout_ms = 120000
llm_timeout_ms = 120000
sandbox_docker = false

# Tavily — https://www.tavily.com/
tavily_enabled = true
tavily_search_depth = "advanced"
tavily_extract_depth = "advanced"
# tavily_api_key = "tvly-..."   # or: export TAVILY_API_KEY=tvly-...
```

Free API key at [tavily.com](https://www.tavily.com/). Without a key, n0x uses Tavily **keyless mode** (shared rate limit).

## Models (Bonsai only)

| Alias | HuggingFace |
|-------|-------------|
| `bonsai-4b` | `prism-ml/Bonsai-4B-gguf:Q1_0` |
| `bonsai-1.7b` | `prism-ml/Bonsai-1.7B-gguf:Q1_0` |

Apple Silicon (MLX):

```bash
mlx_lm.server --model "prism-ml/Ternary-Bonsai-1.7B-mlx-2bit"
```

## MCP (`~/.n0x/mcp.json`)

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/your/project"]
    }
  }
}
```

## Development

```bash
npm run dev -- run "hello"
npm run check    # typecheck + lint + test
npm run test
```

## Safety

- Paths confined to workspace (no `../` escape)
- Bash denylist blocks `rm -rf /`, fork bombs, etc.
- Optional Docker sandbox (`sandbox_docker = true`)
- Secrets redacted in logs

## License

MIT
