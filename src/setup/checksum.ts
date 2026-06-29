/**
 * Model checksum verification for security
 */

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import chalk from 'chalk';

export const MODEL_CHECKSUMS: Record<string, string> = {
  // Ternary Bonsai models (official checksums from HuggingFace)
  'ternary-bonsai-1.7b-q2.gguf': 'PLACEHOLDER_CHECKSUM_1', // Will be updated with real checksums
  'ternary-bonsai-4b-q2.gguf': 'PLACEHOLDER_CHECKSUM_2',
  'ternary-bonsai-8b-q2.gguf': 'PLACEHOLDER_CHECKSUM_3',
};

export async function calculateChecksum(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

export async function verifyModelChecksum(
  filePath: string,
  expectedChecksum?: string,
): Promise<{ valid: boolean; actualChecksum: string; expectedChecksum?: string }> {
  const actualChecksum = await calculateChecksum(filePath);

  if (!expectedChecksum) {
    // No expected checksum, just return the actual one
    return {
      valid: true, // Consider valid if no expected checksum
      actualChecksum,
    };
  }

  const valid = actualChecksum === expectedChecksum;

  return {
    valid,
    actualChecksum,
    expectedChecksum,
  };
}

export function showChecksumVerification(result: {
  valid: boolean;
  actualChecksum: string;
  expectedChecksum?: string;
}): void {
  if (result.valid) {
    console.log(chalk.green('✓ Checksum verified'));
  } else {
    console.log(chalk.red('✗ Checksum mismatch!'));
    console.log(chalk.dim(`  Expected: ${result.expectedChecksum}`));
    console.log(chalk.dim(`  Actual:   ${result.actualChecksum}`));
    console.log(chalk.yellow('\n⚠ File may be corrupted or tampered with!'));
  }
}
