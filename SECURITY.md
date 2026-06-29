# Security Policy

## Supported Versions

Only the latest release on npm receives security fixes.

| Version | Supported |
|---------|-----------|
| latest (0.6.x) | ✅ |
| < 0.6.0 | ❌ |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: `ixchio@proton.me`

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Your suggested fix (optional)

You will receive a response within 72 hours. If the vulnerability is confirmed, a patch will be released as soon as possible and you will be credited in the changelog.

## Threat model

n0x-cli runs entirely locally. The main attack surfaces are:

- **Bash tool**: Commands executed inside the workspace. The denylist in `src/tools/bash-policy.ts` blocks the most dangerous patterns, but n0x is not a sandbox. Run `sandbox_docker = true` for untrusted workspaces.
- **Path traversal**: All file tools enforce workspace confinement. Paths containing `../` that escape the workspace are rejected.
- **Config file**: `~/.n0x/config.toml` is not encrypted. Do not store high-value API keys there — use environment variables instead.
- **LLM output**: The agent executes what the model tells it to. Always review with `--dry` or `--interactive` on unfamiliar codebases.
