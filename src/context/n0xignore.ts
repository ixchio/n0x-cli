import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.n0x',
  '*.min.js',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
];

export async function loadN0xIgnore(cwd: string): Promise<string[]> {
  const patterns = [...DEFAULT_IGNORE];
  const path = join(cwd, '.n0xignore');
  if (!existsSync(path)) return patterns;

  const raw = await readFile(path, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#')) patterns.push(t);
  }
  return patterns;
}

export function isIgnored(relativePath: string, patterns: string[]): boolean {
  const norm = relativePath.replace(/\\/g, '/');
  for (const p of patterns) {
    if (p.includes('*')) {
      const re = new RegExp(
        '^' + p.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$',
      );
      if (re.test(norm) || norm.includes(p.replace(/\*/g, ''))) return true;
    } else if (norm === p || norm.startsWith(p + '/') || norm.includes('/' + p + '/')) {
      return true;
    }
  }
  return false;
}
