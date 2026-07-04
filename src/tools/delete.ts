import { unlink } from 'node:fs/promises';
import { resolveWithinWorkspace } from '../lib/paths.js';
import { backupFile } from '../lib/backup.js';
import { deleteArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';

export const deleteTool: Tool = {
  name: 'Delete',
  description: 'Delete a file within the workspace.',
  schema: deleteArgs,
  parameters: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  },
  async execute(raw, ctx) {
    const args = parseArgs(deleteArgs, raw);
    const filePath = resolveWithinWorkspace(ctx.cwd, args.path);
    if (ctx.editMode === 'dry') {
      return { output: `[DRY RUN] Would delete ${args.path}` };
    }
    if (ctx.editMode === 'interactive') {
      const { confirmAction } = await import('../lib/prompt.js');
      const confirm = await confirmAction(`Delete ${args.path}?`);
      if (!confirm) {
        return { output: 'User rejected the delete.' };
      }
    }
    await backupFile(filePath);
    await unlink(filePath);
    return { output: `Deleted ${args.path}` };
  },
};
