import type { LLMClient } from '../llm/client.js';
import type { ChatMessage } from '../llm/types.js';
import { log } from '../lib/logger.js';

export interface PlanStep {
  id: number;
  task: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
}

const FALLBACK_PLAN = (goal: string): PlanStep[] => [
  { id: 1, task: 'Analyze project structure', status: 'pending' },
  { id: 2, task: goal, status: 'pending' },
  { id: 3, task: 'Run tests and fix errors', status: 'pending' },
];

export async function createPlan(
  llm: LLMClient,
  goal: string,
  context: string,
  signal?: AbortSignal,
): Promise<PlanStep[]> {
  if (signal?.aborted) return FALLBACK_PLAN(goal);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `Break the user goal into 3-8 concrete sequential tasks.
Reply ONLY with a JSON array of strings. No markdown.
Example: ["Analyze project","Implement feature","Run tests"]`,
    },
    {
      role: 'user',
      content: `Goal: ${goal}\n\nContext:\n${context.slice(0, 6000)}`,
    },
  ];

  try {
    const res = await llm.chat(messages);
    const text = res.content ?? '[]';
    const match = text.match(/\[[\s\S]*?\]/);
    const tasks = JSON.parse(match?.[0] ?? '[]') as unknown;
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return FALLBACK_PLAN(goal);
    }
    const steps: PlanStep[] = tasks
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
      .slice(0, 8)
      .map((task, i) => ({
        id: i + 1,
        task,
        status: 'pending' as PlanStep['status'],
      }));
    if (steps.length > 0) {
      steps[0]!.status = 'in_progress';
      return steps;
    }
  } catch (e) {
    log.warn('Planning failed, using fallback', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  const fallback = FALLBACK_PLAN(goal);
  fallback[0].status = 'in_progress';
  return fallback;
}

export function formatPlan(steps: PlanStep[]): string {
  const icon = (s: PlanStep) => {
    if (s.status === 'done') return '✓';
    if (s.status === 'in_progress') return '→';
    if (s.status === 'failed') return '✗';
    return '○';
  };
  return steps.map((s) => `${icon(s)} ${s.id}. ${s.task}`).join('\n');
}

export function advancePlan(plan: PlanStep[], toolName: string, ok: boolean): void {
  const current = plan.find((s) => s.status === 'in_progress');
  if (!current) {
    const next = plan.find((s) => s.status === 'pending');
    if (next) next.status = 'in_progress';
    return;
  }
  if (!ok) {
    current.status = 'failed';
    return;
  }
  if (['Bash', 'Write', 'Edit'].includes(toolName)) {
    current.status = 'done';
    const next = plan.find((s) => s.status === 'pending');
    if (next) next.status = 'in_progress';
  }
}
