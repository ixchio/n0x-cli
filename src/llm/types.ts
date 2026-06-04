export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCallRef {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: Role;
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCallRef[];
}

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMResponse {
  content: string | null;
  tool_calls: ToolCallRef[];
  finish_reason: string;
}

export function serializeMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    const out: Record<string, unknown> = {
      role: m.role,
      content: m.content,
    };
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    if (m.name) out.name = m.name;
    if (m.tool_calls?.length) out.tool_calls = m.tool_calls;
    return out;
  });
}
