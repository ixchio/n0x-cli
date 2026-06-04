import { z } from 'zod';

export const readArgs = z.object({
  path: z.string().min(1),
  offset: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(10_000).optional(),
});

export const writeArgs = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export const editArgs = z.object({
  path: z.string().min(1),
  old_string: z.string(),
  new_string: z.string(),
});

export const deleteArgs = z.object({
  path: z.string().min(1),
});

export const renameArgs = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const bashArgs = z.object({
  command: z.string().min(1).max(16_000),
  description: z.string().optional(),
});

export const grepArgs = z.object({
  pattern: z.string().min(1).max(500),
  glob: z.string().optional(),
});

export const globArgs = z.object({
  pattern: z.string().min(1),
});

export const webSearchArgs = z.object({
  query: z.string().min(1).max(500),
  search_depth: z.enum(['basic', 'advanced']).optional(),
});

export const webExtractArgs = z.object({
  urls: z.array(z.string().url()).min(1).max(5),
  extract_depth: z.enum(['basic', 'advanced']).optional(),
});
