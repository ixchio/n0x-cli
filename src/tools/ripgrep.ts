import { spawn } from 'node:child_process';
import { N0xError } from '../lib/errors.js';

export interface RipgrepResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function runRipgrep(
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<RipgrepResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('rg', args, { cwd });
    let settled = false;
    let stdout = '';
    let stderr = '';

    const finish = (
      fn: () => void,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(() => {
        reject(new N0xError('TOOL_TIMEOUT', `ripgrep timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      finish(() => {
        resolve({ stdout, stderr, code: code ?? 1 });
      });
    });
    child.on('error', () => {
      finish(() => {
        reject(
          new N0xError(
            'TOOL_FAILED',
            'ripgrep (rg) not found',
            'Install: sudo apt install ripgrep',
          ),
        );
      });
    });
  });
}
