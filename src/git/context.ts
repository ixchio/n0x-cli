import { spawn } from 'node:child_process';

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err || `git ${args.join(' ')} failed`));
    });
    child.on('error', () => reject(new Error('git not found')));
  });
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await git(['rev-parse', '--is-inside-work-tree'], cwd);
    return true;
  } catch {
    return false;
  }
}

export async function getGitChangedContext(cwd: string, maxChars = 8000): Promise<string> {
  if (!(await isGitRepo(cwd))) return '';

  try {
    const status = await git(['status', '--short'], cwd);
    const diff = await git(['diff', 'HEAD'], cwd);
    const staged = await git(['diff', '--cached'], cwd);
    const parts = [
      status && `## git status\n${status}`,
      diff && `## unstaged diff\n${diff.slice(0, maxChars / 2)}`,
      staged && `## staged diff\n${staged.slice(0, maxChars / 2)}`,
    ].filter(Boolean);
    const combined = parts.join('\n\n');
    return combined.length > maxChars ? combined.slice(0, maxChars) + '\n...(truncated)' : combined;
  } catch {
    return '';
  }
}

export async function getChangedFiles(cwd: string): Promise<string[]> {
  if (!(await isGitRepo(cwd))) return [];
  try {
    const out = await git(['diff', '--name-only', 'HEAD'], cwd);
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}
