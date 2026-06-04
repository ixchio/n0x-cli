import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveWithinWorkspace } from '../src/lib/paths.js';
import { N0xError } from '../src/lib/errors.js';

describe('resolveWithinWorkspace', () => {
  it('resolves relative paths inside workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'n0x-test-'));
    await writeFile(join(root, 'a.txt'), 'hello');
    const resolved = resolveWithinWorkspace(root, 'a.txt');
    expect(resolved).toBe(join(root, 'a.txt'));
  });

  it('denies path traversal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'n0x-test-'));
    expect(() => resolveWithinWorkspace(root, '../../../etc/passwd')).toThrow(N0xError);
  });

  it('allows nested paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'n0x-test-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'index.ts'), 'x');
    const resolved = resolveWithinWorkspace(root, 'src/index.ts');
    expect(resolved.endsWith('src/index.ts')).toBe(true);
  });
});
