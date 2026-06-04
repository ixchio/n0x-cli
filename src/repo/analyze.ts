import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export interface RepoMap {
  framework?: string;
  packageManager?: string;
  entryPoints: string[];
  apiRoutes: string[];
  components: string[];
  dependencies: string[];
}

export async function analyzeRepository(cwd: string): Promise<RepoMap> {
  const map: RepoMap = {
    entryPoints: [],
    apiRoutes: [],
    components: [],
    dependencies: [],
  };

  if (existsSync(join(cwd, 'package.json'))) {
    const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    map.dependencies = Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }).slice(0, 30);
    if (pkg.dependencies?.next || pkg.devDependencies?.next) {
      map.framework = 'Next.js';
      map.packageManager = existsSync(join(cwd, 'pnpm-lock.yaml'))
        ? 'pnpm'
        : existsSync(join(cwd, 'yarn.lock'))
          ? 'yarn'
          : 'npm';
    } else if (pkg.dependencies?.react) {
      map.framework = 'React';
    } else if (pkg.dependencies?.express) {
      map.framework = 'Express';
    }
    if (pkg.scripts?.dev) map.entryPoints.push('npm run dev');
    if (pkg.scripts?.build) map.entryPoints.push('npm run build');
  }

  if (existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'requirements.txt'))) {
    map.framework = 'Python';
  }

  await scanForPatterns(cwd, cwd, map, 0);
  return map;
}

async function scanForPatterns(
  dir: string,
  root: string,
  map: RepoMap,
  depth: number,
): Promise<void> {
  if (depth > 4) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (['node_modules', '.git', 'dist', 'build'].includes(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'api' || e.name === 'routes') map.apiRoutes.push(full.replace(root + '/', ''));
      await scanForPatterns(full, root, map, depth + 1);
    } else {
      const rel = full.replace(root + '/', '');
      if (/route\.(ts|js)$/.test(e.name) || /api\/.*\.(ts|js)$/.test(rel)) {
        map.apiRoutes.push(rel);
      }
      if (/\.(tsx|jsx)$/.test(e.name) && /component/i.test(rel)) {
        map.components.push(rel);
      }
      if (e.name === 'main.ts' || e.name === 'index.ts' || e.name === 'app.tsx') {
        map.entryPoints.push(rel);
      }
    }
  }
}

export function formatRepoMap(map: RepoMap): string {
  const lines = ['## Repository Map'];
  if (map.framework) lines.push(`Framework: ${map.framework}`);
  if (map.packageManager) lines.push(`Package manager: ${map.packageManager}`);
  if (map.entryPoints.length) lines.push(`Entry points: ${map.entryPoints.join(', ')}`);
  if (map.apiRoutes.length) lines.push(`API routes: ${map.apiRoutes.slice(0, 15).join(', ')}`);
  if (map.components.length) lines.push(`Components: ${map.components.slice(0, 10).join(', ')}`);
  if (map.dependencies.length) {
    lines.push(`Key deps: ${map.dependencies.slice(0, 15).join(', ')}`);
  }
  return lines.join('\n');
}
