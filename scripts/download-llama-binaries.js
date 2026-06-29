#!/usr/bin/env node

/**
 * Download pre-compiled llama.cpp binaries for bundling
 * Supports: macOS (x64, arm64), Linux (x64, arm64), Windows (x64)
 */

import { mkdir, writeFile, chmod } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import { createHash } from 'crypto';

const LLAMA_CPP_VERSION = 'b4086'; // Latest stable with Q1_0/Q2_0 support

const BINARIES = [
  {
    platform: 'darwin',
    arch: 'x64',
    url: `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-macos-x64.zip`,
    filename: 'llama-server-darwin-x64',
    checksum: '', // Will be filled after download
  },
  {
    platform: 'darwin',
    arch: 'arm64',
    url: `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-macos-arm64.zip`,
    filename: 'llama-server-darwin-arm64',
    checksum: '',
  },
  {
    platform: 'linux',
    arch: 'x64',
    url: `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-ubuntu-x64.zip`,
    filename: 'llama-server-linux-x64',
    checksum: '',
  },
  {
    platform: 'linux',
    arch: 'arm64',
    url: `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-ubuntu-arm64.zip`,
    filename: 'llama-server-linux-arm64',
    checksum: '',
  },
  {
    platform: 'win32',
    arch: 'x64',
    url: `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_CPP_VERSION}/llama-${LLAMA_CPP_VERSION}-bin-win-cuda-cu12.2.0-x64.zip`,
    filename: 'llama-server-win32-x64.exe',
    checksum: '',
  },
];

async function downloadBinary(binary) {
  const binDir = join(process.cwd(), 'bin');
  await mkdir(binDir, { recursive: true });

  const targetPath = join(binDir, binary.filename);

  if (existsSync(targetPath)) {
    console.log(`✓ ${binary.filename} already exists, skipping`);
    return;
  }

  console.log(`📦 Downloading ${binary.filename}...`);
  console.log(`   ${binary.url}`);

  const response = await fetch(binary.url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  // Download to temp file
  const tempPath = targetPath + '.tmp';
  const fileStream = createWriteStream(tempPath);

  await pipeline(response.body, fileStream);

  // Calculate checksum
  const hash = createHash('sha256');
  const { createReadStream } = await import('fs');
  await pipeline(createReadStream(tempPath), hash);
  const checksum = hash.digest('hex');

  console.log(`   Checksum: ${checksum}`);

  // Extract llama-server from zip
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(tempPath);
  const entries = zip.getEntries();

  const serverEntry = entries.find(e =>
    e.entryName.includes('llama-server') ||
    e.entryName.includes('server')
  );

  if (!serverEntry) {
    throw new Error('llama-server not found in archive');
  }

  zip.extractEntryTo(serverEntry, binDir, false, true, false, binary.filename);

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

  for (const binary of BINARIES) {
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

  for (const binary of BINARIES) {
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
  for (const binary of BINARIES) {
    const binPath = join(process.cwd(), 'bin', binary.filename);
    if (existsSync(binPath)) {
      const size = statSync(binPath).size / (1024 * 1024);
      console.log(`  ${binary.filename}: ${size.toFixed(1)} MB`);
    }
  }
}

main().catch(console.error);
