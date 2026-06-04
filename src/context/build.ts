import type { N0xConfig } from '../config/schema.js';
import { fileBudget, loadChunksForFiles } from './chunk.js';
import { gatherRelevantFiles } from './gather.js';
import {
  loadProjectContext,
  formatSymbolIndex,
  findSymbolsForGoal,
} from './symbols.js';
import { getGitChangedContext, getChangedFiles } from '../git/context.js';
import { sessionToPrompt, type SessionState } from './session.js';

export interface BuiltContext {
  symbols: string;
  files: string;
  git: string;
  session: string;
}

export async function buildAgentContext(
  cwd: string,
  goal: string,
  config: N0xConfig,
  session: SessionState | null,
): Promise<BuiltContext> {
  const budget = fileBudget(config.default_model);
  const symCtx = await loadProjectContext(cwd);

  const symbolText = symCtx ? formatSymbolIndex(symCtx, 80) : '(run n0x init to build symbol index)';
  const priorityFiles = new Set<string>();

  if (symCtx) {
    for (const f of findSymbolsForGoal(symCtx, goal)) priorityFiles.add(f);
  }

  if (config.git_context) {
    for (const f of await getChangedFiles(cwd)) priorityFiles.add(f);
  }

  const fileList = [...priorityFiles];
  let files: string;
  if (fileList.length > 0) {
    files = await loadChunksForFiles(cwd, fileList.slice(0, 10), budget);
  } else {
    files = await gatherRelevantFiles(cwd, goal, 6, budget);
  }

  const git = config.git_context ? await getGitChangedContext(cwd, 4000) : '';
  const sessionText = sessionToPrompt(session);

  return {
    symbols: symbolText,
    files,
    git,
    session: sessionText,
  };
}
