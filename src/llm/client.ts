import type { N0xConfig } from '../config/schema.js';
import { BONSAI_MODELS } from '../constants.js';
import { N0xError } from '../lib/errors.js';
import { withRetry } from '../lib/retry.js';
import { redactSecrets } from '../lib/output.js';
import { log } from '../lib/logger.js';
import type { ChatMessage, LLMResponse, ToolDef } from './types.js';
import { serializeMessages } from './types.js';

export type { ChatMessage, ToolDef, LLMResponse } from './types.js';

export class LLMClient {
  constructor(
    private config: N0xConfig,
    private signal?: AbortSignal,
  ) {}

  async chat(messages: ChatMessage[], tools?: ToolDef[]): Promise<LLMResponse> {
    return withRetry(() => this.chatOnce(messages, tools), {
      maxAttempts: 3,
      shouldRetry: (e) => {
        if (this.signal?.aborted) return false;
        if (e instanceof N0xError && e.code === 'LLM_REQUEST_FAILED') {
          return (e.message.includes('502') || e.message.includes('503'));
        }
        return e instanceof Error && /fetch|timeout|econnrefused/i.test(e.message);
      },
    });
  }

  private async chatOnce(messages: ChatMessage[], tools?: ToolDef[]): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.config.default_model,
      messages: serializeMessages(messages),
      temperature: 0.5,
      top_p: 0.9,
    };
    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.llm_timeout_ms);
    const onAbort = () => controller.abort();
    this.signal?.addEventListener('abort', onAbort);

    try {
      const res = await fetch(`${this.config.base_url}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.api_key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = redactSecrets(await res.text());
        throw new N0xError(
          'LLM_REQUEST_FAILED',
          `LLM request failed (${res.status}): ${text.slice(0, 500)}`,
          'Start Bonsai: llama-server -hf prism-ml/Bonsai-4B-gguf:Q1_0',
        );
      }

      const data = (await res.json()) as {
        choices?: Array<{
          message: {
            content: string | null;
            tool_calls?: LLMResponse['tool_calls'];
          };
          finish_reason: string;
        }>;
      };

      const choice = data.choices?.[0];
      if (!choice) {
        throw new N0xError('LLM_REQUEST_FAILED', 'Empty response from LLM');
      }

      log.debug('LLM response', {
        finish: choice.finish_reason,
        tools: choice.message.tool_calls?.length ?? 0,
      });

      return {
        content: choice.message.content,
        tool_calls: choice.message.tool_calls ?? [],
        finish_reason: choice.finish_reason,
      };
    } catch (e) {
      if (e instanceof N0xError) throw e;
      if (controller.signal.aborted) {
        throw new N0xError(
          'LLM_REQUEST_FAILED',
          this.signal?.aborted ? 'Request cancelled' : 'LLM request timed out',
        );
      }
      throw new N0xError(
        'LLM_UNAVAILABLE',
        e instanceof Error ? e.message : String(e),
        `Cannot reach ${this.config.base_url}`,
      );
    } finally {
      clearTimeout(timeout);
      this.signal?.removeEventListener('abort', onAbort);
    }
  }

  static isBonsaiModel(model: string): boolean {
    const lower = model.toLowerCase();
    return (
      BONSAI_MODELS.some((m) => m.toLowerCase() === lower) ||
      lower.includes('bonsai')
    );
  }
}
