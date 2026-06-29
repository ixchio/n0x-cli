import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse } from 'smol-toml';
import { N0X_DATA_DIR, N0X_HOME_ENV } from './constants.js';
import { configSchema, type N0xConfig } from './config/schema.js';
import { N0xError } from './lib/errors.js';
import { log } from './lib/logger.js';
import { autoDetectBackend } from './llm/detect.js';

export type { N0xConfig, ProjectMemory } from './config/schema.js';
export { memorySchema } from './config/schema.js';

export function getN0xHome(): string {
  return process.env[N0X_HOME_ENV] ?? join(homedir(), N0X_DATA_DIR);
}

export function configPath(): string {
  return join(getN0xHome(), 'config.toml');
}

export function memoryPath(): string {
  return join(getN0xHome(), 'memory.json');
}

export function mcpConfigPath(): string {
  return join(getN0xHome(), 'mcp.json');
}

export async function ensureN0xHome(): Promise<string> {
  const home = getN0xHome();
  await mkdir(home, { recursive: true });
  return home;
}

export async function hasConfig(): Promise<boolean> {
  return existsSync(configPath());
}

const CONFIG_TEMPLATE = `# n0x — local-first coding agent
# Docs: https://github.com/ixchio/n0x-cli
#
# QUICKSTART (recommended):
#   curl -fsSL https://ollama.com/install.sh | sh
#   ollama run qwen2.5-coder:3b
#   n0x run "your task here"
#
# Using Bonsai (llama-server)?
#   llama-server -hf prism-ml/Bonsai-4B-gguf --hf-file Bonsai-4B.gguf
#   Then set: base_url = "http://localhost:8080/v1" and default_model = "bonsai-4b"

default_provider = "local"
default_model = "qwen2.5-coder:3b"
base_url = "http://localhost:11434/v1"
api_key = "none"
max_steps = 20
bash_timeout_ms = 120000
llm_timeout_ms = 300000
git_context = true
stream_output = true
sandbox_docker = false
sandbox_image = "node:22-alpine"

# Tavily web search — disabled by default (causes context overflow on small models)
# Get a free key at https://tavily.com then uncomment:
tavily_enabled = false
# tavily_api_key = "tvly-..."
tavily_search_depth = "basic"
tavily_extract_depth = "basic"
`;


export async function loadConfig(): Promise<N0xConfig> {
  const path = configPath();
  if (!existsSync(path)) {
    await ensureN0xHome();
    await writeFile(path, CONFIG_TEMPLATE, 'utf8');
    log.info('Created default config', { path });
    return configSchema.parse({});
  }

  const raw = parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  const envKey = process.env.TAVILY_API_KEY?.trim();
  if (envKey && !raw.tavily_api_key) {
    raw.tavily_api_key = envKey;
  }

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new N0xError(
      'CONFIG_INVALID',
      `Invalid config at ${path}: ${result.error.message}`,
      'Run: n0x init',
    );
  }

  const cfg = result.data;

  // Auto-detect backend: probe llama-server first, then Ollama as a last resort.
  // Ollama is intentionally deprioritized for Bonsai because its Qwen3 chat
  // template forces <think> tokens on every response, which defeats 1-bit
  // quantization. We still accept it as a fallback so users with non-Bonsai
  // configs aren't broken, but we log a loud warning when it's chosen.
  const detected = await autoDetectBackend(cfg.base_url);
  if (detected && detected.url !== cfg.base_url) {
    log.info(`Auto-detected backend: ${detected.type} at ${detected.url}`);
    cfg.base_url = detected.url;
    if (detected.type === 'ollama') {
      log.warn(
        'Ollama is not the recommended backend for Bonsai models. ' +
          'The Qwen3 chat template forces thinking tokens on every response. ' +
          'Use llama-server for reliable Bonsai behavior.',
      );
      if (detected.model) {
        cfg.default_model = detected.model;
      }
    }
  }

  return cfg;
}

export async function writeDefaultConfig(): Promise<void> {
  await ensureN0xHome();
  if (!existsSync(configPath())) {
    await writeFile(configPath(), CONFIG_TEMPLATE, 'utf8');
  }
}
