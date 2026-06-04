import { N0xError } from '../lib/errors.js';

const DENIED_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/\s*$/,
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\/\s*/,
  /\bmkfs\b/,
  /\bdd\s+if=\/dev\/(zero|random|urandom)/,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/,
  /\bchmod\s+-R\s+777\s+\//,
  /\bcurl\b.*\|\s*(ba)?sh\b/,
  /\bwget\b.*\|\s*(ba)?sh\b/,
  />\s*\/dev\/sd[a-z]/,
  /\bsudo\s+rm\b/,
];

export function assertBashAllowed(command: string): void {
  const normalized = command.trim().toLowerCase();
  for (const pattern of DENIED_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new N0xError(
        'TOOL_DENIED',
        'Command blocked by safety policy',
        'Destructive or high-risk commands are not allowed.',
      );
    }
  }
}
