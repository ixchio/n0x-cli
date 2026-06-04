import { spawn } from 'node:child_process';
import { N0xError } from '../lib/errors.js';

export async function runInDocker(
  command: string,
  cwd: string,
  image: string,
  timeoutMs = 120_000,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const args = [
    'run',
    '--rm',
    '--network', 'none',
    '-v', `${cwd}:/workspace:rw`,
    '-w', '/workspace',
    image,
    'sh', '-lc', command,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new N0xError('TOOL_TIMEOUT', `Docker command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(
        new N0xError(
          'TOOL_FAILED',
          'Docker not available',
          'Install Docker or set sandbox_docker = false in ~/.n0x/config.toml',
        ),
      );
    });
  });
}

export async function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['info'], { stdio: 'ignore' });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}
