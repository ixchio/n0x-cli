import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
} from '../src/lib/checkpoint.js';

describe('checkpoints', () => {
  it('restores modified and deleted files and removes new files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'n0x-checkpoint-'));
    try {
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'src', 'a.ts'), 'original a', 'utf8');
      await writeFile(join(root, 'src', 'b.ts'), 'original b', 'utf8');

      const checkpoint = await createCheckpoint(root, 'test snapshot');

      await writeFile(join(root, 'src', 'a.ts'), 'changed a', 'utf8');
      await rm(join(root, 'src', 'b.ts'));
      await writeFile(join(root, 'src', 'new.ts'), 'new file', 'utf8');

      const result = await restoreCheckpoint(root, checkpoint.id);

      expect(result.restored).toBe(2);
      expect(result.removed).toBe(1);
      await expect(readFile(join(root, 'src', 'a.ts'), 'utf8')).resolves.toBe('original a');
      await expect(readFile(join(root, 'src', 'b.ts'), 'utf8')).resolves.toBe('original b');
      expect(existsSync(join(root, 'src', 'new.ts'))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('lists newest checkpoint first', async () => {
    const root = await mkdtemp(join(tmpdir(), 'n0x-checkpoint-'));
    try {
      await writeFile(join(root, 'a.txt'), 'a', 'utf8');
      const first = await createCheckpoint(root, 'first');
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await createCheckpoint(root, 'second');

      const checkpoints = await listCheckpoints(root);

      expect(checkpoints.map((c) => c.id)).toEqual([second.id, first.id]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
