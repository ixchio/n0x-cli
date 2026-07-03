import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const CHECKPOINT_VERSION = 1;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const EXCLUDED_DIRS = new Set([
  '.git',
  '.n0x',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'target',
  'out',
  'tmp',
  'logs',
  'vendor',
  '.venv',
  '.next',
  '.nuxt',
  '.cache',
]);

export interface CheckpointFile {
  path: string;
  size: number;
  sha256: string;
}

export interface CheckpointSkippedFile {
  path: string;
  reason: string;
  size?: number;
}

export interface CheckpointManifest {
  version: number;
  id: string;
  cwd: string;
  createdAt: string;
  reason: string;
  files: CheckpointFile[];
  skipped: CheckpointSkippedFile[];
  totalBytes: number;
}

export interface RestoreResult {
  id: string;
  restored: number;
  removed: number;
  skipped: number;
}

function checkpointsRoot(cwd: string): string {
  return join(resolve(cwd), '.n0x', 'checkpoints');
}

function checkpointPath(cwd: string, id: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error(`Invalid checkpoint id: ${id}`);
  }
  return join(checkpointsRoot(cwd), id);
}

function checkpointFilesPath(cwd: string, id: string): string {
  return join(checkpointPath(cwd, id), 'files');
}

function manifestPath(cwd: string, id: string): string {
  return join(checkpointPath(cwd, id), 'manifest.json');
}

function makeCheckpointId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${suffix}`;
}

function shouldSkipDir(name: string): boolean {
  return EXCLUDED_DIRS.has(name);
}

async function walkFiles(root: string, dir = root): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && shouldSkipDir(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, fullPath));
    } else if (entry.isFile()) {
      files.push(relative(root, fullPath).split(sep).join('/'));
    }
  }

  return files;
}

async function hashFile(path: string): Promise<string> {
  const content = await readFile(path);
  return createHash('sha256').update(content).digest('hex');
}

async function readManifest(cwd: string, id: string): Promise<CheckpointManifest> {
  return JSON.parse(await readFile(manifestPath(cwd, id), 'utf8')) as CheckpointManifest;
}

export async function createCheckpoint(
  cwd: string,
  reason: string,
): Promise<CheckpointManifest> {
  const root = resolve(cwd);
  const id = makeCheckpointId();
  const filesRoot = checkpointFilesPath(root, id);
  await mkdir(filesRoot, { recursive: true });

  const files: CheckpointFile[] = [];
  const skipped: CheckpointSkippedFile[] = [];
  let totalBytes = 0;

  for (const relPath of await walkFiles(root)) {
    const src = join(root, relPath);
    const info = await stat(src);
    if (info.size > MAX_FILE_BYTES) {
      skipped.push({ path: relPath, reason: 'file too large', size: info.size });
      continue;
    }
    if (totalBytes + info.size > MAX_TOTAL_BYTES) {
      skipped.push({ path: relPath, reason: 'checkpoint size limit reached', size: info.size });
      continue;
    }

    const dest = join(filesRoot, relPath);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    files.push({
      path: relPath,
      size: info.size,
      sha256: await hashFile(src),
    });
    totalBytes += info.size;
  }

  const manifest: CheckpointManifest = {
    version: CHECKPOINT_VERSION,
    id,
    cwd: root,
    createdAt: new Date().toISOString(),
    reason,
    files,
    skipped,
    totalBytes,
  };

  await writeFile(manifestPath(root, id), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

export async function listCheckpoints(cwd: string): Promise<CheckpointManifest[]> {
  const root = checkpointsRoot(cwd);
  if (!existsSync(root)) return [];

  const entries = await readdir(root, { withFileTypes: true });
  const manifests: CheckpointManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      manifests.push(await readManifest(cwd, entry.name));
    } catch {
      // Ignore partial or manually damaged checkpoints.
    }
  }

  return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function resolveCheckpointId(cwd: string, id: string): Promise<string> {
  if (id !== 'latest') return id;
  const latest = (await listCheckpoints(cwd))[0];
  if (!latest) throw new Error('No checkpoints found.');
  return latest.id;
}

export async function restoreCheckpoint(cwd: string, id: string): Promise<RestoreResult> {
  const root = resolve(cwd);
  const resolvedId = await resolveCheckpointId(root, id);
  const manifest = await readManifest(root, resolvedId);
  const snapshotFiles = new Set(manifest.files.map((f) => f.path));
  const skippedFiles = new Set(manifest.skipped.map((f) => f.path));

  let removed = 0;
  for (const relPath of await walkFiles(root)) {
    if (snapshotFiles.has(relPath) || skippedFiles.has(relPath)) continue;
    await rm(join(root, relPath), { force: true });
    removed++;
  }

  let restored = 0;
  const filesRoot = checkpointFilesPath(root, resolvedId);
  for (const file of manifest.files) {
    const src = join(filesRoot, file.path);
    const dest = join(root, file.path);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    restored++;
  }

  return {
    id: resolvedId,
    restored,
    removed,
    skipped: manifest.skipped.length,
  };
}
