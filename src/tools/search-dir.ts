import { spawn } from 'node:child_process';
import { relative } from 'node:path';
import { searchDirArgs } from './schemas.js';
import { resolveWithinWorkspace } from '../lib/paths.js';
import { truncate } from '../lib/output.js';
import { N0xError } from '../lib/errors.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';

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
    const absDir = resolveWithinWorkspace(ctx.cwd, relPath);
    const relDir = relative(ctx.cwd, absDir) || '.';

    return new Promise((resolve) => {
      const child = spawn(
        'rg',
        ['--line-number', '--color=never', '-C', '1', '--max-count', '80', args.pattern, relDir],
        { cwd: ctx.cwd },
      );
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('close', (code) => {
        if (code === 0 || code === 1) {
          resolve({ output: truncate(out || '(no matches)', 30_000) });
        } else {
          resolve({ output: err || `rg exited ${code}`, isError: true });
        }
      });
      child.on('error', () =>
        resolve({
          output: new N0xError('TOOL_FAILED', 'ripgrep not found').format(),
          isError: true,
        }),
      );
    });
  },
};
