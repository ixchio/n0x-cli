import { spawn } from 'node:child_process';
import { grepArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';
import { truncate } from '../lib/output.js';
import { N0xError } from '../lib/errors.js';

function rg(pattern: string, cwd: string, glob?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['--line-number', '--color=never', '-C', '2', '--max-count', '100', pattern];
    if (glob) args.push('--glob', glob);
    args.push('.');

    const child = spawn('rg', args, { cwd });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      if (code === 0 || code === 1) resolve(out || '(no matches)');
      else reject(new N0xError('TOOL_FAILED', err || `rg exited ${code}`));
    });
    child.on('error', () =>
      reject(
        new N0xError(
          'TOOL_FAILED',
          'ripgrep (rg) not found',
          'Install: sudo apt install ripgrep',
        ),
      ),
    );
  });
}

export const grepTool: Tool = {
  name: 'Grep',
  description: 'Search code with ripgrep. Fast regex search across the project.',
  schema: grepArgs,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern' },
      glob: { type: 'string', description: 'File glob filter e.g. *.ts' },
    },
    required: ['pattern'],
  },
  async execute(raw, ctx) {
    const args = parseArgs(grepArgs, raw);
    const output = await rg(args.pattern, ctx.cwd, args.glob);
    return { output: truncate(output, 30_000) };
  },
};
