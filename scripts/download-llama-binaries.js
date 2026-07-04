#!/usr/bin/env node

/**
 * Download pre-compiled llama.cpp binaries for bundling
 * Supports: macOS (x64, arm64), Linux (x64, arm64), Windows (x64)
 */

import { chmod, copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { basename, join } from 'path';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';

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

const TARGETS = [
  {
    platform: 'darwin',
    arch: 'x64',
    filename: 'llama-server-darwin-x64',
  },
  {
    platform: 'darwin',
    arch: 'arm64',
    filename: 'llama-server-darwin-arm64',
  },
  {
    platform: 'linux',
    arch: 'x64',
    filename: 'llama-server-linux-x64',
  },
  {
    platform: 'linux',
    arch: 'arm64',
    filename: 'llama-server-linux-arm64',
  },
  {
    platform: 'win32',
    arch: 'x64',
    filename: 'llama-server-win32-x64.exe',
  },
];

function archAliases(arch) {
  if (arch === 'x64') return ['x64', 'x86_64', 'amd64'];
  if (arch === 'arm64') return ['arm64', 'aarch64'];
  return [arch.toLowerCase()];
}

function platformAliases(platform) {
  if (platform === 'darwin') return ['macos'];
  if (platform === 'linux') return ['ubuntu', 'linux'];
  if (platform === 'win32') return ['win'];
  return [platform.toLowerCase()];
}

function isAcceleratedBuild(assetName) {
  const lower = assetName.toLowerCase();
  return ACCELERATED_LLAMA_BUILDS.some(token => lower.includes(token));
}

function matchesTarget(assetName, target) {
  const lower = assetName.toLowerCase();
  const isArchive = lower.endsWith('.zip') || lower.endsWith('.tar.gz');
  if (!isArchive || !lower.includes('bin')) return false;

  return platformAliases(target.platform).some(alias => lower.includes(alias)) &&
    archAliases(target.arch).some(alias => lower.includes(alias));
}

function scoreAsset(assetName, target) {
  const lower = assetName.toLowerCase();
  let score = 0;

  if (!isAcceleratedBuild(lower)) score += 100;
  if (target.platform === 'linux' && lower.includes('ubuntu')) score += 20;
  if (target.platform === 'darwin' && lower.includes('macos')) score += 20;
  if (target.platform === 'win32' && lower.includes('win')) score += 20;
  if (lower.includes('cpu')) score += 10;

  return score;
}

function selectAsset(assets, target) {
  return assets
    .filter(asset => matchesTarget(asset.name, target))
    .map(asset => ({ asset, score: scoreAsset(asset.name, target) }))
    .sort((a, b) => b.score - a.score || a.asset.name.localeCompare(b.asset.name))[0]?.asset;
}

function tempArchivePath(targetPath, assetName) {
  return assetName.toLowerCase().endsWith('.tar.gz')
    ? `${targetPath}.tar.gz`
    : `${targetPath}.zip`;
}

async function findFileByBasename(dir, names) {
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

async function extractServerBinary(tempPath, targetPath, binary) {
  const lower = binary.sourceName.toLowerCase();
  const binaryNames = new Set([
    binary.platform === 'win32' ? 'llama-server.exe' : 'llama-server',
    'llama-server',
    'llama-server.exe',
    'server',
  ]);

  if (lower.endsWith('.zip')) {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(tempPath);
    const entries = zip.getEntries();

    const serverEntry = entries.find(e => {
      const name = e.entryName.split(/[\\/]/).pop();
      return binaryNames.has(name);
    });

    if (!serverEntry) {
      throw new Error('llama-server not found in archive');
    }

    zip.extractEntryTo(serverEntry, join(process.cwd(), 'bin'), false, true, false, binary.filename);
    return;
  }

  if (lower.endsWith('.tar.gz')) {
    const extractDir = await mkdtemp(join(tmpdir(), 'n0x-llama-'));
    try {
      await execFileAsync('tar', ['-xzf', tempPath, '-C', extractDir]);
      const serverPath = await findFileByBasename(extractDir, binaryNames);
      if (!serverPath) throw new Error('llama-server not found in archive');
      await copyFile(serverPath, targetPath);
    } finally {
      await rm(extractDir, { recursive: true, force: true });
    }
    return;
  }

  throw new Error(`Unsupported llama-server archive format: ${binary.sourceName}`);
}

async function fetchLatestRelease() {
  const response = await fetch(LLAMA_CPP_RELEASE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'n0x-cli-release-packager',
    },
  });
  if (!response.ok) {
    throw new Error(`Could not query llama.cpp releases: HTTP ${response.status}`);
  }
  return response.json();
}

