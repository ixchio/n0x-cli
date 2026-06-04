import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSymbolIndex } from '../src/context/symbols.js';

describe('buildSymbolIndex', () => {
  it('extracts exported functions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'n0x-sym-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(
      join(root, 'src', 'foo.ts'),
      'export function hello() {}\nexport class Bar {}\n',
      'utf8',
    );
    const ctx = await buildSymbolIndex(root);
    const names = ctx.symbols.map((s) => s.name);
    expect(names).toContain('hello');
    expect(names).toContain('Bar');
  });
});
