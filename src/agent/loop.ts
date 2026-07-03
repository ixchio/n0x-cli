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
import { SmartContextCompressor } from '../context/compressor.js';
import { ReflectionEngine } from './reflection.js';

export interface AgentCallbacks {
  onPlan?: (plan: string) => void;
  onThought?: (text: string) => void;
  onToken?: (token: string) => void;
  onStep?: (status: {
    step: number;
    maxSteps: number;
    contextChars: number;
    contextBudget: number;
    contextPercent: number;
    approxTokens: number;
  }) => void;
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
  const contextCompressor = new SmartContextCompressor();
  const reflectionEngine = new ReflectionEngine(cwd);
  await reflectionEngine.init();

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

    let messages: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt(memory, repoMap, built, plan, editMode, reflectionEngine),
      },
      { role: 'user', content: goal },
    ];

    let stepsUsed = 0;
    const maxSteps = config.max_steps;
    const recentCallSigs: string[] = [];
    const LOOP_WINDOW = 4;
    const LOOP_THRESHOLD = 3;

    while (stepsUsed < maxSteps) {
      if (signal?.aborted) {
        return { summary: 'Cancelled by user.', stepsUsed, completed: false };
      }

      stepsUsed++;
      log.info('Agent step', { step: stepsUsed, max: maxSteps });

      const onToken =
        stream && callbacks?.onToken ? (t: string) => callbacks.onToken!(t) : undefined;

      // Smart context management: compress if needed
      const charCount = JSON.stringify(messages).length;
      const budget = contextBudgetForModel(config.default_model);
      const usage = charCount / budget;
      callbacks?.onStep?.({
        step: stepsUsed,
        maxSteps,
        contextChars: charCount,
        contextBudget: budget,
        contextPercent: Math.min(100, usage * 100),
        approxTokens: Math.ceil(charCount / 4),
      });

      if (usage > 0.7) {
        // Compress context before it becomes a problem
        log.info('Context compression triggered', { usage: `${Math.round(usage * 100)}%` });
        messages = await contextCompressor.compressMessages(messages, budget);
        callbacks?.onWarning?.(
          `Context compressed to fit the model window (was ${Math.round(usage * 100)}%).`
        );
      }

      const response = await llm.chat(messages, toolDefinitions(tools), onToken);

      // Fallback: extract raw JSON tool calls from content if llama-server didn't parse them natively
      if (response.content && response.tool_calls.length === 0) {
        const rawCalls = Array.from(response.content.matchAll(/\{"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/g));
        if (rawCalls.length > 0) {
          for (const match of rawCalls) {
            try {
              const tc = JSON.parse(match[0]);
              // Validate structure
              if (tc && typeof tc === 'object' && tc.name && typeof tc.name === 'string') {
                response.tool_calls.push({
                  id: `call_${Math.random().toString(36).substring(7)}`,
                  type: 'function',
                  function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
                });
              }
            } catch { /* ignore */ }
          }
          response.content = response.content.replace(/\{"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}[\s\S]*?(?:<\/tool_call>)?/g, '').trim();
        }
      }

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

        const extractArgs = (
          raw: string,
        ): { args: Record<string, unknown> | null; parseError: string | null } => {
          if (!raw) return { args: {}, parseError: null };
          const tryParse = (s: string): Record<string, unknown> | null => {
            try {
              const v = JSON.parse(s.trim());
              return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
            } catch {
              return null;
            }
          };
          const args = tryParse(raw);
          if (args) return { args, parseError: null };
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) { const a = tryParse(match[0]); if (a) return { args: a, parseError: null }; }
          const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fence?.[1]) { const a = tryParse(fence[1]); if (a) return { args: a, parseError: null }; }
          return {
            args: null,
            parseError: `Could not parse tool arguments as JSON. Raw received: ${raw.slice(0, 200)}`,
          };
        };
        const { args, parseError } = extractArgs(tc.function.arguments || '');

        if (parseError) {
          callbacks?.onWarning?.(parseError);
          messages.push({
            role: 'tool',
            content: parseError,
            tool_call_id: tc.id,
            name: tc.function.name,
          });
          recentCallSigs.push(`${tc.function.name}|__parse_error__`);
          if (recentCallSigs.length > LOOP_WINDOW) recentCallSigs.shift();
          continue;
        }

        const sig = `${tc.function.name}|${JSON.stringify(args)}`;
        recentCallSigs.push(sig);
        if (recentCallSigs.length > LOOP_WINDOW) recentCallSigs.shift();
        const repeats = recentCallSigs.filter((s) => s === sig).length;
        if (repeats >= LOOP_THRESHOLD) {
          // FORCE strategy change - don't just warn, inject strong system override
          const forceMessage = `LOOP DETECTED - STRATEGY CHANGE REQUIRED

You have called ${tc.function.name}(${JSON.stringify(args)}) ${repeats} times with IDENTICAL arguments in the last ${LOOP_WINDOW} steps.

This approach is NOT WORKING. You MUST:
1. Stop calling ${tc.function.name} with these arguments
2. Try a COMPLETELY DIFFERENT approach
3. Use a DIFFERENT tool or DIFFERENT arguments
4. If truly stuck, summarize what you learned and state "DONE" with current findings

DO NOT repeat ${tc.function.name} again. Change your strategy NOW.`;

          callbacks?.onWarning?.(
            `Loop detected: ${tc.function.name} called ${repeats}x with the same arguments. Forcing a strategy change.`
          );

          // Inject as high-priority system message
          messages.push({
            role: 'user',
            content: forceMessage
          });

          log.warn('Loop prevention triggered', {
            tool: tc.function.name,
            repeats,
            args: JSON.stringify(args).slice(0, 100)
          });

          // Skip this tool call and force re-planning
          break;
        }

        const tool = getToolByName(tools, tc.function.name);

        // Check if we've failed this before (learning from past mistakes)
        const pastCheck = reflectionEngine.checkPastMistakes(tc.function.name, args!);
        if (pastCheck.shouldWarn) {
          callbacks?.onWarning?.(pastCheck.advice);
          // Inject warning into conversation so agent sees it
          messages.push({
            role: 'user',
            content: `[reflection] ${pastCheck.advice}`,
          });
        }

        callbacks?.onToolStart?.(tc.function.name, JSON.stringify(args).slice(0, 160));

        const result = tool
          ? await executeTool(tool, args!, ctx)
          : { output: `Unknown tool: ${tc.function.name}`, isError: true };

        // If tool failed, reflect on WHY and learn from it
        if (result.isError) {
          log.warn('Tool execution failed', {
            tool: tc.function.name,
            error: result.output.slice(0, 200),
          });

          // Get AI reflection on this failure
          const reflection = await reflectionEngine.reflectOnFailure(
            llm,
            stepsUsed,
            tc.function.name,
            args!,
            result.output,
            goal,
          );

          // Inject reflection into conversation
          callbacks?.onWarning?.(`Reflection: ${reflection}`);
          messages.push({
            role: 'user',
            content: `[reflection] ${reflection}\nNow try a different approach.`,
          });
        }

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
  reflectionEngine: ReflectionEngine,
): string {
  const mem = memoryToPrompt(memory);
  const modeNote =
    editMode === 'dry'
      ? '\n## Mode\nDRY RUN — preview diffs only; changes are NOT written to disk.'
      : '\n## Mode\nAPPLY — file edits are written to disk.';

  // Add recent learnings from failures
  const learnings = reflectionEngine.getRecentFailureSummary(5);

  return [
    SYSTEM_PROMPT,
    modeNote,
    mem && `\n## Memory\n${mem}`,
    learnings && `\n## Learnings from Past Failures\n${learnings}\n⚠️ Avoid repeating these mistakes!`,
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
