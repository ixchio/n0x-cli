import type { N0xConfig } from '../config/schema.js';
import { LLMClient } from '../llm/client.js';
import type { ChatMessage } from '../llm/types.js';
import {
  buildTools,
  toolContext,
  toolDefinitions,
  getToolByName,
  executeTool,
} from '../tools/index.js';
import { connectMcpTools, disconnectMcp } from '../mcp/client.js';
import { SYSTEM_PROMPT } from '../prompts/system.js';
import { gatherRelevantFiles } from '../context/gather.js';
import { analyzeRepository, formatRepoMap } from '../repo/analyze.js';
import { createPlan, formatPlan, advancePlan, type PlanStep } from './planner.js';
import { loadMemory, saveMemory, memoryToPrompt, type ProjectMemory } from './memory.js';
import { log } from '../lib/logger.js';
import { truncate } from '../lib/output.js';

export interface AgentCallbacks {
  onPlan?: (plan: string) => void;
  onThought?: (text: string) => void;
  onToolStart?: (name: string, argsPreview: string) => void;
  onToolEnd?: (name: string, output: string, isError: boolean) => void;
}

export interface AgentRunOptions {
  goal: string;
  cwd: string;
  config: N0xConfig;
  signal?: AbortSignal;
  callbacks?: AgentCallbacks;
}

export interface AgentRunResult {
  summary: string;
  stepsUsed: number;
  completed: boolean;
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const { goal, cwd, config, signal, callbacks } = opts;
  const llm = new LLMClient(config, signal);

  let tools = buildTools(config);
  const mcpTools = await connectMcpTools();
  tools = [...tools, ...mcpTools];

  const ctx = toolContext(config, cwd);

  try {
    const memory = await loadMemory();
    memory.lastGoal = goal;
    await saveMemory(memory);

    const repoMap = await analyzeRepository(cwd);
    const fileContext = await gatherRelevantFiles(cwd, goal);
    const plan = await createPlan(llm, goal, fileContext, signal);
    callbacks?.onPlan?.(formatPlan(plan));

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt(memory, repoMap, fileContext, plan),
      },
      { role: 'user', content: goal },
    ];

    let stepsUsed = 0;
    const maxSteps = config.max_steps;

    while (stepsUsed < maxSteps) {
      if (signal?.aborted) {
        return { summary: 'Cancelled by user.', stepsUsed, completed: false };
      }

      stepsUsed++;
      log.info('Agent step', { step: stepsUsed, max: maxSteps });

      const response = await llm.chat(messages, toolDefinitions(tools));

      if (response.tool_calls.length === 0) {
        if (response.content) {
          callbacks?.onThought?.(response.content);
          messages.push({ role: 'assistant', content: response.content });
        }
        const done =
          response.content?.includes('DONE') ||
          response.finish_reason === 'stop';
        return {
          summary: response.content ?? 'Task complete.',
          stepsUsed,
          completed: done,
        };
      }

      messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls,
      });

      if (response.content) {
        callbacks?.onThought?.(response.content);
      }

      for (const tc of response.tool_calls) {
        if (signal?.aborted) break;

        const tool = getToolByName(tools, tc.function.name);
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          args = {};
        }

        callbacks?.onToolStart?.(tc.function.name, JSON.stringify(args).slice(0, 160));

        const result = tool
          ? await executeTool(tool, args, ctx)
          : { output: `Unknown tool: ${tc.function.name}`, isError: true };

        advancePlan(plan, tc.function.name, !result.isError);

        callbacks?.onToolEnd?.(
          tc.function.name,
          truncate(result.isError ? `ERROR: ${result.output}` : result.output, 800),
          Boolean(result.isError),
        );

        messages.push({
          role: 'tool',
          content: result.output,
          tool_call_id: tc.id,
          name: tc.function.name,
        });
      }
    }

    return {
      summary: 'Max steps reached. Send a follow-up to continue.',
      stepsUsed,
      completed: false,
    };
  } finally {
    await disconnectMcp();
  }
}

function buildSystemPrompt(
  memory: ProjectMemory,
  repoMap: Awaited<ReturnType<typeof analyzeRepository>>,
  fileContext: string,
  plan: PlanStep[],
): string {
  const mem = memoryToPrompt(memory);
  return [
    SYSTEM_PROMPT,
    mem && `\n## Memory\n${mem}`,
    `\n## Repository\n${formatRepoMap(repoMap)}`,
    `\n## Relevant files\n${fileContext || '(none gathered)'}`,
    `\n## Plan\n${formatPlan(plan)}`,
    '\nReply DONE when the goal is fully complete and verified.',
  ]
    .filter(Boolean)
    .join('\n');
}
