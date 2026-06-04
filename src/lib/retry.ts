export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const DEFAULT_SHOULD_RETRY = (error: unknown): boolean => {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('fetch failed') ||
      msg.includes('econnrefused') ||
      msg.includes('timeout') ||
      msg.includes('503') ||
      msg.includes('502')
    );
  }
  return false;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 8000;
  const shouldRetry = opts.shouldRetry ?? DEFAULT_SHOULD_RETRY;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt >= maxAttempts || !shouldRetry(e, attempt)) throw e;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
