import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renameTool } from '../src/tools/rename.js';
import { deleteTool } from '../src/tools/delete.js';
import type { ToolContext } from '../src/tools/types.js';

function ctx(cwd: string, editMode: ToolContext['editMode']): ToolContext {
  return {
    cwd,
    editMode,
    sandboxDocker: false,
    sandboxImage: '',
    config: { bash_timeout_ms: 1000 } as ToolContext['config'],
  };
}

describe('destructive edit tools', () => {
  it('does not rename files in dry mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'n0x-tools-'));
    await writeFile(join(root, 'a.txt'), 'hello');

    const result = await renameTool.execute(
      { from: 'a.txt', to: 'b.txt' },
      ctx(root, 'dry'),
    );

    expect(result.isError).toBeUndefined();
    expect(existsSync(join(root, 'a.txt'))).toBe(true);
    expect(existsSync(join(root, 'b.txt'))).toBe(false);
  });

  it('does not delete files in dry mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'n0x-tools-'));
    await writeFile(join(root, 'a.txt'), 'hello');

    const result = await deleteTool.execute({ path: 'a.txt' }, ctx(root, 'dry'));

    expect(result.isError).toBeUndefined();
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('hello');
  });

  it('does not overwrite an existing rename target', async () => {
    const root = await mkdtemp(join(tmpdir(), 'n0x-tools-'));
    await writeFile(join(root, 'a.txt'), 'source');
    await writeFile(join(root, 'b.txt'), 'target');

    const result = await renameTool.execute(
      { from: 'a.txt', to: 'b.txt' },
      ctx(root, 'apply'),
    );

    expect(result.isError).toBe(true);
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('source');
    expect(await readFile(join(root, 'b.txt'), 'utf8')).toBe('target');
  });
});
