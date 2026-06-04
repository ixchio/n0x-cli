import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { resolveWithinWorkspace } from '../lib/paths.js';
import { previewPatch } from '../lib/patch.js';
import { backupFile } from '../lib/backup.js';
import { writeArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';

export const writeTool: Tool = {
  name: 'Write',
  description: 'Write content to a file (creates or overwrites). Respects --dry.',
  schema: writeArgs,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['path', 'content'],
  },
  async execute(raw, ctx) {
    const args = parseArgs(writeArgs, raw);
    const filePath = resolveWithinWorkspace(ctx.cwd, args.path);
    const existed = existsSync(filePath);
    const oldContent = existed ? await readFile(filePath, 'utf8') : '';
    const diff = previewPatch(args.path, oldContent, args.content);

    if (ctx.editMode === 'dry') {
      return {
        output: `[DRY RUN] Would ${existed ? 'overwrite' : 'create'} ${args.path}:\n\n${diff}`,
      };
    }

    if (ctx.editMode === 'interactive') {
      const { confirmAction } = await import('../lib/prompt.js');
      console.log(`\nProposal: Write ${args.path}\n${diff}`);
      const confirm = await confirmAction('Apply this write?');
      if (!confirm) {
        return { output: 'User rejected the write.' };
      }
    }

    if (existed) await backupFile(filePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, args.content, 'utf8');
    return { output: `Wrote ${args.path} (${args.content.length} bytes)\n\n${diff}` };
  },
};
