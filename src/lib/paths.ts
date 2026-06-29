import { realpathSync, lstatSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
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
    throw new N0xError(
      'PATH_DENIED',
      `Path escapes workspace: ${userPath}`,
      'Use paths relative to the project directory.',
    );
  }

  // SECURITY: Detect symlinks (potential security risk)
  try {
    const stats = lstatSync(target);
    if (stats.isSymbolicLink()) {
      throw new N0xError(
        'PATH_DENIED',
        `Symlinks are not allowed: ${userPath}`,
        'For security reasons, n0x does not follow symbolic links.',
      );
    }
  } catch (err) {
    // File doesn't exist yet (e.g., Write operation) - that's okay
    if (err instanceof N0xError) throw err;
    // ENOENT is okay for new files
  }

  return target;
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}
