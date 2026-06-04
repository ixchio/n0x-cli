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

  async chat(
    messages: ChatMessage[],
    tools?: ToolDef[],
    onToken?: (token: string) => void,
  ): Promise<LLMResponse> {
    return withRetry(() => this.chatOnce(messages, tools, onToken), {
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

  private async chatOnce(
    messages: ChatMessage[],
    tools?: ToolDef[],
    onToken?: (token: string) => void,
  ): Promise<LLMResponse> {
    const useStream = Boolean(onToken && this.config.stream_output);
    const body: Record<string, unknown> = {
      model: this.config.default_model,
      messages: serializeMessages(messages),
      temperature: 0.5,
      top_p: 0.9,
      stream: useStream,
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
          'Start Bonsai: llama-server -hf prism-ml/Bonsai-4B-gguf:Q4_K_M',
        );
      }

      if (useStream && res.body) {
        return await this.parseStreamResponse(res.body, onToken!);
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
        `Cannot reach Bonsai at ${this.config.base_url}`,
        `Run: llama-server -hf prism-ml/Bonsai-4B-gguf:Bonsai-4B.gguf\n(${e instanceof Error ? e.message : String(e)})`,
      );
    } finally {
      clearTimeout(timeout);
      this.signal?.removeEventListener('abort', onAbort);
    }
  }

  private async parseStreamResponse(
    body: ReadableStream<Uint8Array>,
    onToken: (token: string) => void,
  ): Promise<LLMResponse> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    const toolCalls: LLMResponse['tool_calls'] = [];
    let finish_reason = 'stop';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index?: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
              finish_reason?: string | null;
            }>;
          };
          const choice = parsed.choices?.[0];
          if (choice?.finish_reason) finish_reason = choice.finish_reason;
          const delta = choice?.delta;
          if (delta?.content) {
            content += delta.content;
            onToken(delta.content);
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: tc.id ?? `call_${idx}`,
                  type: 'function',
                  function: { name: '', arguments: '' },
                };
              }
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) {
                toolCalls[idx].function.arguments += tc.function.arguments;
              }
            }
          }
        } catch {
          /* skip */
        }
      }
    }

    return {
      content: content || null,
      tool_calls: toolCalls.filter(Boolean),
      finish_reason,
    };
  }

  static isBonsaiModel(model: string): boolean {
    const lower = model.toLowerCase();
    return (
      BONSAI_MODELS.some((m) => m.toLowerCase() === lower) ||
      lower.includes('bonsai')
    );
  }
}
