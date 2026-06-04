import { realpathSync } from 'node:fs';
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
  return target;
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}
