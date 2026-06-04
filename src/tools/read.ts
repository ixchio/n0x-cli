import { readFile } from 'node:fs/promises';
import { resolveWithinWorkspace } from '../lib/paths.js';
import { readArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';

export const readTool: Tool = {
  name: 'Read',
  description: 'Read a file from the workspace. Use offset/limit for large files.',
  schema: readArgs,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path (relative or absolute)' },
      offset: { type: 'number', description: 'Start line (1-indexed)' },
      limit: { type: 'number', description: 'Max lines to read' },
    },
    required: ['path'],
  },
  async execute(raw, ctx) {
    const args = parseArgs(readArgs, raw);
    const filePath = resolveWithinWorkspace(ctx.cwd, args.path);
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const offset = Math.max(1, args.offset ?? 1);
    const limit = args.limit ?? lines.length;
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const numbered = slice.map((l, i) => `${String(offset + i).padStart(4)}|${l}`).join('\n');
    return { output: numbered || '(empty file)' };
  },
};
