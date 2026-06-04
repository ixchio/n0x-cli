import type { ZodType } from 'zod';
import type { N0xConfig } from '../config/schema.js';

export interface ToolContext {
  cwd: string;
  config: N0xConfig;
  sandboxDocker: boolean;
  sandboxImage: string;
}

export interface ToolResult {
  output: string;
  isError?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  schema: ZodType;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export function toolDef(t: Tool) {
  return {
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  };
}

export function parseArgs<T>(schema: ZodType<T>, args: Record<string, unknown>): T {
  return schema.parse(args);
}
