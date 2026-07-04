import { applyPatch, createPatch, structuredPatch } from 'diff';

const MAX_PATCH_BYTES = 1_000_000;
const MAX_PATCH_LINES = 20_000;

export interface PatchPreview {
  path: string;
  hunks: string;
  applied: boolean;
}

export function previewPatch(path: string, oldContent: string, newContent: string): string {
  if (oldContent === newContent) return '(no changes)';
  const patch = createPatch(path, oldContent, newContent);
  return patch;
}

export function applyUnifiedPatch(
  oldContent: string,
  patchText: string,
): { ok: true; content: string } | { ok: false; error: string } {
  const patchBytes = Buffer.byteLength(patchText, 'utf8');
  if (patchBytes > MAX_PATCH_BYTES) {
    return {
      ok: false,
      error: `Patch is too large (${patchBytes} bytes). Limit is ${MAX_PATCH_BYTES} bytes.`,
    };
  }

  const patchLines = patchText.split('\n').length;
  if (patchLines > MAX_PATCH_LINES) {
    return {
      ok: false,
      error: `Patch has too many lines (${patchLines}). Limit is ${MAX_PATCH_LINES} lines.`,
    };
  }

  const result = applyPatch(oldContent, patchText);
  if (result === false) {
    return { ok: false, error: 'Patch did not apply cleanly' };
  }
  return { ok: true, content: result };
}

export function buildPatchFromReplacement(
  path: string,
  oldContent: string,
  oldString: string,
  newString: string,
): string | null {
  if (!oldContent.includes(oldString)) return null;
  const newContent = oldContent.replace(oldString, newString);
  return createPatch(path, oldContent, newContent);
}

export function structuredDiffPreview(
  path: string,
  oldContent: string,
  newContent: string,
): string {
  const patch = structuredPatch(path, path, oldContent, newContent);
  const lines: string[] = [];
  for (const h of patch.hunks) {
    lines.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
    for (const l of h.lines) lines.push(l);
  }
  return lines.join('\n') || '(no changes)';
}
