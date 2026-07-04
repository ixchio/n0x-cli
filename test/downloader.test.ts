import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelDownloader } from '../src/setup/downloader.js';
import type { BonsaiModel } from '../src/setup/models.js';

const model: BonsaiModel = {
  id: 'test-model',
  name: 'Test Model',
  displayName: 'Test Model',
  ramMB: 1,
  accuracy: 1,
  speed: 'fast',
  downloadUrl: 'https://example.com/model.gguf',
  filename: 'model.gguf',
  description: 'test',
  bestFor: 'test',
};

describe('ModelDownloader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not treat partial files as complete when remote size is known', async () => {
    const root = await mkdtemp(join(tmpdir(), 'n0x-models-'));
    const file = join(root, model.filename);
    await writeFile(file, Buffer.alloc(512 * 1024));

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, {
        status: 200,
        headers: { 'content-length': String(1024 * 1024) },
      })),
    );

    const downloader = new ModelDownloader(root) as unknown as {
      isModelComplete(path: string, model: BonsaiModel): Promise<boolean>;
    };

    await expect(downloader.isModelComplete(file, model)).resolves.toBe(false);
  });
});
