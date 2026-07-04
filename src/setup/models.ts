/**
 * Bonsai model definitions and RAM tier detection
 */

import { totalmem, freemem } from 'os';

export interface BonsaiModel {
  id: string;
  name: string;
  displayName: string;
  ramMB: number;
  accuracy: number;
  speed: string;
  downloadUrl: string;
  filename: string;
  description: string;
  bestFor: string;
}

export const BONSAI_MODELS: BonsaiModel[] = [
  {
    id: 'ternary-bonsai-1.7b',
    name: 'Ternary Bonsai 1.7B',
    displayName: 'Ternary Bonsai 1.7B',
    ramMB: 370,
    accuracy: 70,
    speed: '100+ tok/sec',
    downloadUrl: 'https://huggingface.co/prism-ml/Ternary-Bonsai-1.7B-gguf/resolve/main/Ternary-Bonsai-1.7B-Q2_0.gguf',
    filename: 'ternary-bonsai-1.7b-q2.gguf',
    description: 'Ultra-lightweight model for basic coding tasks',
    bestFor: '2-4GB RAM systems, simple tasks, background coding',
  },
  {
    id: 'ternary-bonsai-4b',
    name: 'Ternary Bonsai 4B',
    displayName: 'Ternary Bonsai 4B',
    ramMB: 1025,
    accuracy: 83,
    speed: '60-80 tok/sec',
    downloadUrl: 'https://huggingface.co/prism-ml/Ternary-Bonsai-4B-gguf/resolve/main/Ternary-Bonsai-4B-Q2_0.gguf',
    filename: 'ternary-bonsai-4b-q2.gguf',
    description: 'Best balance of quality and efficiency',
    bestFor: '4-8GB RAM systems, general coding, bug fixes',
  },
  {
    id: 'ternary-bonsai-8b',
    name: 'Ternary Bonsai 8B',
    displayName: 'Ternary Bonsai 8B',
    ramMB: 1750,
    accuracy: 85,
    speed: '40-60 tok/sec',
    downloadUrl: 'https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf/resolve/main/Ternary-Bonsai-8B-Q2_0.gguf',
    filename: 'ternary-bonsai-8b-q2.gguf',
    description: 'Highest quality, matches Qwen3.5-4B performance',
    bestFor: '6-16GB RAM systems, complex refactors, architecture',
  },
];

export enum RAMTier {
  ULTRA_LOW = 'ultra-low',  // <4GB
  LOW = 'low',              // 4-6GB
  MEDIUM = 'medium',        // 6-12GB
  HIGH = 'high',            // 12GB+
}

export interface RAMTierInfo {
  tier: RAMTier;
  totalGB: number;
  freeGB: number;
  recommendedModel: BonsaiModel;
  alternatives: BonsaiModel[];
}

export function detectRAMTier(): RAMTierInfo {
  const totalGB = totalmem() / (1024 ** 3);
  const freeGB = freemem() / (1024 ** 3);

  let tier: RAMTier;
  let recommendedModel: BonsaiModel;
  let alternatives: BonsaiModel[];

  if (totalGB < 4) {
    tier = RAMTier.ULTRA_LOW;
    recommendedModel = BONSAI_MODELS[0]!; // 1.7B
    alternatives = [BONSAI_MODELS[1]!];
  } else if (totalGB < 6) {
    tier = RAMTier.LOW;
    recommendedModel = BONSAI_MODELS[1]!; // 4B
    alternatives = [BONSAI_MODELS[0]!, BONSAI_MODELS[2]!];
  } else if (totalGB < 12) {
    tier = RAMTier.MEDIUM;
    recommendedModel = BONSAI_MODELS[2]!; // 8B
    alternatives = [BONSAI_MODELS[1]!];
  } else {
    tier = RAMTier.HIGH;
    recommendedModel = BONSAI_MODELS[2]!; // 8B
    alternatives = [BONSAI_MODELS[1]!];
  }

  return {
    tier,
    totalGB,
    freeGB,
    recommendedModel,
    alternatives,
  };
}

export function getModelById(id: string): BonsaiModel | undefined {
  return BONSAI_MODELS.find(m => m.id === id);
}

export function formatRAMSize(mb: number): string {
  if (mb < 1024) return `${mb}MB`;
  return `${(mb / 1024).toFixed(1)}GB`;
}
