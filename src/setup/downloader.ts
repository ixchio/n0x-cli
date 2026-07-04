/**
 * Model downloader with progress tracking
 */

import { createWriteStream, type WriteStream } from 'node:fs';
import { access, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import chalk from 'chalk';
import type { BonsaiModel } from './models.js';

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  speedMBps: number;
  etaSeconds: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

const BYTES_PER_MB = 1024 * 1024;
const MIN_MODEL_SIZE_RATIO = 0.9;

export class ModelDownloader {
  constructor(private modelsDir: string) {}

  async downloadModel(
    model: BonsaiModel,
    onProgress?: ProgressCallback,
  ): Promise<string> {
    const modelPath = resolve(this.modelsDir, model.filename);
    const partialPath = `${modelPath}.partial`;

    // Check if already exists and is complete
    if (await this.isModelComplete(modelPath, model)) {
      return modelPath;
    }

    await mkdir(dirname(modelPath), { recursive: true });
    await unlink(partialPath).catch(() => undefined);

    console.log(chalk.cyan(`\n📦 Downloading ${model.displayName}...`));
    console.log(chalk.dim(`   Source: ${this.truncateUrl(model.downloadUrl)}`));
    console.log(chalk.dim(`   Size: ~${Math.round(model.ramMB)}MB\n`));

    const response = await fetch(model.downloadUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    const totalBytes = parseContentLength(response.headers.get('content-length'));
    let downloadedBytes = 0;
    const startTime = Date.now();

    const fileStream = createWriteStream(partialPath, { flags: 'wx' });
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!fileStream.write(value)) {
          await waitForStream(fileStream, 'drain');
        }
        downloadedBytes += value.length;

        const progress = calculateProgress(downloadedBytes, totalBytes, startTime);

        if (onProgress) {
          onProgress(progress);
        }

        // Update progress bar
        this.renderProgressBar(downloadedBytes, totalBytes, progress.speedMBps);
      }

      await finishStream(fileStream);

      const minimumBytes = minimumModelBytes(model);
      if (totalBytes > 0 && downloadedBytes !== totalBytes) {
        throw new Error(
          `Incomplete download: expected ${totalBytes} bytes, got ${downloadedBytes} bytes`,
        );
      }
      if (downloadedBytes < minimumBytes) {
        throw new Error(
          `Downloaded file is too small: expected at least ${minimumBytes} bytes, got ${downloadedBytes} bytes`,
        );
      }

      await rename(partialPath, modelPath);
      console.log(chalk.green(`\n✓ Download complete: ${modelPath}\n`));
      return modelPath;
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      fileStream.destroy();
      await unlink(partialPath).catch(() => undefined);
      throw error;
    }
  }

  private renderProgressBar(downloaded: number, total: number, speedMBps: number): void {
    const barWidth = 40;
    const downloadedMB = (downloaded / (1024 * 1024)).toFixed(1);

    if (total <= 0) {
      process.stdout.write(
        `\r   ${downloadedMB} MB  ${chalk.yellow(`${speedMBps.toFixed(1)} MB/s`)}`,
      );
      return;
    }

    const percent = Math.min(100, Math.max(0, (downloaded / total) * 100));
    const filled = Math.min(barWidth, Math.max(0, Math.floor((percent / 100) * barWidth)));
    const empty = barWidth - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const totalMB = (total / (1024 * 1024)).toFixed(1);

    process.stdout.write(
      `\r   [${chalk.cyan(bar)}] ${downloadedMB}/${totalMB} MB  ${chalk.yellow(`${speedMBps.toFixed(1)} MB/s`)}`,
    );
  }

  private async isModelComplete(path: string, model: BonsaiModel): Promise<boolean> {
    try {
      await access(path);
      const stats = await stat(path);
      if (!stats.isFile() || stats.size <= 0) return false;

      const expectedBytes = await this.getRemoteContentLength(model.downloadUrl);
      if (expectedBytes > 0) {
        return stats.size === expectedBytes;
      }

      return stats.size >= minimumModelBytes(model);
    } catch {
      return false;
    }
  }

  private async getRemoteContentLength(url: string): Promise<number> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return 0;
      return parseContentLength(response.headers.get('content-length'));
    } catch {
      return 0;
    }
  }

  private truncateUrl(url: string): string {
    const maxLen = 70;
    if (url.length <= maxLen) return url;
    return url.substring(0, maxLen - 3) + '...';
  }
}

function parseContentLength(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function minimumModelBytes(model: BonsaiModel): number {
  return Math.floor(model.ramMB * MIN_MODEL_SIZE_RATIO * BYTES_PER_MB);
}

function calculateProgress(
  downloadedBytes: number,
  totalBytes: number,
  startTime: number,
): DownloadProgress {
  const elapsed = Math.max((Date.now() - startTime) / 1000, 0.001);
  const bytesPerSecond = downloadedBytes / elapsed;
  const speedMBps = bytesPerSecond / BYTES_PER_MB;
  const percent = totalBytes > 0 ? Math.min(100, (downloadedBytes / totalBytes) * 100) : 0;
  const etaSeconds = totalBytes > 0 && bytesPerSecond > 0
    ? Math.max(0, (totalBytes - downloadedBytes) / bytesPerSecond)
    : Number.POSITIVE_INFINITY;

  return {
    downloadedBytes,
    totalBytes,
    percent,
    speedMBps,
    etaSeconds,
  };
}

async function waitForStream(
  stream: WriteStream,
  event: 'drain' | 'finish',
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onEvent = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const cleanup = (): void => {
      stream.off(event, onEvent);
      stream.off('error', onError);
    };

    stream.once(event, onEvent);
    stream.once('error', onError);
  });
}

async function finishStream(stream: WriteStream): Promise<void> {
  const finished = waitForStream(stream, 'finish');
  stream.end();
  await finished;
}
