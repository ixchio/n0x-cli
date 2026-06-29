/**
 * Bonsai Manager - Auto-download models, manage llama.cpp server
 */

import { spawn, type ChildProcess } from 'child_process';
import { mkdir, access } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { platform } from 'os';
import { ModelDownloader } from './downloader.js';
import { BONSAI_MODELS, detectRAMTier, getModelById, type BonsaiModel } from './models.js';
import { log } from '../lib/logger.js';

export class BonsaiManager {
  private llamaServer?: ChildProcess;
  private modelsDir: string;
  private binDir: string;
  private downloader: ModelDownloader;
  private serverPort: number = 8080;

  constructor(private n0xHome: string) {
    this.modelsDir = join(n0xHome, 'models');
    this.binDir = join(n0xHome, 'bin');
    this.downloader = new ModelDownloader(this.modelsDir);
  }

  async init(): Promise<void> {
    await mkdir(this.modelsDir, { recursive: true });
    await mkdir(this.binDir, { recursive: true });
  }

  /**
   * Recommend best model based on available RAM
   */
  recommendModel(): BonsaiModel {
    const ramInfo = detectRAMTier();
    return ramInfo.recommendedModel;
  }

  /**
   * Get RAM tier information
   */
  getRAMInfo() {
    return detectRAMTier();
  }

  /**
   * Download a model
   */
  async downloadModel(model: BonsaiModel): Promise<string> {
    return this.downloader.downloadModel(model);
  }

  /**
   * Check if model is already downloaded
   */
  async hasModel(modelId: string): Promise<boolean> {
    const model = getModelById(modelId);
    if (!model) return false;

    const modelPath = join(this.modelsDir, model.filename);
    try {
      await access(modelPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get path to model file
   */
  getModelPath(modelId: string): string | null {
    const model = getModelById(modelId);
    if (!model) return null;

    const modelPath = join(this.modelsDir, model.filename);
    return existsSync(modelPath) ? modelPath : null;
  }

  /**
   * Get path to llama-server binary
   */
  async getLlamaServerPath(): Promise<string | null> {
    const plat = platform();
    let binaryName = 'llama-server';
    if (plat === 'win32') binaryName += '.exe';

    // Check bundled binary
    const bundledPath = join(this.binDir, binaryName);
    if (existsSync(bundledPath)) {
      return bundledPath;
    }

    // Check system PATH
    const { execFileSync } = await import('child_process');
    try {
      // SAFE: Using array args prevents command injection
      const result = execFileSync('which', [binaryName], { encoding: 'utf8' });
      return result.trim();
    } catch {
      return null;
    }
  }

  /**
   * Start llama.cpp server
   */
  async startServer(modelPath: string, port: number = 8080): Promise<void> {
    const llamaServerPath = await this.getLlamaServerPath();

    if (!llamaServerPath) {
      throw new Error(
        'llama-server not found. Please install llama.cpp:\n' +
        '  macOS: brew install llama.cpp\n' +
        '  Linux: Download from https://github.com/ggerganov/llama.cpp/releases',
      );
    }

    this.serverPort = port;

    log.info('Starting llama.cpp server', { model: modelPath, port });

    this.llamaServer = spawn(llamaServerPath, [
      '-m', modelPath,
      '--port', port.toString(),
      '-c', '2048', // Context size (2K for small models)
      '-ngl', '0',  // CPU-only
      '--log-disable',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    // Log errors
    this.llamaServer.stderr?.on('data', (data: Buffer) => {
      log.debug('llama-server stderr', { output: data.toString() });
    });

    this.llamaServer.on('error', (err: Error) => {
      log.error('llama-server process error', { error: String(err) });
    });

    this.llamaServer.on('exit', (code: number | null) => {
      log.info('llama-server exited', { code });
      this.llamaServer = undefined;
    });

    // Wait for server to be ready
    await this.waitForServer(port, 30000);
  }

  /**
   * Check if server is running
   */
  async isServerRunning(port: number = this.serverPort): Promise<boolean> {
    try {
      const res = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Wait for server to respond
   */
  private async waitForServer(port: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await this.isServerRunning(port)) {
        return;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    throw new Error('Server failed to start within 30 seconds');
  }

  /**
   * Stop server gracefully
   */
  async stopServer(): Promise<void> {
    if (!this.llamaServer) return;

    log.info('Stopping llama.cpp server');

    this.llamaServer.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 1000));

    if (this.llamaServer && !this.llamaServer.killed) {
      this.llamaServer.kill('SIGKILL');
    }

    this.llamaServer = undefined;
  }

  /**
   * Get all available models
   */
  getAllModels(): BonsaiModel[] {
    return BONSAI_MODELS;
  }
}
