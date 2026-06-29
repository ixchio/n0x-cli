/**
 * Model downloader with progress tracking
 */

import { createWriteStream } from 'fs';
import { access, stat } from 'fs/promises';
import { resolve } from 'path';
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

export class ModelDownloader {
  constructor(private modelsDir: string) {}

  async downloadModel(
    model: BonsaiModel,
    onProgress?: ProgressCallback,
  ): Promise<string> {
    const modelPath = resolve(this.modelsDir, model.filename);

    // Check if already exists and is complete
    if (await this.isModelComplete(modelPath, model.downloadUrl)) {
      return modelPath;
    }

    console.log(chalk.cyan(`\n📦 Downloading ${model.displayName}...`));
    console.log(chalk.dim(`   Source: ${this.truncateUrl(model.downloadUrl)}`));
    console.log(chalk.dim(`   Size: ~${Math.round(model.ramMB)}MB\n`));

    const response = await fetch(model.downloadUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    const totalBytes = parseInt(response.headers.get('content-length') || '0');
    let downloadedBytes = 0;
    const startTime = Date.now();

    const fileStream = createWriteStream(modelPath);
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(value);
        downloadedBytes += value.length;

        const elapsed = (Date.now() - startTime) / 1000;
        const speedMBps = (downloadedBytes / elapsed) / (1024 * 1024);
        const percent = (downloadedBytes / totalBytes) * 100;
        const remaining = totalBytes - downloadedBytes;
        const etaSeconds = remaining / (downloadedBytes / elapsed);

        if (onProgress) {
          onProgress({
            downloadedBytes,
            totalBytes,
            percent,
            speedMBps,
            etaSeconds,
          });
        }

        // Update progress bar
        this.renderProgressBar(downloadedBytes, totalBytes, speedMBps);
      }

      fileStream.end();
      console.log(chalk.green(`\n✓ Download complete: ${modelPath}\n`));
      return modelPath;
    } catch (error) {
      fileStream.end();
      throw error;
    }
  }

  private renderProgressBar(downloaded: number, total: number, speedMBps: number): void {
    const percent = (downloaded / total) * 100;
    const barWidth = 40;
    const filled = Math.floor((percent / 100) * barWidth);
    const empty = barWidth - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const downloadedMB = (downloaded / (1024 * 1024)).toFixed(1);
    const totalMB = (total / (1024 * 1024)).toFixed(1);

    process.stdout.write(
      `\r   [${chalk.cyan(bar)}] ${downloadedMB}/${totalMB} MB  ${chalk.yellow(`${speedMBps.toFixed(1)} MB/s`)}`,
    );
  }

  private async isModelComplete(path: string, _url: string): Promise<boolean> {
    try {
      await access(path);
      const stats = await stat(path);

      // Quick check: if file exists and is >100MB, assume it's complete
      // Could add checksum verification here
      if (stats.size > 100 * 1024 * 1024) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  private truncateUrl(url: string): string {
    const maxLen = 70;
    if (url.length <= maxLen) return url;
    return url.substring(0, maxLen - 3) + '...';
  }
}
