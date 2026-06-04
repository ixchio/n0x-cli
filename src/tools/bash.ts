import { spawn } from 'node:child_process';
import { assertBashAllowed } from './bash-policy.js';
import { bashArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';
import { runInDocker } from '../sandbox/docker.js';
import { N0xError } from '../lib/errors.js';
import { truncate } from '../lib/output.js';

function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', command], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new N0xError('TOOL_TIMEOUT', `Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

export const bashTool: Tool = {
  name: 'Bash',
  description:
    'Run a shell command in the project directory. Use for npm, git, builds, tests.',
  schema: bashArgs,
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      description: { type: 'string', description: 'What this command does' },
    },
    required: ['command'],
  },
  async execute(raw, ctx) {
    const args = parseArgs(bashArgs, raw);
    assertBashAllowed(args.command);

    const timeoutMs = ctx.config.bash_timeout_ms;
    try {
      const result = ctx.sandboxDocker
        ? await runInDocker(args.command, ctx.cwd, ctx.sandboxImage, timeoutMs)
        : await runCommand(args.command, ctx.cwd, timeoutMs);

      const out = truncate(
        [
          result.stdout && `stdout:\n${result.stdout}`,
          result.stderr && `stderr:\n${result.stderr}`,
          `exit code: ${result.code}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        32_000,
      );

      return {
        output: out || '(no output)',
        isError: result.code !== 0,
      };
    } catch (e) {
      if (e instanceof N0xError) {
        return { output: e.format(), isError: true };
      }
      return {
        output: e instanceof Error ? e.message : String(e),
        isError: true,
      };
    }
  },
};
