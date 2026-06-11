import { z } from 'zod';
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from '../constants.js';

export const configSchema = z.object({
  default_provider: z.string().default('local'),
  default_model: z.string().default(DEFAULT_MODEL),
  base_url: z.string().url().default(DEFAULT_BASE_URL),
  api_key: z.string().default('none'),
  max_steps: z.number().int().min(1).max(200).default(20),
  git_context: z.boolean().default(true),
  stream_output: z.boolean().default(true),
  sandbox_docker: z.boolean().default(false),
  sandbox_image: z.string().default('node:22-alpine'),
  bash_timeout_ms: z.number().int().min(1000).max(600_000).default(120_000),
  llm_timeout_ms: z.number().int().min(5000).max(600_000).default(300_000), // 5 min default
  tavily_api_key: z.string().optional(),
  tavily_search_depth: z.enum(['basic', 'advanced']).default('basic'), // basic = less tokens = model won't drown
  tavily_extract_depth: z.enum(['basic', 'advanced']).default('basic'),
  tavily_enabled: z.boolean().default(false), // off by default — models work better without web dumps
});

export type N0xConfig = z.infer<typeof configSchema>;

export const memorySchema = z.object({
  project: z.string().optional(),
  framework: z.string().optional(),
  database: z.string().optional(),
  notes: z.array(z.string()).optional(),
  lastGoal: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type ProjectMemory = z.infer<typeof memorySchema>;
