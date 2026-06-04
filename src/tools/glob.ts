import { glob } from 'glob';
import { globArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';

export const globTool: Tool = {
  name: 'Glob',
  description: 'Find files matching a glob pattern.',
  schema: globArgs,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob e.g. **/*.tsx' },
    },
    required: ['pattern'],
  },
  async execute(raw, ctx) {
    const args = parseArgs(globArgs, raw);
    const files = await glob(args.pattern, {
      cwd: ctx.cwd,
      nodir: true,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      maxDepth: 12,
    });
    const list = files.slice(0, 200);
    return {
      output: list.length ? list.join('\n') : '(no files)',
    };
  },
};
