import { webExtractArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';
import { truncate } from '../lib/output.js';
import { getTavilyClient, formatTavilyError } from '../tavily/client.js';
import type { N0xConfig } from '../config/schema.js';
import { log } from '../lib/logger.js';

interface TavilyExtractResult {
  url?: string;
  rawContent?: string;
}

interface TavilyExtractResponse {
  results?: TavilyExtractResult[];
  failedResults?: Array<{ url?: string; error?: string }>;
}

export function createWebExtractTool(config: N0xConfig): Tool {
  return {
    name: 'WebExtract',
    description:
      'Extract raw content from URLs via Tavily. Use after WebSearch to read full pages.',
    schema: webExtractArgs,
    parameters: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'URLs to extract (max 5)',
        },
        extract_depth: {
          type: 'string',
          enum: ['basic', 'advanced'],
          description: 'basic = fast, advanced = full page content',
        },
      },
      required: ['urls'],
    },
    async execute(raw) {
      const args = parseArgs(webExtractArgs, raw);
      const client = getTavilyClient(config);
      const depth =
        args.extract_depth ?? config.tavily_extract_depth ?? 'advanced';

      try {
        log.debug('Tavily extract', { urls: args.urls.length, depth });
        const response = (await client.extract(args.urls, {
          extractDepth: depth,
        })) as TavilyExtractResponse;

        const parts: string[] = [];
        for (const r of response.results ?? []) {
          parts.push(
            `URL: ${r.url ?? 'unknown'}\n${truncate(r.rawContent ?? '', 4000)}`,
          );
        }
        for (const f of response.failedResults ?? []) {
          parts.push(`FAILED: ${f.url ?? 'unknown'} — ${f.error ?? 'unknown error'}`);
        }
        return {
          output: truncate(parts.join('\n\n---\n\n') || '(no content)', 16_000),
          isError: !(response.results?.length),
        };
      } catch (e) {
        return {
          output: `Tavily extract failed: ${formatTavilyError(e)}`,
          isError: true,
        };
      }
    },
  };
}
