/**
 * Security utilities for n0x CLI
 * Protects against common vulnerabilities
 */

import { lstat } from 'fs/promises';
import { N0xError } from './errors.js';

/**
 * Safely parse JSON with error handling and prototype pollution protection
 */
export function safeJsonParse<T = unknown>(
  json: string,
  context: string = 'data',
): T | null {
  try {
    const parsed = JSON.parse(json);

    // Protect against prototype pollution
    if (parsed && typeof parsed === 'object') {
      // Remove dangerous properties
      delete parsed.__proto__;
      delete parsed.constructor;
      delete parsed.prototype;
    }

    return parsed as T;
  } catch (error) {
    throw new N0xError(
      'PARSE_ERROR',
      `Failed to parse ${context}`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Validate that parsed JSON matches expected structure
 */
export function validateObject(
  obj: unknown,
  requiredKeys: string[] = [],
): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }

  const record = obj as Record<string, unknown>;
  for (const key of requiredKeys) {
    if (!(key in record)) {
      return false;
    }
  }

  return true;
}

/**
 * Detect if a path is a symlink (security risk)
 */
export async function isSymlink(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Sanitize shell arguments to prevent injection
 * Use this when you MUST use string concatenation (prefer array args)
 */
export function sanitizeShellArg(arg: string): string {
  // Only allow safe characters
  if (!/^[a-zA-Z0-9._\-/]+$/.test(arg)) {
    throw new N0xError(
      'INVALID_INPUT',
      'Shell argument contains unsafe characters',
      `Allowed: alphanumeric, dots, dashes, underscores, slashes. Got: ${arg.slice(0, 50)}`,
    );
  }
  return arg;
}

/**
 * Whitelist environment variables for child processes
 */
export function sanitizeEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const ALLOWED_ENV_VARS = [
    'HOME',
    'USER',
    'LANG',
    'LC_ALL',
    'PATH',
    'TERM',
    'SHELL',
    'TMPDIR',
    'NODE_ENV',
    'NO_COLOR',
  ];

  const ALLOWED_PREFIXES = [
    'npm_',
    'N0X_',
  ];

  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;

    const isAllowed =
      ALLOWED_ENV_VARS.includes(key) ||
      ALLOWED_PREFIXES.some(prefix => key.startsWith(prefix));

    if (isAllowed) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Rate limiter to prevent abuse
 */
export class RateLimiter {
  private calls: number[] = [];
  private readonly windowMs: number;
  private readonly maxCalls: number;

  constructor(maxCallsPerWindow: number, windowMs: number = 60000) {
    this.maxCalls = maxCallsPerWindow;
    this.windowMs = windowMs;
  }

  async checkLimit(operation: string = 'operation'): Promise<void> {
    const now = Date.now();

    // Remove calls outside the window
    this.calls = this.calls.filter(timestamp => now - timestamp < this.windowMs);

    if (this.calls.length >= this.maxCalls) {
      throw new N0xError(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded for ${operation}`,
        `Maximum ${this.maxCalls} calls per ${this.windowMs / 1000}s. Try again later.`,
      );
    }

    this.calls.push(now);
  }

  reset(): void {
    this.calls = [];
  }

  getRemainingCalls(): number {
    const now = Date.now();
    this.calls = this.calls.filter(timestamp => now - timestamp < this.windowMs);
    return Math.max(0, this.maxCalls - this.calls.length);
  }
}

/**
 * Sanitize commit messages for safe execution
 */
export function sanitizeCommitMessage(msg: string): string {
  // Remove dangerous characters and sequences
  return msg
    .replace(/[`$\\]/g, '') // Remove shell special chars
    .replace(/\n/g, ' ')    // Single line
    .trim()
    .slice(0, 500);         // Reasonable length
}

/**
 * Check if a string looks like it contains secrets
 */
export function containsPotentialSecret(str: string): boolean {
  const SECRET_PATTERNS = [
    /api[_-]?key/i,
    /password/i,
    /secret/i,
    /token/i,
    /credential/i,
    /auth/i,
  ];

  return SECRET_PATTERNS.some(pattern => pattern.test(str));
}

/**
 * Redact potential secrets from strings
 */
export function redactSecrets(str: string): string {
  // Redact values that look like API keys, tokens, etc.
  return str
    .replace(/([a-zA-Z_]+_?(key|token|secret|password|auth))\s*[=:]\s*['"]?([^'"\s]+)['"]?/gi,
      '$1=***REDACTED***')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer ***REDACTED***');
}
