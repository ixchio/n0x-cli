import { webSearchArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';
import { truncate } from '../lib/output.js';
import { getTavilyClient, formatTavilyError } from '../tavily/client.js';
import type { N0xConfig } from '../config/schema.js';
import { log } from '../lib/logger.js';

interface TavilySearchResult {
  title?: string;
  url?: string;
  content?: string;
}

interface TavilySearchResponse {
  answer?: string;
  results?: TavilySearchResult[];
}

export function createWebSearchTool(config: N0xConfig): Tool {
  return {
    name: 'WebSearch',
    description:
      'Search the web via Tavily (https://tavily.com). Use for docs, APIs, errors, and current facts.',
    schema: webSearchArgs,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        search_depth: {
          type: 'string',
          enum: ['basic', 'advanced'],
          description: 'basic = fast, advanced = deeper research',
        },
      },
      required: ['query'],
    },
    async execute(raw) {
      const args = parseArgs(webSearchArgs, raw);
      const client = getTavilyClient(config);
      const depth =
        args.search_depth ?? config.tavily_search_depth ?? 'advanced';

      try {
        log.debug('Tavily search', { query: args.query, depth });
        const response = (await client.search(args.query, {
          searchDepth: depth,
          maxResults: 5,
          includeAnswer: true,
        })) as TavilySearchResponse;

        const parts: string[] = [];
        if (response.answer) {
          parts.push(`Answer: ${response.answer}`);
        }
        for (const [i, r] of (response.results ?? []).entries()) {
          parts.push(
            `[${i + 1}] ${r.title ?? 'Untitled'}\n${r.url ?? ''}\n${r.content ?? ''}`,
          );
        }
        return {
          output: truncate(parts.join('\n\n') || '(no results)', 12_000),
        };
      } catch (e) {
        return {
          output: `Tavily search failed: ${formatTavilyError(e)}`,
          isError: true,
        };
      }
    },
  };
}
