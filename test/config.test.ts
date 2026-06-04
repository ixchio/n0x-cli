import { describe, it, expect } from 'vitest';
import { configSchema } from '../src/config/schema.js';
import { LLMClient } from '../src/llm/client.js';

describe('configSchema', () => {
  it('applies defaults', () => {
    const cfg = configSchema.parse({});
    expect(cfg.default_model).toBe('bonsai-4b');
    expect(cfg.base_url).toBe('http://localhost:8080/v1');
    expect(cfg.max_steps).toBe(20);
  });

  it('rejects invalid max_steps', () => {
    expect(() => configSchema.parse({ max_steps: 0 })).toThrow();
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
