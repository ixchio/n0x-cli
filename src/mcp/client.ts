import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { mcpConfigPath } from '../config.js';
import type { Tool, ToolResult } from '../tools/types.js';
import { log } from '../lib/logger.js';
import { truncate } from '../lib/output.js';
import { sanitizeEnv } from '../lib/security.js';

const mcpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

const mcpConfigSchema = z.object({
  mcpServers: z.record(mcpServerSchema).optional(),
});

interface McpConnection {
  name: string;
  client: Client;
  transport: StdioClientTransport;
}

const connections: McpConnection[] = [];

export async function loadMcpConfig(): Promise<z.infer<typeof mcpConfigSchema>> {
  const path = mcpConfigPath();
  if (!existsSync(path)) return {};
  const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
  return mcpConfigSchema.parse(raw);
}

export async function connectMcpTools(): Promise<Tool[]> {
  await disconnectMcp();
  const config = await loadMcpConfig();
  const servers = config.mcpServers ?? {};
  const tools: Tool[] = [];

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    try {
      // SECURITY: Sanitize environment variables to prevent injection
      const baseEnv = sanitizeEnv(process.env as Record<string, string>);
      const customEnv = serverConfig.env ? sanitizeEnv(serverConfig.env) : {};

      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args ?? [],
        env: { ...baseEnv, ...customEnv },
      });
      const client = new Client({ name: 'n0x', version: '0.1.0' }, { capabilities: {} });
      await client.connect(transport);
      connections.push({ name: serverName, client, transport });

      const listed = await client.listTools();
      for (const t of listed.tools) {
        const qualified = `mcp__${serverName}__${t.name}`;
        tools.push({
          name: qualified,
          description: t.description ?? `MCP tool from ${serverName}`,
          schema: z.record(z.unknown()),
          parameters: (t.inputSchema as Record<string, unknown>) ?? {
            type: 'object',
            properties: {},
          },
          async execute(args): Promise<ToolResult> {
            const result = await client.callTool({
              name: t.name,
              arguments: args,
            });
            const text = Array.isArray(result.content)
              ? result.content
                  .map((c) => ('text' in c ? String(c.text) : JSON.stringify(c)))
                  .join('\n')
              : JSON.stringify(result.content);
            return {
              output: truncate(text, 16_000),
              isError: Boolean(result.isError),
            };
          },
        });
      }
      log.info('MCP server connected', { server: serverName, tools: listed.tools.length });
    } catch (e) {
      log.warn('MCP server failed', {
        server: serverName,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return tools;
}

export async function disconnectMcp(): Promise<void> {
  for (const conn of connections.splice(0)) {
    try {
      await conn.client.close();
    } catch {
      /* ignore */
    }
  }
}
