export const PRODUCT_NAME = 'n0x';
export const CLI_COMMAND = 'n0x';
export const N0X_HOME_ENV = 'N0X_HOME';
export const N0X_DATA_DIR = '.n0x';
export const PROJECT_N0X_DIR = '.n0x';
export const DEFAULT_BASE_URL = 'http://localhost:8080/v1';
export const DEFAULT_MODEL = 'bonsai-4b';
export const DEFAULT_MAX_STEPS = 20;

/** Approximate usable context (chars) per model — leave headroom for tools/output */
export const MODEL_CONTEXT_CHARS: Record<string, number> = {
  'bonsai-1.7b': 6_000,
  'prism-ml/Bonsai-1.7B-gguf:Q4_K_M': 6_000,
  'prism-ml/Ternary-Bonsai-1.7B-mlx-2bit': 6_000,
  'bonsai-4b': 12_000,
  'prism-ml/Bonsai-4B-gguf:Q4_K_M': 12_000,
  'bonsai-8b': 20_000,
  'prism-ml/Bonsai-8B-gguf:Q4_K_M': 20_000,
  'prism-ml/Bonsai-8B-mlx-1bit': 20_000,
};

export const BONSAI_MODELS = [
  'bonsai-1.7b',
  'prism-ml/Bonsai-1.7B-gguf:Q4_K_M',
  'prism-ml/Ternary-Bonsai-1.7B-mlx-2bit',
  'bonsai-4b',
  'prism-ml/Bonsai-4B-gguf:Q4_K_M',
  'bonsai-8b',
  'prism-ml/Bonsai-8B-gguf:Q4_K_M',
  'prism-ml/Bonsai-8B-mlx-1bit',
] as const;

export interface ModelRecommendation {
  id: string;
  hf: string;
  task: string;
  why: string;
  ram: string;
}

export const MODEL_RECOMMENDATIONS: ModelRecommendation[] = [
  {
    id: 'bonsai-1.7b',
    hf: 'prism-ml/Bonsai-1.7B-gguf:Q4_K_M',
    task: 'Fast autocomplete / small edits',
    why: 'Tiny, fast',
    ram: '~1 GB',
  },
  {
    id: 'bonsai-4b',
    hf: 'prism-ml/Bonsai-4B-gguf:Q4_K_M',
    task: 'General coding agent (default)',
    why: 'Best balance',
    ram: '~0.6 GB',
  },
  {
    id: 'bonsai-8b',
    hf: 'prism-ml/Bonsai-8B-gguf:Q4_K_M',
    task: 'Complex refactors',
    why: 'Stronger reasoning',
    ram: '~5–6 GB',
  },
  {
    id: 'bonsai-8b-mlx',
    hf: 'prism-ml/Bonsai-8B-mlx-1bit',
    task: 'Mac / Apple Silicon',
    why: 'MLX 1-bit, very fast',
    ram: '~0.4 GB effective',
  },
];

export function contextBudgetForModel(model: string): number {
  const key = Object.keys(MODEL_CONTEXT_CHARS).find(
    (k) => k.toLowerCase() === model.toLowerCase(),
  );
  if (key) {
    const val = MODEL_CONTEXT_CHARS[key];
    if (val !== undefined) return val;
  }
  if (model.toLowerCase().includes('1.7')) return 6_000;
  if (model.toLowerCase().includes('8')) return 20_000;
  if (model.toLowerCase().includes('4')) return 12_000;
  return 10_000;
}
