import { tavily, TavilyKeylessLimitError } from '@tavily/core';
import type { N0xConfig } from '../config/schema.js';
import { log } from '../lib/logger.js';

export type TavilyClient = ReturnType<typeof tavily>;

let cached: TavilyClient | null = null;
let cachedKey: string | undefined;

export function getTavilyClient(config: N0xConfig): TavilyClient {
  const apiKey =
    config.tavily_api_key?.trim() ||
    process.env.TAVILY_API_KEY?.trim() ||
    undefined;

  if (cached && cachedKey === apiKey) return cached;

  cached = apiKey ? tavily({ apiKey }) : tavily();
  cachedKey = apiKey;
  log.debug('Tavily client ready', { mode: apiKey ? 'api_key' : 'keyless' });
  return cached;
}

export function formatTavilyError(e: unknown): string {
  if (e instanceof TavilyKeylessLimitError) {
    return [
      'Tavily keyless rate limit reached.',
      `Cap: ${e.capType}`,
      e.retryAfter ? `Retry after: ${e.retryAfter}s` : '',
      'Get a free API key at https://tavily.com and set TAVILY_API_KEY.',
    ]
      .filter(Boolean)
      .join(' ');
  }
  return e instanceof Error ? e.message : String(e);
}

export { TavilyKeylessLimitError };
