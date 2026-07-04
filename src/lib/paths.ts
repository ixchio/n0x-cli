import { realpathSync, lstatSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { N0xError } from './errors.js';

export function resolveWithinWorkspace(
  workspaceRoot: string,
  userPath: string,
): string {
  const root = safeRealpath(workspaceRoot);
  const target = isAbsolute(userPath)
    ? resolve(userPath)
    : resolve(root, userPath);

  const rel = relative(root, target);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throwPathDenied(userPath, 'Path escapes workspace');
  }

  validateExistingSegments(root, target, userPath);

  return target;
}

function validateExistingSegments(root: string, target: string, userPath: string): void {
  const rel = relative(root, target);
  if (!rel) return;

  const parts = rel.split(sep).filter(Boolean);
  let current = root;

  for (const part of parts) {
    current = resolve(current, part);

    let stats;
    try {
      stats = lstatSync(current);
    } catch (err) {
      if (isMissingPathError(err)) {
        return;
      }
      throw err;
    }

    if (stats.isSymbolicLink()) {
      throwPathDenied(userPath, 'Symlinks are not allowed');
    }
  }

  try {
    const realTarget = realpathSync(target);
    const realRel = relative(root, realTarget);
    if (realRel.startsWith('..') || isAbsolute(realRel)) {
      throwPathDenied(userPath, 'Path escapes workspace');
    }
  } catch (err) {
    if (err instanceof N0xError) throw err;
    if (isMissingPathError(err)) return;
    throw err;
  }
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function isMissingPathError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT',
  );
}

function throwPathDenied(userPath: string, reason: string): never {
  throw new N0xError(
    'PATH_DENIED',
    `${reason}: ${userPath}`,
    'Use paths relative to the project directory. Symlinks are not followed.',
  );
}
