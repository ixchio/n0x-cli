import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configSchema } from '../src/config/schema.js';
import { LLMClient } from '../src/llm/client.js';
import { configPath, loadConfig } from '../src/config.js';

describe('configSchema', () => {
  it('applies defaults', () => {
    const cfg = configSchema.parse({});
    expect(cfg.default_model).toBe('ternary-bonsai-4b');
    expect(cfg.base_url).toBe('http://localhost:8080/v1');
    expect(cfg.backend).toBe('llama-cpp');
    expect(cfg.max_steps).toBe(20);
  });

  it('rejects invalid max_steps', () => {
    expect(() => configSchema.parse({ max_steps: 0 })).toThrow();
  });

  it('preserves local model setup fields', () => {
    const cfg = configSchema.parse({
      default_model: 'ternary-bonsai-4b',
      base_url: 'http://localhost:8080/v1',
      backend: 'llama-cpp',
      model_path: '/home/me/.n0x/models/ternary-bonsai-4b-q2.gguf',
    });

    expect(cfg.backend).toBe('llama-cpp');
    expect(cfg.model_path).toBe('/home/me/.n0x/models/ternary-bonsai-4b-q2.gguf');
  });
});

describe('loadConfig', () => {
  const originalHome = process.env.N0X_HOME;

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (originalHome === undefined) {
      delete process.env.N0X_HOME;
    } else {
      process.env.N0X_HOME = originalHome;
    }
  });

  it('does not auto-detect over an explicit llama-cpp backend', async () => {
    const home = await mkdtemp(join(tmpdir(), 'n0x-config-'));
    process.env.N0X_HOME = home;
    vi.stubGlobal('fetch', vi.fn());

    await writeFile(
      configPath(),
      [
        'default_model = "ternary-bonsai-4b"',
        'base_url = "http://localhost:8080/v1"',
        'backend = "llama-cpp"',
        'model_path = "/home/me/.n0x/models/ternary-bonsai-4b-q2.gguf"',
      ].join('\n'),
      'utf8',
    );

    const cfg = await loadConfig();

    expect(cfg.base_url).toBe('http://localhost:8080/v1');
    expect(cfg.backend).toBe('llama-cpp');
    expect(cfg.model_path).toBe('/home/me/.n0x/models/ternary-bonsai-4b-q2.gguf');
    expect(fetch).not.toHaveBeenCalled();

    await rm(home, { recursive: true, force: true });
  });

  it('auto-detects only when backend is auto', async () => {
    const home = await mkdtemp(join(tmpdir(), 'n0x-config-'));
    process.env.N0X_HOME = home;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).startsWith('http://localhost:11434')) {
          return new Response(JSON.stringify({ data: [{ id: 'qwen2.5-coder:3b' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response('', { status: 404 });
      }),
    );

    await writeFile(
      configPath(),
      [
        'default_model = "ternary-bonsai-4b"',
        'base_url = "http://localhost:8080/v1"',
        'backend = "auto"',
      ].join('\n'),
      'utf8',
    );

    const cfg = await loadConfig();

    expect(cfg.base_url).toBe('http://localhost:11434/v1');
    expect(cfg.backend).toBe('ollama');
    expect(cfg.default_model).toBe('qwen2.5-coder:3b');

    await rm(home, { recursive: true, force: true });
  });
});

describe('LLMClient.isBonsaiModel', () => {
  it('accepts bonsai models', () => {
    expect(LLMClient.isBonsaiModel('bonsai-4b')).toBe(true);
    expect(LLMClient.isBonsaiModel('prism-ml/Bonsai-4B-gguf:Bonsai-4B.gguf')).toBe(true);
  });

  it('rejects non-bonsai', () => {
    expect(LLMClient.isBonsaiModel('gpt-4')).toBe(false);
  });
});
