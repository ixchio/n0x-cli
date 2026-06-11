import { readFile, writeFile } from 'node:fs/promises';
import { resolveWithinWorkspace } from '../lib/paths.js';
import { buildPatchFromReplacement, previewPatch } from '../lib/patch.js';
import { backupFile } from '../lib/backup.js';
import { editArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';

export const editTool: Tool = {
  name: 'Edit',
  description:
    'Replace exact text in a file. Requires a unique match (whitespace-tolerant fallback). Shows unified diff. Use ApplyPatch for large multi-hunk edits.',
  schema: editArgs,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      old_string: { type: 'string', description: 'Exact text to replace' },
      new_string: { type: 'string', description: 'Replacement text' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  async execute(raw, ctx) {
    const args = parseArgs(editArgs, raw);
    const filePath = resolveWithinWorkspace(ctx.cwd, args.path);
    const content = await readFile(filePath, 'utf8');

    let matchToReplace = args.old_string;
    if (!content.includes(args.old_string)) {
      // Fuzzy fallback: normalize whitespace and try to find a unique match
      const escaped = args.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wsRegex = new RegExp(escaped.replace(/\s+/g, '\\s+'), 'g');
      const matches = [...content.matchAll(wsRegex)];
      
      if (matches.length === 1 && matches[0]) {
        matchToReplace = matches[0][0];
      } else if (matches.length > 1) {
        return {
          output: `old_string matches ${matches.length} times after whitespace normalization. Provide more context to make it unique.`,
          isError: true,
        };
      } else {
        return {
          output: `old_string not found in ${args.path}. Read the file first to get exact content.`,
          isError: true,
        };
      }
    } else {
      const occurrences = content.split(args.old_string).length - 1;
      if (occurrences > 1) {
        return {
          output: `old_string matches ${occurrences} times. Provide more context to make it unique.`,
          isError: true,
        };
      }
    }

    const updated = content.replace(matchToReplace, args.new_string);
    const diff = buildPatchFromReplacement(
      args.path,
      content,
      matchToReplace,
      args.new_string,
    ) ?? previewPatch(args.path, content, updated);

    if (ctx.editMode === 'dry') {
      return {
        output: `[DRY RUN] Would edit ${args.path}:\n\n${diff}`,
      };
    }

    if (ctx.editMode === 'interactive') {
      const { confirmAction } = await import('../lib/prompt.js');
      console.log(`\nProposal: Edit ${args.path}\n${diff}`);
      const confirm = await confirmAction('Apply this edit?');
      if (!confirm) {
        return { output: 'User rejected the edit.' };
      }
    }

    await backupFile(filePath);
    await writeFile(filePath, updated, 'utf8');
    return { output: `Patched ${args.path}\n\n${diff}` };
  },
};
