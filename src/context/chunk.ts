import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { contextBudgetForModel } from '../constants.js';

export interface FileChunk {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
}

export function chunkFileContent(
  path: string,
  content: string,
  maxChars: number,
): FileChunk[] {
  const lines = content.split('\n');
  const chunks: FileChunk[] = [];
  let start = 0;
  let buf: string[] = [];
  let size = 0;

  const flush = (end: number) => {
    if (buf.length === 0) return;
    chunks.push({
      path,
      startLine: start + 1,
      endLine: end,
      content: buf.join('\n'),
    });
    buf = [];
    size = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === undefined) continue;
    const line = lines[i]! + '\n';
    if (size + line.length > maxChars && buf.length > 0) {
      flush(i);
      start = i;
    }
    buf.push(lines[i]!);
    size += line.length;
  }
  flush(lines.length);
  return chunks;
}

export async function loadChunksForFiles(
  cwd: string,
  files: string[],
  budgetChars: number,
): Promise<string> {
  const perFile = Math.max(800, Math.floor(budgetChars / Math.max(files.length, 1)));
  const parts: string[] = [];
  let used = 0;

  for (const rel of files) {
    if (used >= budgetChars) break;
    try {
      const raw = await readFile(join(cwd, rel), 'utf8');
      const chunks = chunkFileContent(rel, raw, perFile);
      const first = chunks[0];
      if (!first) continue;
      const header =
        chunks.length > 1
          ? `--- ${rel} (lines ${first.startLine}-${first.endLine}, ${chunks.length} chunks total) ---`
          : `--- ${rel} ---`;
      parts.push(`${header}\n${first.content}`);
      used += first.content.length;
    } catch {
      /* skip */
    }
  }
  return parts.join('\n\n');
}

export function fileBudget(model: string, reserved = 3000): number {
  return Math.max(2000, contextBudgetForModel(model) - reserved);
}
