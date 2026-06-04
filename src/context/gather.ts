import { readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { loadN0xIgnore, isIgnored } from './n0xignore.js';
import { fileBudget } from './chunk.js';
import { loadChunksForFiles } from './chunk.js';

const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.json', '.toml', '.yaml', '.yml', '.md', '.css', '.html',
]);

async function walk(dir: string, root: string, ignore: string[], files: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = relative(root, join(dir, e.name));
    if (isIgnored(rel, ignore)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, root, ignore, files);
    } else if (CODE_EXT.has(extname(e.name))) {
      const st = await stat(full);
      if (st.size < 100_000) files.push(rel);
    }
  }
}

function scoreFile(path: string, goal: string): number {
  const words = goal.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  let score = 0;
  const p = path.toLowerCase();
  for (const w of words) {
    if (p.includes(w)) score += 3;
  }
  if (p.includes('index') || p.includes('main') || p.includes('app')) score += 1;
  if (p.includes('package.json') || p.includes('readme')) score += 2;
  return score;
}

export async function gatherRelevantFiles(
  cwd: string,
  goal: string,
  maxFiles = 8,
  maxChars?: number,
): Promise<string> {
  const ignore = await loadN0xIgnore(cwd);
  const all: string[] = [];
  await walk(cwd, cwd, ignore, all);
  const ranked = all
    .map((path) => ({ path, score: scoreFile(path, goal) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)
    .map((x) => x.path);

  const budget = maxChars ?? fileBudget('bonsai-4b');
  return loadChunksForFiles(cwd, ranked, budget);
}
