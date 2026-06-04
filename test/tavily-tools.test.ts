import { describe, it, expect } from 'vitest';
import { buildTools } from '../src/tools/index.js';
import { configSchema } from '../src/config/schema.js';

describe('Tavily tools', () => {
  it('registers WebSearch and WebExtract when enabled', () => {
    const config = configSchema.parse({ tavily_enabled: true });
    const tools = buildTools(config);
    const names = tools.map((t) => t.name);
    expect(names).toContain('WebSearch');
    expect(names).toContain('WebExtract');
  });

  it('omits Tavily tools when disabled', () => {
    const config = configSchema.parse({ tavily_enabled: false });
    const tools = buildTools(config);
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('WebSearch');
    expect(names).not.toContain('WebExtract');
  });
});
