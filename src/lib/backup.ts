import { copyFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { getN0xHome } from '../config.js';

export async function backupFile(filePath: string): Promise<void> {
  if (!existsSync(filePath)) return;

  const timestamp = Date.now();
  const backupDir = join(getN0xHome(), 'backups', timestamp.toString());
  
  await mkdir(backupDir, { recursive: true });
  
  const backupPath = join(backupDir, basename(filePath));
  await copyFile(filePath, backupPath);
}
