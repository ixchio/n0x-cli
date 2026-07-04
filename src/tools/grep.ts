import { grepArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';
import { truncate } from '../lib/output.js';
import { N0xError } from '../lib/errors.js';
import { runRipgrep } from './ripgrep.js';

async function rg(
  pattern: string,
  cwd: string,
  timeoutMs: number,
  glob?: string,
): Promise<string> {
  const args = ['--line-number', '--color=never', '-C', '2', '--max-count', '100', pattern];
  if (glob) args.push('--glob', glob);
  args.push('.');

  const result = await runRipgrep(args, cwd, timeoutMs);
  if (result.code === 0 || result.code === 1) return result.stdout || '(no matches)';
  throw new N0xError('TOOL_FAILED', result.stderr || `rg exited ${result.code}`);
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
    const output = await rg(args.pattern, ctx.cwd, ctx.config.bash_timeout_ms, args.glob);
    return { output: truncate(output, 30_000) };
  },
};
