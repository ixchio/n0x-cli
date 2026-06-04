import { rename } from 'node:fs/promises';
import { resolveWithinWorkspace } from '../lib/paths.js';
import { renameArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';

export const renameTool: Tool = {
  name: 'Rename',
  description: 'Rename or move a file within the workspace.',
  schema: renameArgs,
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string' },
      to: { type: 'string' },
    },
    required: ['from', 'to'],
  },
  async execute(raw, ctx) {
    const args = parseArgs(renameArgs, raw);
    const from = resolveWithinWorkspace(ctx.cwd, args.from);
    const to = resolveWithinWorkspace(ctx.cwd, args.to);
    await rename(from, to);
    return { output: `Renamed ${args.from} → ${args.to}` };
  },
};
