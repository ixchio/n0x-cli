import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveWithinWorkspace } from '../lib/paths.js';
import { writeArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';

export const writeTool: Tool = {
  name: 'Write',
  description: 'Write content to a file (creates or overwrites).',
  schema: writeArgs,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['path', 'content'],
  },
  async execute(raw, ctx) {
    const args = parseArgs(writeArgs, raw);
    const filePath = resolveWithinWorkspace(ctx.cwd, args.path);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, args.content, 'utf8');
    return { output: `Wrote ${args.path} (${args.content.length} bytes)` };
  },
};
