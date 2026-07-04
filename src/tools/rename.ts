import { rename, stat } from 'node:fs/promises';
import { resolveWithinWorkspace } from '../lib/paths.js';
import { backupFile } from '../lib/backup.js';
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

    if (await exists(to)) {
      return {
        output: `Cannot rename ${args.from} to ${args.to}: target already exists.`,
        isError: true,
      };
    }

    if (ctx.editMode === 'dry') {
      return { output: `[DRY RUN] Would rename ${args.from} -> ${args.to}` };
    }

    if (ctx.editMode === 'interactive') {
      const { confirmAction } = await import('../lib/prompt.js');
      const confirm = await confirmAction(`Rename ${args.from} to ${args.to}?`);
      if (!confirm) {
        return { output: 'User rejected the rename.' };
      }
    }

    await backupFile(from);
    await rename(from, to);
    return { output: `Renamed ${args.from} -> ${args.to}` };
  },
};

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return false;
    }
    throw err;
  }
}