async function downloadBinary(binary) {
  const binDir = join(process.cwd(), 'bin');
  await mkdir(binDir, { recursive: true });

  const targetPath = join(binDir, binary.filename);

  if (existsSync(targetPath)) {
    console.log(`✓ ${binary.filename} already exists, skipping`);
    return;
  }

  console.log(`📦 Downloading ${binary.filename}...`);
  console.log(`   ${binary.sourceName}`);
  console.log(`   ${binary.url}`);

  const response = await fetch(binary.url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  // Download to temp file
  const tempPath = tempArchivePath(targetPath, binary.sourceName);
  const fileStream = createWriteStream(tempPath);

  await pipeline(Readable.fromWeb(response.body), fileStream);

  // Calculate checksum
  const hash = createHash('sha256');
  const { createReadStream } = await import('fs');
  await pipeline(createReadStream(tempPath), hash);
  const checksum = hash.digest('hex');

  console.log(`   Checksum: ${checksum}`);

  await extractServerBinary(tempPath, targetPath, binary);

  // Make executable
  if (binary.platform !== 'win32') {
    await chmod(targetPath, 0o755);
  }

  // Clean up temp
  await import('fs/promises').then(({ unlink }) => unlink(tempPath));

  console.log(`✓ ${binary.filename} downloaded and extracted\n`);

  return checksum;
}

async function createChecksumFile() {
  const checksums = {};

  for (const binary of TARGETS) {
    const binPath = join(process.cwd(), 'bin', binary.filename);
    if (existsSync(binPath)) {
      const hash = createHash('sha256');
      const { createReadStream } = await import('fs');
      await pipeline(createReadStream(binPath), hash);
      checksums[binary.filename] = hash.digest('hex');
    }
  }

  await writeFile(
    join(process.cwd(), 'bin', 'checksums.json'),
    JSON.stringify(checksums, null, 2),
    'utf8'
  );

  console.log('✓ checksums.json created\n');
}

async function main() {
  console.log('🌿 n0x - Downloading llama.cpp binaries\n');

  // Check if adm-zip is available
  try {
    await import('adm-zip');
  } catch {
    console.log('Installing adm-zip...');
    const { execSync } = await import('child_process');
    execSync('npm install adm-zip --no-save', { stdio: 'inherit' });
  }

  const release = await fetchLatestRelease();
  console.log(`llama.cpp release: ${release.tag_name ?? 'latest'}\n`);

  for (const target of TARGETS) {
    const asset = selectAsset(release.assets ?? [], target);
    if (!asset) {
      console.error(`✗ No llama.cpp archive found for ${target.platform}-${target.arch}`);
      continue;
    }

    const binary = {
      ...target,
      sourceName: asset.name,
      url: asset.browser_download_url,
    };

    try {
      await downloadBinary(binary);
    } catch (error) {
      console.error(`✗ Failed to download ${binary.filename}:`, error.message);
    }
  }

  await createChecksumFile();

  console.log('✨ All binaries downloaded!\n');
  console.log('Binary sizes:');
  const { statSync } = await import('fs');
  for (const binary of TARGETS) {
    const binPath = join(process.cwd(), 'bin', binary.filename);
    if (existsSync(binPath)) {
      const size = statSync(binPath).size / (1024 * 1024);
      console.log(`  ${binary.filename}: ${size.toFixed(1)} MB`);
    }
  }
}

main().catch(console.error);
