import { readFile, writeFile } from 'node:fs/promises';
import { resolveWithinWorkspace } from '../lib/paths.js';
import { editArgs } from './schemas.js';
import type { Tool } from './types.js';
import { parseArgs } from './types.js';

export const editTool: Tool = {
  name: 'Edit',
  description:
    'Replace exact text in a file. Prefer small targeted edits over rewriting whole files.',
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

    if (!content.includes(args.old_string)) {
      return {
        output: `old_string not found in ${args.path}. Read the file first to get exact content.`,
        isError: true,
      };
    }

    const occurrences = content.split(args.old_string).length - 1;
    if (occurrences > 1) {
      return {
        output: `old_string matches ${occurrences} times. Provide more context to make it unique.`,
        isError: true,
      };
    }

    const updated = content.replace(args.old_string, args.new_string);
    await writeFile(filePath, updated, 'utf8');
    return { output: `Patched ${args.path}` };
  },
};
