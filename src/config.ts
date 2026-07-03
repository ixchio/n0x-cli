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
# QUICKSTART (Bonsai — default):
#   llama-server -hf prism-ml/Ternary-Bonsai-4B-gguf --hf-file Ternary-Bonsai-4B-Q2_0.gguf
#   n0x run "your task here"
#
# Prefer Ollama? Uncomment the two lines below and comment out the Bonsai ones:
#   default_model = "qwen2.5-coder:3b"
#   base_url = "http://localhost:11434/v1"

default_provider = "local"
default_model = "ternary-bonsai-4b"
base_url = "http://localhost:8080/v1"
backend = "llama-cpp"
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function inferBackendFromBaseUrl(baseUrl: unknown): N0xConfig['backend'] {
  if (typeof baseUrl !== 'string') return 'llama-cpp';

  try {
    const url = new URL(baseUrl);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (isLocalhost && url.port === '11434') return 'ollama';
    if (isLocalhost && url.port === '8080') return 'llama-cpp';
    return 'openai-compatible';
  } catch {
    return 'llama-cpp';
  }
}

export function normalizeBackend(backend: N0xConfig['backend']): N0xConfig['backend'] {
  return backend === 'llama-server' ? 'llama-cpp' : backend;
}

export function isLocalLlamaServerUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return isLocalhost && (url.port === '8080' || (!url.port && url.protocol === 'http:'));
  } catch {
    return false;
  }
}

export function usesManagedLlamaServer(config: N0xConfig): boolean {
  const backend = normalizeBackend(config.backend);
  return backend === 'llama-cpp' || (backend === 'auto' && isLocalLlamaServerUrl(config.base_url));
}

function backendFromDetection(type: string): N0xConfig['backend'] {
  return type === 'ollama' ? 'ollama' : 'llama-cpp';
}

export async function loadConfig(): Promise<N0xConfig> {
  const path = configPath();
  if (!existsSync(path)) {
    await ensureN0xHome();
    await writeFile(path, CONFIG_TEMPLATE, 'utf8');
    log.info('Created default config', { path });
    return configSchema.parse({});
  }

  let raw: Record<string, unknown>;
  try {
    raw = parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new N0xError(
      'CONFIG_INVALID',
      `Invalid TOML at ${path}: ${errorMessage(error)}`,
      'Fix the config file, or delete it and run: n0x init',
    );
  }

  if (!raw.backend && raw.base_url) {
    raw.backend = inferBackendFromBaseUrl(raw.base_url);
  }

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

  if (cfg.backend === 'auto') {
    const detected = await autoDetectBackend(cfg.base_url);
    if (detected) {
      log.info(`Auto-detected backend: ${detected.type} at ${detected.url}`);
      cfg.base_url = detected.url;
      cfg.backend = backendFromDetection(detected.type);
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
  }

  return cfg;
}

export async function writeDefaultConfig(): Promise<void> {
  await ensureN0xHome();
  if (!existsSync(configPath())) {
    await writeFile(configPath(), CONFIG_TEMPLATE, 'utf8');
  }
}
