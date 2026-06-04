import { readFile, writeFile } from 'node:fs/promises';
import { resolveWithinWorkspace } from '../lib/paths.js';
import { applyUnifiedPatch, previewPatch } from '../lib/patch.js';
import { backupFile } from '../lib/backup.js';
import { patchArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';

export const patchTool: Tool = {
  name: 'ApplyPatch',
  description:
    'Apply a unified diff patch to a file. Prefer over Edit for multi-line changes. In dry mode returns diff preview only.',
  schema: patchArgs,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      patch: { type: 'string', description: 'Unified diff (---/+++/@@ format)' },
    },
    required: ['path', 'patch'],
  },
  async execute(raw, ctx) {
    const args = parseArgs(patchArgs, raw);
    const filePath = resolveWithinWorkspace(ctx.cwd, args.path);
    const oldContent = await readFile(filePath, 'utf8');
    const result = applyUnifiedPatch(oldContent, args.patch);

    if (!result.ok) {
      return { output: result.error, isError: true };
    }

    const diffPreview = previewPatch(args.path, oldContent, result.content);

    if (ctx.editMode === 'dry') {
      return {
        output: `[DRY RUN] Would patch ${args.path}:\n\n${diffPreview}`,
      };
    }

    if (ctx.editMode === 'interactive') {
      const { confirmAction } = await import('../lib/prompt.js');
      console.log(`\nProposal: Apply Patch to ${args.path}\n${diffPreview}`);
      const confirm = await confirmAction('Apply this patch?');
      if (!confirm) {
        return { output: 'User rejected the patch.' };
      }
    }

    await backupFile(filePath);
    await writeFile(filePath, result.content, 'utf8');
    return { output: `Patched ${args.path}\n\n${diffPreview}` };
  },
};
