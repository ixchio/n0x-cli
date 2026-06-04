import type { N0xConfig } from '../config/schema.js';
import { LLMClient } from '../llm/client.js';
import { contextBudgetForModel } from '../constants.js';
import type { ChatMessage } from '../llm/types.js';
import {
  buildTools,
  toolContext,
  toolDefinitions,
  getToolByName,
  executeTool,
} from '../tools/index.js';
import type { EditMode } from '../tools/types.js';
import { connectMcpTools, disconnectMcp } from '../mcp/client.js';
import { SYSTEM_PROMPT } from '../prompts/system.js';
import { buildAgentContext } from '../context/build.js';
import { analyzeRepository, formatRepoMap } from '../repo/analyze.js';
import { createPlan, formatPlan, advancePlan, type PlanStep } from './planner.js';
import { loadMemory, saveMemory, memoryToPrompt, type ProjectMemory } from './memory.js';
import {
  loadSession,
  saveSession,
  appendToSession,
  updateSessionSummary,
} from '../context/session.js';
import { log } from '../lib/logger.js';
import { truncate } from '../lib/output.js';

export interface AgentCallbacks {
  onPlan?: (plan: string) => void;
  onThought?: (text: string) => void;
  onToken?: (token: string) => void;
  onToolStart?: (name: string, argsPreview: string) => void;
  onToolEnd?: (name: string, output: string, isError: boolean) => void;
  onWarning?: (msg: string) => void;
}

export interface AgentRunOptions {
  goal: string;
  cwd: string;
  config: N0xConfig;
  signal?: AbortSignal;
  callbacks?: AgentCallbacks;
  editMode?: EditMode;
  stream?: boolean;
}

export interface AgentRunResult {
  summary: string;
  stepsUsed: number;
  completed: boolean;
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const {
    goal,
    cwd,
    config,
    signal,
    callbacks,
    editMode = 'apply',
    stream = config.stream_output,
  } = opts;
  const llm = new LLMClient(config, signal);

  let tools = buildTools(config);
  const mcpTools = await connectMcpTools();
  tools = [...tools, ...mcpTools];

  const ctx = toolContext(config, cwd, editMode);

  try {
    const memory = await loadMemory();
    memory.lastGoal = goal;
    await saveMemory(memory);

    let session = await loadSession(cwd);
    const repoMap = await analyzeRepository(cwd);
    const built = await buildAgentContext(cwd, goal, config, session);
    const plan = await createPlan(llm, goal, built.files, signal);
    callbacks?.onPlan?.(formatPlan(plan));

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt(memory, repoMap, built, plan, editMode),
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

      const onToken =
        stream && callbacks?.onToken ? (t: string) => callbacks.onToken!(t) : undefined;
      
      const charCount = JSON.stringify(messages).length;
      const budget = contextBudgetForModel(config.default_model);
      if (charCount > budget * 0.8) {
        callbacks?.onWarning?.(
          `Context window >80% full (${Math.round((charCount / budget) * 100)}%). Output may degrade.`
        );
      }

      const response = await llm.chat(messages, toolDefinitions(tools), onToken);

      if (response.tool_calls.length === 0) {
        if (response.content) {
          callbacks?.onThought?.(response.content);
          messages.push({ role: 'assistant', content: response.content });
        }
        const done =
          response.content?.includes('DONE') ||
          response.finish_reason === 'stop';

        session = appendToSession(session, cwd, messages.slice(-2));
        if (response.content && stepsUsed > 2) {
          await updateSessionSummary(
            session,
            truncate(response.content, 800),
          );
        } else {
          await saveSession(session);
        }

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

      if (response.content) callbacks?.onThought?.(response.content);

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

      session = appendToSession(session, cwd, messages.slice(-4));
      await saveSession(session);
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
  built: Awaited<ReturnType<typeof buildAgentContext>>,
  plan: PlanStep[],
  editMode: EditMode,
): string {
  const mem = memoryToPrompt(memory);
  const modeNote =
    editMode === 'dry'
      ? '\n## Mode\nDRY RUN — preview diffs only; changes are NOT written to disk.'
      : '\n## Mode\nAPPLY — file edits are written to disk.';

  return [
    SYSTEM_PROMPT,
    modeNote,
    mem && `\n## Memory\n${mem}`,
    built.session && `\n## Session\n${built.session}`,
    `\n## Repository\n${formatRepoMap(repoMap)}`,
    `\n## Symbol index\n${built.symbols}`,
    built.git && `\n## Git changes\n${built.git}`,
    `\n## Relevant files\n${built.files || '(none)'}`,
    `\n## Plan\n${formatPlan(plan)}`,
    '\nReAct loop: Think → Act (one tool) → Observe → repeat. Reply DONE when verified.',
  ]
    .filter(Boolean)
    .join('\n');
}
