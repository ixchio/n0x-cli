import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';

const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.json', '.toml', '.yaml', '.yml', '.md', '.css', '.html',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.n0x',
]);

export interface GatheredFile {
  path: string;
  content: string;
  score: number;
}

async function walk(dir: string, root: string, files: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full, root, files);
    } else if (CODE_EXT.has(extname(e.name))) {
      const st = await stat(full);
      if (st.size < 100_000) files.push(relative(root, full));
    }
  }
}

function scoreFile(path: string, goal: string): number {
  const lower = goal.toLowerCase();
  const words = lower.split(/\W+/).filter((w) => w.length > 3);
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
  maxChars = 24_000,
): Promise<string> {
  const all: string[] = [];
  await walk(cwd, cwd, all);
  const ranked = all
    .map((path) => ({ path, score: scoreFile(path, goal) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles);

  const gathered: GatheredFile[] = [];
  let total = 0;
  for (const { path, score } of ranked) {
    if (total >= maxChars) break;
    try {
      const content = await readFile(join(cwd, path), 'utf8');
      const slice = content.slice(0, Math.min(4000, maxChars - total));
      gathered.push({ path, content: slice, score });
      total += slice.length;
    } catch {
      /* skip unreadable */
    }
  }

  return gathered
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n');
}
