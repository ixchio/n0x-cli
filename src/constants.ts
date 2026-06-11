export const PRODUCT_NAME = 'n0x';
export const CLI_COMMAND = 'n0x';
export const N0X_HOME_ENV = 'N0X_HOME';
export const N0X_DATA_DIR = '.n0x';
export const PROJECT_N0X_DIR = '.n0x';
export const DEFAULT_BASE_URL = 'http://localhost:11434/v1'; // Ollama (easiest setup)
export const DEFAULT_MODEL = 'qwen2.5-coder:3b'; // Best default for most laptops
export const DEFAULT_MAX_STEPS = 20;

/**
 * n0x works with any OpenAI-compatible local backend.
 * Recommended: Ollama (zero-setup, native tool calling).
 * Bonsai (1-bit) is still supported via llama-server — fast but weaker reasoning.
 */

/** Approximate usable context budget (chars) per model — leaves headroom for tools/output */
export const MODEL_CONTEXT_CHARS: Record<string, number> = {
  // Ollama models (recommended)
  'qwen2.5-coder:3b': 24_000,
  'qwen2.5-coder:7b': 32_000,
  'qwen2.5-coder:14b': 48_000,
  'qwen2.5-coder:32b': 64_000,
  'qwen3:4b': 20_000,
  'qwen3:8b': 32_000,
  'gemma3:4b': 20_000,
  'gemma3:12b': 40_000,
  'llama3.2:3b': 16_000,
  'llama3.2:8b': 32_000,
  // Bonsai (llama-server)
  'bonsai-1.7b': 6_000,
  'bonsai-4b': 10_000,
  'bonsai-8b': 18_000,
};

/** Bonsai model IDs (still supported via llama-server) */
export const BONSAI_MODELS = [
  'bonsai-1.7b',
  'bonsai-4b',
  'bonsai-8b',
  'prism-ml/Bonsai-1.7B-gguf:Bonsai-1.7B-Q1_0.gguf',
  'prism-ml/Bonsai-4B-gguf:Bonsai-4B-Q1_0.gguf',
  'prism-ml/Bonsai-8B-gguf:Bonsai-8B-Q1_0.gguf',
  'prism-ml/Bonsai-8B-mlx-1bit',
] as const;

export interface ModelRecommendation {
  id: string;
  backend: 'ollama' | 'llama-server';
  task: string;
  why: string;
  ram: string;
  ollamaCmd?: string;
}

export const MODEL_RECOMMENDATIONS: ModelRecommendation[] = [
  {
    id: 'qwen2.5-coder:3b',
    backend: 'ollama',
    task: 'Default — best for 8GB laptops',
    why: 'Strong native tool-calling, fast on CPU, 2GB RAM. Best bang for buck.',
    ram: '~2 GB',
    ollamaCmd: 'ollama run qwen2.5-coder:3b',
  },
  {
    id: 'qwen2.5-coder:7b',
    backend: 'ollama',
    task: 'Complex refactors, multi-file agents',
    why: 'Near-frontier coding quality. Needs 16GB RAM for comfort.',
    ram: '~5 GB',
    ollamaCmd: 'ollama run qwen2.5-coder:7b',
  },
  {
    id: 'gemma3:4b',
    backend: 'ollama',
    task: 'General coding + reasoning',
    why: 'Google Gemma 3 — excellent instruction following, good tool use.',
    ram: '~3 GB',
    ollamaCmd: 'ollama run gemma3:4b',
  },
  {
    id: 'qwen3:4b',
    backend: 'ollama',
    task: 'Advanced reasoning with thinking mode',
    why: 'Latest Qwen3 — best reasoning at 4B.',
    ram: '~3 GB',
    ollamaCmd: 'ollama run qwen3:4b',
  },
  {
    id: 'bonsai-4b',
    backend: 'llama-server',
    task: 'Ultra-fast, tiny RAM (requires llama-server)',
    why: '1-bit model — 0.6GB. Great speed, weaker reasoning on long tasks.',
    ram: '~0.6 GB',
    ollamaCmd: undefined,
  },
];

export function contextBudgetForModel(model: string): number {
  const lower = model.toLowerCase();
  const key = Object.keys(MODEL_CONTEXT_CHARS).find(
    (k) => k.toLowerCase() === lower,
  );
  if (key) {
    const val = MODEL_CONTEXT_CHARS[key];
    if (val !== undefined) return val;
  }
  if (lower.includes('32b') || lower.includes('30b')) return 64_000;
  if (lower.includes('14b')) return 48_000;
  if (lower.includes('12b') || lower.includes('13b')) return 40_000;
  if (lower.includes('8b') || lower.includes('7b')) return 32_000;
  if (lower.includes('4b') || lower.includes('3b')) return 20_000;
  if (lower.includes('1.7') || lower.includes('1b')) return 6_000;
  return 16_000;
}
