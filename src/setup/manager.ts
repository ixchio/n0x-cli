/**
 * Bonsai Manager - Auto-download models, manage llama.cpp server
 */

import { spawn, type ChildProcess } from 'child_process';
import { mkdir, access } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { platform, arch } from 'os';
import { ModelDownloader } from './downloader.js';
import { BONSAI_MODELS, detectRAMTier, getModelById, type BonsaiModel } from './models.js';
import { log } from '../lib/logger.js';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { chmod, unlink } from 'fs/promises';
import AdmZip from 'adm-zip';

const LLAMA_CPP_VERSION = 'b4086';

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
   * Download and extract llama-server for current platform if missing
   */
  async ensureLlamaServer(): Promise<string> {
    const existingPath = await this.getLlamaServerPath();
    if (existingPath) return existingPath;

    const plat = platform();
    const a = arch();
    let url = '';

    if (plat === 'darwin' && a === 'x64') url = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-macos-x64.zip`;
    else if (plat === 'darwin' && a === 'arm64') url = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-macos-arm64.zip`;
    else if (plat === 'linux' && a === 'x64') url = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-ubuntu-x64.zip`;
    else if (plat === 'linux' && a === 'arm64') url = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-ubuntu-arm64.zip`;
    else if (plat === 'win32' && a === 'x64') url = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-win-cuda-cu12.2.0-x64.zip`;
    else throw new Error(`Unsupported platform for auto-download: ${plat}-${a}. Please install llama.cpp manually.`);

    let binaryName = 'llama-server';
    if (plat === 'win32') binaryName += '.exe';

    const targetPath = join(this.binDir, binaryName);
    const tempPath = targetPath + '.zip';

    log.info(`Downloading llama-server ${LLAMA_CPP_VERSION}...`);
    console.log(`\n📦 Downloading llama-server (latest)...`);
    
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
    
    const fileStream = createWriteStream(tempPath);
    await pipeline(response.body, fileStream);

    const zip = new AdmZip(tempPath);
    const entries = zip.getEntries();
    const serverEntry = entries.find(e => e.entryName.includes('llama-server') || e.entryName.includes('server'));
    if (!serverEntry) throw new Error('llama-server not found in archive');

    zip.extractEntryTo(serverEntry, this.binDir, false, true, false, binaryName);

    if (plat !== 'win32') await chmod(targetPath, 0o755);
    await unlink(tempPath);

    return targetPath;
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
    const llamaServerPath = await this.ensureLlamaServer();

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
