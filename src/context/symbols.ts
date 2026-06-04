import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { loadN0xIgnore, isIgnored } from './n0xignore.js';
import { PROJECT_N0X_DIR } from '../constants.js';

export type SymbolKind = 'function' | 'class' | 'method' | 'const' | 'interface' | 'type';

export interface SymbolEntry {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
}

export interface ProjectContext {
  scannedAt: string;
  root: string;
  fileCount: number;
  symbols: SymbolEntry[];
}

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs']);

const PATTERNS: Array<{ kind: SymbolKind; re: RegExp }> = [
  { kind: 'function', re: /export\s+(?:async\s+)?function\s+(\w+)/g },
  { kind: 'class', re: /export\s+class\s+(\w+)/g },
  { kind: 'interface', re: /export\s+interface\s+(\w+)/g },
  { kind: 'type', re: /export\s+type\s+(\w+)/g },
  { kind: 'const', re: /export\s+const\s+(\w+)/g },
  { kind: 'function', re: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm },
  { kind: 'class', re: /^\s*class\s+(\w+)/gm },
  { kind: 'method', re: /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::|{)/gm },
  { kind: 'function', re: /^\s*def\s+(\w+)\s*\(/gm },
  { kind: 'class', re: /^\s*class\s+(\w+)/gm },
];

function extractFromContent(relPath: string, content: string): SymbolEntry[] {
  const lines = content.split('\n');
  const out: SymbolEntry[] = [];
  const seen = new Set<string>();

  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const name = m[1];
      if (!name || name.length < 2 || seen.has(`${relPath}:${name}`)) continue;
      if (['if', 'for', 'while', 'switch', 'catch'].includes(name)) continue;
      seen.add(`${relPath}:${name}`);
      const before = content.slice(0, m.index);
      const line = before.split('\n').length;
      out.push({ name, kind, file: relPath, line });
    }
  }

  // Fallback: export line markers
  lines.forEach((line, i) => {
    if (/^export\s+/.test(line) && out.length < 500) {
      const name = line.match(/export\s+(?:default\s+)?(?:function|class|const)\s+(\w+)/)?.[1];
      if (name && !seen.has(`${relPath}:${name}`)) {
        seen.add(`${relPath}:${name}`);
        out.push({ name, kind: 'const', file: relPath, line: i + 1 });
      }
    }
  });

  return out.slice(0, 800);
}

async function walkFiles(dir: string, root: string, ignore: string[], files: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = relative(root, join(dir, e.name));
    if (isIgnored(rel, ignore)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walkFiles(full, root, ignore, files);
    } else if (CODE_EXT.has(extname(e.name))) {
      files.push(rel);
    }
  }
}

export async function buildSymbolIndex(cwd: string): Promise<ProjectContext> {
  const ignore = await loadN0xIgnore(cwd);
  const files: string[] = [];
  await walkFiles(cwd, cwd, ignore, files);

  const symbols: SymbolEntry[] = [];
  for (const rel of files.slice(0, 400)) {
    try {
      const content = await readFile(join(cwd, rel), 'utf8');
      symbols.push(...extractFromContent(rel, content));
    } catch {
      /* skip */
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    root: cwd,
    fileCount: files.length,
    symbols: symbols.slice(0, 2000),
  };
}

export function projectContextPath(cwd: string): string {
  return join(cwd, PROJECT_N0X_DIR, 'context.json');
}

export async function saveProjectContext(cwd: string, ctx: ProjectContext): Promise<string> {
  const dir = join(cwd, PROJECT_N0X_DIR);
  await mkdir(dir, { recursive: true });
  const path = projectContextPath(cwd);
  await writeFile(path, JSON.stringify(ctx, null, 2), 'utf8');
  return path;
}

export async function loadProjectContext(cwd: string): Promise<ProjectContext | null> {
  const path = projectContextPath(cwd);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as ProjectContext;
}

export function formatSymbolIndex(ctx: ProjectContext, maxEntries = 120): string {
  const byFile = new Map<string, SymbolEntry[]>();
  for (const s of ctx.symbols.slice(0, maxEntries)) {
    const list = byFile.get(s.file) ?? [];
    list.push(s);
    byFile.set(s.file, list);
  }
  const lines = [`Symbol index (${ctx.symbols.length} symbols, ${ctx.fileCount} files)`];
  for (const [file, syms] of [...byFile.entries()].slice(0, 40)) {
    const names = syms.map((s) => `${s.kind}:${s.name}:L${s.line}`).join(', ');
    lines.push(`  ${file}: ${names}`);
  }
  return lines.join('\n');
}

export function findSymbolsForGoal(ctx: ProjectContext, goal: string): string[] {
  const words = goal.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const scored = ctx.symbols.map((s) => {
    let score = 0;
    const n = s.name.toLowerCase();
    const f = s.file.toLowerCase();
    for (const w of words) {
      if (n.includes(w)) score += 4;
      if (f.includes(w)) score += 2;
    }
    return { file: s.file, score };
  });
  return [...new Set(scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.file))].slice(0, 12);
}
