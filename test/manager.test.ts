import { describe, expect, it } from 'vitest';
import { selectLlamaServerAsset, type LlamaReleaseAsset } from '../src/setup/manager.js';

describe('selectLlamaServerAsset', () => {
  const assets: LlamaReleaseAsset[] = [
    {
      name: 'llama-b9999-bin-ubuntu-cuda-cu12.4-x64.zip',
      browser_download_url: 'https://example.com/cuda.zip',
    },
    {
      name: 'llama-b9999-bin-ubuntu-x64.tar.gz',
      browser_download_url: 'https://example.com/linux.tar.gz',
    },
    {
      name: 'llama-b9999-bin-macos-arm64.tar.gz',
      browser_download_url: 'https://example.com/macos.tar.gz',
    },
    {
      name: 'llama-b9999-bin-win-vulkan-x64.zip',
      browser_download_url: 'https://example.com/windows.zip',
    },
  ];

  it('selects the Linux CPU tarball before accelerated builds', () => {
    expect(selectLlamaServerAsset(assets, 'linux', 'x64')?.name).toBe(
      'llama-b9999-bin-ubuntu-x64.tar.gz',
    );
  });

  it('supports macOS tarballs', () => {
    expect(selectLlamaServerAsset(assets, 'darwin', 'arm64')?.name).toBe(
      'llama-b9999-bin-macos-arm64.tar.gz',
    );
  });

  it('supports Windows zip archives', () => {
    expect(selectLlamaServerAsset(assets, 'win32', 'x64')?.name).toBe(
      'llama-b9999-bin-win-vulkan-x64.zip',
    );
  });
});
