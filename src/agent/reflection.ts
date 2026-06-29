/**
 * Reflection Engine - Learns from failures and prevents repeated mistakes
 *
 * This system:
 * 1. Records every failed tool call with context
 * 2. Analyzes WHY the failure happened
 * 3. Suggests alternative approaches
 * 4. Warns before repeating past mistakes
 */

import { appendFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { LLMClient } from '../llm/client.js';
import { log } from '../lib/logger.js';
import { safeJsonParse } from '../lib/security.js';

export interface ReflectionEntry {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  error: string;
  context: string; // What the agent was trying to do
  reflection: string; // AI analysis of why it failed
  timestamp: string;
}

export class ReflectionEngine {
  private history: ReflectionEntry[] = [];
  private reflectionFile: string;

  constructor(cwd: string) {
    this.reflectionFile = join(cwd, '.n0x', 'reflections.jsonl');
  }

  async init(): Promise<void> {
    // Load past reflections for cross-session learning
    if (existsSync(this.reflectionFile)) {
      try {
        const content = await readFile(this.reflectionFile, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        // SAFE: Using safeJsonParse to prevent prototype pollution
        this.history = lines
          .map(line => safeJsonParse<ReflectionEntry>(line, 'reflection entry'))
          .filter((entry): entry is ReflectionEntry => entry !== null);
        log.info('Loaded reflection history', { count: this.history.length });
      } catch (err) {
        log.warn('Failed to load reflections', { error: String(err) });
      }
    }
  }

  /**
   * After a tool call fails, ask the LLM to reflect on WHY and what to try instead
   */
  async reflectOnFailure(
    llm: LLMClient,
    step: number,
    tool: string,
    args: Record<string, unknown>,
    error: string,
    goalContext: string,
  ): Promise<string> {
    const prompt = `You are analyzing a failed action.

Tool: ${tool}
Arguments: ${JSON.stringify(args, null, 2)}
Error: ${error}

Context: ${goalContext}

Analyze:
1. Why did this specific action fail?
2. What was wrong with the approach?
3. What should be tried instead?

Reply with a concise 2-3 sentence reflection.`;

    try {
      const response = await llm.chat([
        {
          role: 'system',
          content: 'You are a debugging expert. Analyze failures and suggest concrete alternatives.',
        },
        { role: 'user', content: prompt },
      ]);

      const reflection = response.content ?? 'Try a different approach';

      // Record this reflection
      const entry: ReflectionEntry = {
        step,
        tool,
        args,
        error,
        context: goalContext,
        reflection,
        timestamp: new Date().toISOString(),
      };

      this.history.push(entry);
      await this.persistReflection(entry);

      log.info('Reflection recorded', { tool, error: error.slice(0, 100) });

      return reflection;
    } catch (err) {
      log.warn('Reflection failed', { error: String(err) });
      return 'Consider trying a different tool or approach';
    }
  }

  /**
   * Before executing a tool, check if we've failed this exact call before
   * Returns warning if this is a repeated mistake
   */
  checkPastMistakes(
    tool: string,
    args: Record<string, unknown>,
  ): { shouldWarn: boolean; advice: string } {
    const sig = this.makeSignature(tool, args);

    // Look for past failures with same tool + args
    const pastFailures = this.history.filter(
      (e) => this.makeSignature(e.tool, e.args) === sig
    );

    if (pastFailures.length > 0) {
      const latest = pastFailures[pastFailures.length - 1]!;
      return {
        shouldWarn: true,
        advice: `⚠️ You tried ${tool} with these args before and it failed.
Past error: ${latest.error.slice(0, 100)}
Reflection: ${latest.reflection}

Consider a different approach!`,
      };
    }

    // Also check for same tool with slightly different args (fuzzy match)
    const sameTool = this.history.filter(
      (e) => e.tool === tool && this.argsSimilar(e.args, args)
    );

    if (sameTool.length >= 2) {
      const latest = sameTool[sameTool.length - 1]!;
      return {
        shouldWarn: true,
        advice: `💡 You've tried ${tool} ${sameTool.length} times recently with similar arguments.
Latest reflection: ${latest.reflection}`,
      };
    }

    return { shouldWarn: false, advice: '' };
  }

  /**
   * Get summary of recent failures (for prompt context)
   */
  getRecentFailureSummary(limit: number = 5): string {
    if (this.history.length === 0) return '';

    const recent = this.history.slice(-limit);
    const summary = recent
      .map((e) => `• ${e.tool} failed: ${e.reflection}`)
      .join('\n');

    return `\nRecent learnings:\n${summary}`;
  }

  /**
   * Get stats for debugging
   */
  getStats(): {
    totalFailures: number;
    mostFailedTool: string;
    successRate: number;
  } {
    const toolCounts = new Map<string, number>();
    for (const entry of this.history) {
      toolCounts.set(entry.tool, (toolCounts.get(entry.tool) ?? 0) + 1);
    }

    const mostFailed = Array.from(toolCounts.entries()).reduce(
      (max, [tool, count]) => (count > max.count ? { tool, count } : max),
      { tool: 'none', count: 0 }
    );

    return {
      totalFailures: this.history.length,
      mostFailedTool: mostFailed.tool,
      successRate: 0, // Would need success data too
    };
  }

  private async persistReflection(entry: ReflectionEntry): Promise<void> {
    try {
      const dir = join(this.reflectionFile, '..');
      await mkdir(dir, { recursive: true });
      await appendFile(this.reflectionFile, JSON.stringify(entry) + '\n');
    } catch (err) {
      log.warn('Failed to persist reflection', { error: String(err) });
    }
  }

  private makeSignature(tool: string, args: Record<string, unknown>): string {
    // Create stable signature for tool + args
    const sortedArgs = JSON.stringify(args, Object.keys(args).sort());
    return `${tool}|${sortedArgs}`;
  }

  private argsSimilar(
    args1: Record<string, unknown>,
    args2: Record<string, unknown>
  ): boolean {
    // Check if arguments are "similar" (e.g., reading same file)
    const keys1 = Object.keys(args1).sort();
    const keys2 = Object.keys(args2).sort();

    if (keys1.join(',') !== keys2.join(',')) return false;

    // Check if key values are similar
    for (const key of keys1) {
      const val1 = String(args1[key]);
      const val2 = String(args2[key]);

      // Exact match or close enough (e.g., file.ts vs file.tsx)
      if (val1 !== val2 && !val1.includes(val2) && !val2.includes(val1)) {
        return false;
      }
    }

    return true;
  }
}
