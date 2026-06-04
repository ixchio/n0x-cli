import type { N0xConfig } from '../config/schema.js';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { toolDef } from './types.js';
import { readTool } from './read.js';
import { writeTool } from './write.js';
import { deleteTool } from './delete.js';
import { renameTool } from './rename.js';
import { editTool } from './edit.js';
import { bashTool } from './bash.js';
import { grepTool } from './grep.js';
import { globTool } from './glob.js';
import { createWebSearchTool } from './web-search.js';
import { createWebExtractTool } from './web-extract.js';
import { isN0xError, formatError } from '../lib/errors.js';
import { ZodError } from 'zod';
import { log } from '../lib/logger.js';

const CORE_TOOLS: Tool[] = [
  readTool,
  writeTool,
  editTool,
  deleteTool,
  renameTool,
  bashTool,
  grepTool,
  globTool,
];

export function buildTools(config: N0xConfig): Tool[] {
  const tools = [...CORE_TOOLS];
  if (config.tavily_enabled) {
    tools.push(createWebSearchTool(config));
    tools.push(createWebExtractTool(config));
  }
  return tools;
}

export function toolContext(config: N0xConfig, cwd: string): ToolContext {
  return {
    cwd,
    config,
    sandboxDocker: config.sandbox_docker,
    sandboxImage: config.sandbox_image,
  };
}

export function toolDefinitions(tools: Tool[]) {
  return tools.map(toolDef);
}

export function getToolByName(tools: Tool[], name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}

export async function executeTool(
  tool: Tool,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    return await tool.execute(args, ctx);
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        output: `Invalid arguments: ${e.errors.map((x) => x.message).join('; ')}`,
        isError: true,
      };
    }
    if (isN0xError(e)) {
      log.warn('Tool error', { tool: tool.name, code: e.code });
      return { output: e.format(), isError: true };
    }
    log.error('Tool failed', { tool: tool.name, error: formatError(e) });
    return { output: formatError(e), isError: true };
  }
}
