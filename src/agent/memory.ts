import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { memoryPath, ensureN0xHome } from '../config.js';
import { memorySchema, type ProjectMemory } from '../config/schema.js';
import { log } from '../lib/logger.js';

export type { ProjectMemory };

export async function loadMemory(): Promise<ProjectMemory> {
  const path = memoryPath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    const parsed = memorySchema.safeParse(raw);
    return parsed.success ? parsed.data : {};
  } catch {
    log.warn('Corrupt memory file, resetting', { path });
    return {};
  }
}

export async function saveMemory(memory: ProjectMemory): Promise<void> {
  await ensureN0xHome();
  const data = memorySchema.parse({
    ...memory,
    updatedAt: new Date().toISOString(),
  });
  await writeFile(memoryPath(), JSON.stringify(data, null, 2), 'utf8');
}

export function memoryToPrompt(memory: ProjectMemory): string {
  const parts: string[] = [];
  if (memory.project) parts.push(`Project: ${memory.project}`);
  if (memory.framework) parts.push(`Framework: ${memory.framework}`);
  if (memory.database) parts.push(`Database: ${memory.database}`);
  if (memory.lastGoal) parts.push(`Last goal: ${memory.lastGoal}`);
  if (memory.notes?.length) parts.push(`Notes:\n- ${memory.notes.join('\n- ')}`);
  return parts.join('\n');
}
