import { relative } from 'node:path';
import { searchDirArgs } from './schemas.js';
import { resolveWithinWorkspace } from '../lib/paths.js';
import { truncate } from '../lib/output.js';
import { N0xError } from '../lib/errors.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';
import { runRipgrep } from './ripgrep.js';

export const searchDirTool: Tool = {
  name: 'SearchDir',
  description: 'Search for a regex pattern in a directory tree (ripgrep).',
  schema: searchDirArgs,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string' },
      path: { type: 'string', description: 'Directory relative to workspace (default: .)' },
    },
    required: ['pattern'],
  },
  async execute(raw, ctx) {
    const args = parseArgs(searchDirArgs, raw);
    const relPath = args.path ?? '.';
    const root = resolveWithinWorkspace(ctx.cwd, '.');
    const absDir = resolveWithinWorkspace(ctx.cwd, relPath);
    const relDir = relative(root, absDir) || '.';

    try {
      const result = await runRipgrep(
        ['--line-number', '--color=never', '-C', '1', '--max-count', '80', args.pattern, relDir],
        root,
        ctx.config.bash_timeout_ms,
      );

      if (result.code === 0 || result.code === 1) {
        return { output: truncate(result.stdout || '(no matches)', 30_000) };
      }

      return { output: result.stderr || `rg exited ${result.code}`, isError: true };
    } catch (error) {
      if (error instanceof N0xError) {
        return { output: error.format(), isError: true };
      }
      return {
        output: error instanceof Error ? error.message : String(error),
        isError: true,
      };
    }
  },
};
