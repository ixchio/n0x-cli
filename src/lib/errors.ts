export type ErrorCode =
  | 'CONFIG_INVALID'
  | 'PATH_DENIED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_REQUEST_FAILED'
  | 'TOOL_DENIED'
  | 'TOOL_TIMEOUT'
  | 'TOOL_FAILED'
  | 'MCP_CONNECT_FAILED';

export class N0xError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;

  constructor(code: ErrorCode, message: string, hint?: string) {
    super(message);
    this.name = 'N0xError';
    this.code = code;
    this.hint = hint;
  }

  format(): string {
    const lines = [`[${this.code}] ${this.message}`];
    if (this.hint) lines.push(`Hint: ${this.hint}`);
    return lines.join('\n');
  }
}

export function isN0xError(e: unknown): e is N0xError {
  return e instanceof N0xError;
}

export function formatError(e: unknown): string {
  if (isN0xError(e)) return e.format();
  if (e instanceof Error) return e.message;
  return String(e);
}
