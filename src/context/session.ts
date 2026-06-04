import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { getN0xHome } from '../config.js';
import type { ChatMessage } from '../llm/types.js';
import { truncate } from '../lib/output.js';

export interface SessionState {
  id: string;
  cwd: string;
  summary: string;
  turnCount: number;
  recentMessages: ChatMessage[];
  updatedAt: string;
}

const MAX_RECENT = 8;

function sessionPath(cwd: string): string {
  const slug = Buffer.from(cwd).toString('base64url').slice(0, 32);
  return join(getN0xHome(), 'sessions', `${slug}.json`);
}

export async function loadSession(cwd: string): Promise<SessionState | null> {
  const path = sessionPath(cwd);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as SessionState;
  } catch {
    return null;
  }
}

export async function saveSession(state: SessionState): Promise<void> {
  const dir = join(getN0xHome(), 'sessions');
  await mkdir(dir, { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeFile(sessionPath(state.cwd), JSON.stringify(state, null, 2), 'utf8');
}

export function appendToSession(
  state: SessionState | null,
  cwd: string,
  messages: ChatMessage[],
): SessionState {
  const base: SessionState = state ?? {
    id: cwd,
    cwd,
    summary: '',
    turnCount: 0,
    recentMessages: [],
    updatedAt: new Date().toISOString(),
  };
  base.turnCount += 1;
  base.recentMessages = [...base.recentMessages, ...messages].slice(-MAX_RECENT);
  return base;
}

export function sessionToPrompt(state: SessionState | null): string {
  if (!state) return '';
  const parts: string[] = [];
  if (state.summary) parts.push(`Session summary: ${state.summary}`);
  if (state.recentMessages.length) {
    const recent = state.recentMessages
      .map((m) => `[${m.role}] ${truncate(m.content ?? '', 200)}`)
      .join('\n');
    parts.push(`Recent turns:\n${recent}`);
  }
  return parts.join('\n\n');
}

export async function updateSessionSummary(
  state: SessionState,
  newSummary: string,
): Promise<SessionState> {
  state.summary = truncate(newSummary, 1500);
  await saveSession(state);
  return state;
}
