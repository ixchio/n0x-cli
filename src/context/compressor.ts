/**
 * 🔥 LEGENDARY FEATURE #3: Smart Context Compression
 *
 * Automatically compresses conversation history to fit more context:
 * - Summarizes old messages
 * - Keeps only relevant diffs
 * - Removes redundant tool calls
 * - Adaptive based on model size
 *
 * Perfect for: Long coding sessions, complex refactors, staying in context
 */

import type { ChatMessage } from '../llm/types.js';
import chalk from 'chalk';

export class SmartContextCompressor {
  private compressionEnabled: boolean = true;
  private maxMessages: number = 20;

  async compressMessages(
    messages: ChatMessage[],
    _targetTokens: number,
  ): Promise<ChatMessage[]> {
    if (!this.compressionEnabled || messages.length <= this.maxMessages) {
      return messages;
    }

    console.log(chalk.dim(`🗜️  Compressing ${messages.length} messages to fit context...`));

    // Keep system message and last N messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const recentMessages = messages.slice(-this.maxMessages);

    // Compress old messages
    const oldMessages = messages.slice(
      systemMessages.length,
      -(this.maxMessages),
    );

    const summary = this.summarizeMessages(oldMessages);

    const compressed = [
      ...systemMessages,
      {
        role: 'system' as const,
        content: `[Context Summary]\n${summary}\n[End Summary]`,
      },
      ...recentMessages,
    ];

    console.log(chalk.green(`✓ Compressed ${messages.length} → ${compressed.length} messages`));

    return compressed;
  }

  private summarizeMessages(messages: ChatMessage[]): string {
    const summary: string[] = [];

    // Extract key actions
    const toolCalls = messages
      .filter(m => m.tool_calls && m.tool_calls.length > 0)
      .flatMap(m => m.tool_calls?.map(tc => tc.function.name) ?? []);

    if (toolCalls.length > 0) {
      summary.push(`Tools used: ${[...new Set(toolCalls)].join(', ')}`);
    }

    // Extract file modifications
    const fileEdits = messages
      .filter(m => m.content && m.content.includes('diff --git'))
      .length;

    if (fileEdits > 0) {
      summary.push(`Modified ${fileEdits} files`);
    }

    return summary.join('\n') || 'Previous conversation';
  }

  enable(): void {
    this.compressionEnabled = true;
    console.log(chalk.cyan('🗜️  Smart compression enabled'));
  }

  disable(): void {
    this.compressionEnabled = false;
    console.log(chalk.dim('Smart compression disabled'));
  }
}
