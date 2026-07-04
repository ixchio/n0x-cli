/**
 * Bonsai Manager - Auto-download models, manage llama.cpp server
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { access, chmod, copyFile, mkdir, mkdtemp, readdir, rm, unlink } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { basename, join } from 'path';
import { arch, platform, tmpdir } from 'os';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { promisify } from 'node:util';
import { ModelDownloader } from './downloader.js';
import { BONSAI_MODELS, detectRAMTier, getModelById, type BonsaiModel } from './models.js';
import { log } from '../lib/logger.js';
import { pipeline } from 'node:stream/promises';
import AdmZip from 'adm-zip';

const LLAMA_CPP_RELEASE_API = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest';
const execFileAsync = promisify(execFile);
const ACCELERATED_LLAMA_BUILDS = [
  'cann',
  'cuda',
  'kompute',
  'musa',
  'openvino',
  'rocm',
  'rpc',
  'sycl',
  'vulkan',
];

export interface LlamaReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface LlamaDownloadAsset {
  name: string;
  url: string;
  tagName?: string;
}

interface GitHubRelease {
  tag_name?: string;
  assets?: LlamaReleaseAsset[];
}

function runtimeBinaryName(plat = platform()): string {
  return plat === 'win32' ? 'llama-server.exe' : 'llama-server';
}

function archAliases(cpuArch: string): string[] {
  if (cpuArch === 'x64') return ['x64', 'x86_64', 'amd64'];
  if (cpuArch === 'arm64') return ['arm64', 'aarch64'];
  return [cpuArch.toLowerCase()];
}

function platformAliases(plat: string): string[] {
  if (plat === 'darwin') return ['macos'];
  if (plat === 'linux') return ['ubuntu', 'linux'];
  if (plat === 'win32') return ['win'];
  return [plat.toLowerCase()];
}

function isAcceleratedBuild(assetName: string): boolean {
  const lower = assetName.toLowerCase();
  return ACCELERATED_LLAMA_BUILDS.some((token) => lower.includes(token));
}

function matchesRuntime(assetName: string, plat: string, cpuArch: string): boolean {
  const lower = assetName.toLowerCase();
  const isArchive = lower.endsWith('.zip') || lower.endsWith('.tar.gz');
  if (!isArchive || !lower.includes('bin')) return false;

  const matchesPlatform = platformAliases(plat).some((alias) => lower.includes(alias));
  const matchesArch = archAliases(cpuArch).some((alias) => lower.includes(alias));
  return matchesPlatform && matchesArch;
}

function scoreAsset(assetName: string, plat: string): number {
  const lower = assetName.toLowerCase();
  let score = 0;

  if (!isAcceleratedBuild(lower)) score += 100;
  if (plat === 'linux' && lower.includes('ubuntu')) score += 20;
  if (plat === 'darwin' && lower.includes('macos')) score += 20;
  if (plat === 'win32' && lower.includes('win')) score += 20;
  if (lower.includes('cpu')) score += 10;

  return score;
}

export function selectLlamaServerAsset(
  assets: LlamaReleaseAsset[],
  plat = platform(),
  cpuArch = arch(),
): LlamaReleaseAsset | undefined {
  const ranked = assets
    .filter((asset) => matchesRuntime(asset.name, plat, cpuArch))
    .map((asset) => ({
      asset,
      score: scoreAsset(asset.name, plat),
    }))
    .sort((a, b) => b.score - a.score || a.asset.name.localeCompare(b.asset.name));

  return ranked[0]?.asset;
}

function zipBasename(entryName: string): string {
  return entryName.split(/[\\/]/).pop() ?? entryName;
}

function tempArchivePath(targetPath: string, assetName: string): string {
  return assetName.toLowerCase().endsWith('.tar.gz')
    ? `${targetPath}.tar.gz`
    : `${targetPath}.zip`;
}

async function findFileByBasename(dir: string, names: Set<string>): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFileByBasename(fullPath, names);
      if (found) return found;
    } else if (entry.isFile() && names.has(basename(entry.name))) {
      return fullPath;
    }
  }
  return null;
}

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
    const binaryName = runtimeBinaryName(plat);
    const asset = await this.resolveLlamaServerAsset();

    const targetPath = join(this.binDir, binaryName);
    const tempPath = tempArchivePath(targetPath, asset.name);

    log.info('Downloading llama-server', { asset: asset.name, tag: asset.tagName });
    console.log(`\n📦 Downloading llama-server (${asset.tagName ?? 'latest'})...`);
    console.log(`   ${asset.name}`);

    try {
      const response = await fetch(asset.url);
      if (!response.ok || !response.body) {
        throw new Error(`Download failed: HTTP ${response.status} for ${asset.name}`);
      }

      const fileStream = createWriteStream(tempPath);
      await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream), fileStream);

      await this.extractLlamaServer(tempPath, targetPath, binaryName, asset.name);
      if (plat !== 'win32') await chmod(targetPath, 0o755);
      await unlink(tempPath).catch(() => undefined);
      return targetPath;
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }

  private async extractLlamaServer(
    archivePath: string,
    targetPath: string,
    binaryName: string,
    assetName: string,
  ): Promise<void> {
    const lower = assetName.toLowerCase();
    const binaryNames = new Set([binaryName, 'llama-server', 'llama-server.exe', 'server']);

    if (lower.endsWith('.zip')) {
      const zip = new AdmZip(archivePath);
      const entries = zip.getEntries();
      const serverEntry = entries.find((entry) => binaryNames.has(zipBasename(entry.entryName)));
      if (!serverEntry) throw new Error(`llama-server not found in ${assetName}`);

      zip.extractEntryTo(serverEntry, this.binDir, false, true, false, binaryName);
      return;
    }

    if (lower.endsWith('.tar.gz')) {
      const extractDir = await mkdtemp(join(tmpdir(), 'n0x-llama-'));
      try {
        await execFileAsync('tar', ['-xzf', archivePath, '-C', extractDir]);
        const serverPath = await findFileByBasename(extractDir, binaryNames);
        if (!serverPath) throw new Error(`llama-server not found in ${assetName}`);
        await copyFile(serverPath, targetPath);
      } finally {
        await rm(extractDir, { recursive: true, force: true });
      }
      return;
    }

    throw new Error(`Unsupported llama-server archive format: ${assetName}`);
  }

  private async resolveLlamaServerAsset(): Promise<LlamaDownloadAsset> {
    const response = await fetch(LLAMA_CPP_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'n0x-cli',
      },
    });
    if (!response.ok) {
      throw new Error(`Could not query llama.cpp releases: HTTP ${response.status}`);
    }

    const release = (await response.json()) as GitHubRelease;
    const asset = selectLlamaServerAsset(release.assets ?? []);
    if (!asset) {
      throw new Error(`No llama-server archive found for ${platform()}-${arch()} in latest llama.cpp release`);
    }

    return {
      name: asset.name,
      url: asset.browser_download_url,
      tagName: release.tag_name,
    };
  }

  /**
   * Get path to llama-server binary
   */
  async getLlamaServerPath(): Promise<string | null> {
    const plat = platform();
    const binaryName = runtimeBinaryName(plat);

    const envPath = process.env.N0X_LLAMA_SERVER?.trim();
    if (envPath && existsSync(envPath)) {
      return envPath;
    }

    // Check bundled binary
    const bundledPath = join(this.binDir, binaryName);
    if (existsSync(bundledPath)) {
      return bundledPath;
    }

    // Check system PATH
    const { execFileSync } = await import('child_process');
    try {
      // SAFE: Using array args prevents command injection
      const command = plat === 'win32' ? 'where' : 'which';
      const result = execFileSync(command, [binaryName], { encoding: 'utf8' });
      return result.split(/\r?\n/)[0]?.trim() || null;
    } catch {
      return null;
    }
  }

  getLlamaServerInstallHints(): string[] {
    const plat = platform();
    const common = [
      'Install llama.cpp so llama-server is on PATH.',
      'Or set N0X_LLAMA_SERVER=/absolute/path/to/llama-server.',
    ];

    if (plat === 'darwin') {
      return [
        'Install llama.cpp: brew install llama.cpp',
        ...common,
      ];
    }

    if (plat === 'linux') {
      return [
        ...common,
        'Ubuntu/Linux: build llama.cpp from source, then install build/bin/llama-server to /usr/local/bin.',
      ];
    }

    if (plat === 'win32') {
      return [
        ...common,
        'Windows: install llama.cpp and ensure llama-server.exe is on PATH.',
      ];
    }

    return common;
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
	      stdio: ['ignore', 'ignore', 'pipe'],
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
	      if (!res.ok) return false;
	      return (await this.getServerModels(port)).length > 0;
	    } catch {
	      return false;
	    }
	  }

	  async getServerModels(port: number = this.serverPort): Promise<string[]> {
	    try {
	      const res = await fetch(`http://localhost:${port}/v1/models`, {
	        signal: AbortSignal.timeout(2000),
	      });
	      if (!res.ok) return [];
	      const data = (await res.json()) as { data?: Array<{ id?: unknown }> };
	      return data.data
	        ?.map((model) => model.id)
	        .filter((id): id is string => typeof id === 'string' && id.length > 0) ?? [];
	    } catch {
	      return [];
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
