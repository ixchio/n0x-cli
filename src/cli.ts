import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  loadConfig,
  writeDefaultConfig,
  configPath,
  getN0xHome,
  mcpConfigPath,
  hasConfig,
  usesManagedLlamaServer,
} from './config.js';
import { BonsaiManager } from './setup/manager.js';
import { firstRunSetup, interactiveModelSetup } from './setup/first-run.js';
import { showDoctorResults, showError } from './setup/ui.js';
import { runAgent } from './agent/loop.js';
import { ReflectionEngine } from './agent/reflection.js';
import { LLMClient } from './llm/client.js';
import { analyzeRepository, formatRepoMap } from './repo/analyze.js';
import { loadMemory, saveMemory } from './agent/memory.js';
import { memorySchema } from './config/schema.js';
import { PRODUCT_NAME } from './constants.js';
import { isDockerAvailable } from './sandbox/docker.js';
import { formatError, isN0xError } from './lib/errors.js';
import { setLogLevel } from './lib/logger.js';
import {
  buildSymbolIndex,
  saveProjectContext,
  loadProjectContext,
  formatSymbolIndex,
} from './context/symbols.js';
import type { EditMode } from './tools/types.js';
import { createTerminalMarkdownStream, TerminalMarkdownStream } from 'markstream-cli';
import { autoDetectBackend } from './llm/detect.js';
import type { N0xConfig } from './config/schema.js';
import {
  createCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
  type CheckpointManifest,
} from './lib/checkpoint.js';
import { RunStatusLine } from './lib/run-status.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version?: string };
const VERSION = packageJson.version ?? '0.0.0';

type CliAbortController = AbortController & { dispose: () => void };

function createAbortController(): CliAbortController {
  const ac = new AbortController();
  const onSigint = () => {
    process.stderr.write(chalk.yellow('\n\nInterrupted. Finishing current step...\n'));
    ac.abort();
  };
  process.on('SIGINT', onSigint);
  return Object.assign(ac, {
    dispose: () => process.off('SIGINT', onSigint),
  });
}

async function assertWorkspace(cwd: string): Promise<void> {
  await access(cwd);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function getConfiguredPort(baseUrl: string, fallback: number): number {
  try {
    const url = new URL(baseUrl);
    return url.port ? Number(url.port) : fallback;
  } catch {
    return fallback;
  }
}

async function isOpenAiBackendRunning(config: N0xConfig): Promise<boolean> {
  return (await fetchOpenAiModels(config)).ok;
}

async function fetchOpenAiModels(config: N0xConfig): Promise<{
  ok: boolean;
  models: string[];
  error?: string;
}> {
  try {
    const res = await fetch(`${config.base_url}/models`, {
      signal: AbortSignal.timeout(2000),
      headers: { Authorization: `Bearer ${config.api_key}` },
    });
    if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}` };

    const data = (await res.json()) as { data?: Array<{ id: string }> };
    return { ok: true, models: data.data?.map((m) => m.id).filter(Boolean) ?? [] };
  } catch {
    return { ok: false, models: [] };
  }
}

function backendForUseInput(input: string, url: string): N0xConfig['backend'] {
  const normalized = input.toLowerCase();
  if (normalized === 'ollama') return 'ollama';
  if (normalized === 'llama-server' || normalized === 'llama') return 'llama-cpp';

  try {
    const parsed = new URL(url);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (isLocalhost && parsed.port === '11434') return 'ollama';
    if (isLocalhost && parsed.port === '8080') return 'llama-cpp';
  } catch {
    // Leave validation to the config schema on the next load.
  }

  return 'openai-compatible';
}

function upsertTomlString(raw: string, key: string, value: string): string {
  const line = `${key} = ${JSON.stringify(value)}`;
  const assignmentPattern = new RegExp(`^\\s*${key}\\s*=\\s*.*(?:\\r?\\n)?`, 'gm');
  const withoutExistingAssignments = raw.replace(assignmentPattern, '');
  const trimmed = withoutExistingAssignments.replace(/\s*$/, '');
  return `${trimmed}${trimmed ? '\n' : ''}${line}\n`;
}

async function writeBackendConfig(url: string, backend: N0xConfig['backend']): Promise<void> {
  await writeDefaultConfig();
  let raw = await readFile(configPath(), 'utf8').catch(() => '');
  raw = upsertTomlString(raw, 'base_url', url);
  raw = upsertTomlString(raw, 'backend', backend);
  await writeFile(configPath(), raw, 'utf8');
}

async function ensureBackendReady(config: N0xConfig): Promise<void> {
  const manager = new BonsaiManager(getN0xHome());
  await manager.init();

  if (usesManagedLlamaServer(config)) {
    await ensureServerRunning(manager, config);
    return;
  }

  if (await isOpenAiBackendRunning(config)) return;

  const suggestions = config.backend === 'ollama'
    ? [
        'Start Ollama: ollama serve',
        `Pull/run the model: ollama run ${config.default_model}`,
        'Or switch back: n0x use llama-server',
      ]
    : [
        'Check base_url in ~/.n0x/config.toml',
        'Check api_key if this endpoint requires one',
        'Run: n0x doctor',
      ];

  showError(
    'Backend unavailable',
    `Cannot reach ${config.backend} backend at ${config.base_url}.`,
    suggestions,
  );
  process.exit(1);
}

async function applyModelOverride(config: N0xConfig, model: string): Promise<void> {
  config.default_model = model;
  if (!LLMClient.isBonsaiModel(model) && usesManagedLlamaServer(config)) {
    const detected = await autoDetectBackend(config.base_url);
    if (detected?.type === 'ollama') {
      config.base_url = detected.url;
    } else {
      config.base_url = 'http://localhost:11434/v1';
    }
    config.backend = 'ollama';
  }
}

function printChatHelp(): void {
  console.log(chalk.bold('\nCommands'));
  console.log(chalk.dim('  /help           Show commands'));
  console.log(chalk.dim('  /status         Show model, backend, cwd, and mode'));
  console.log(chalk.dim('  /model <name>   Switch model for this chat session'));
  console.log(chalk.dim('  /memory         Show project memory'));
  console.log(chalk.dim('  /checkpoint     Create a restore point'));
  console.log(chalk.dim('  /checkpoints    List restore points'));
  console.log(chalk.dim('  /restore <id>   Restore a checkpoint'));
  console.log(chalk.dim('  /clear          Clear the terminal'));
  console.log(chalk.dim('  /exit           Quit chat\n'));
}

function printChatStatus(config: N0xConfig, cwd: string, dry?: boolean): void {
  console.log(chalk.bold('\nStatus'));
  console.log(chalk.dim(`  Model:   ${config.default_model}`));
  console.log(chalk.dim(`  Backend: ${config.backend} at ${config.base_url}`));
  console.log(chalk.dim(`  Mode:    ${dry ? 'DRY' : 'APPLY'}`));
  console.log(chalk.dim(`  Stream:  ${config.stream_output ? 'ON' : 'OFF'}`));
  console.log(chalk.dim(`  CWD:     ${cwd}\n`));
}

async function handleChatCommand(
  line: string,
  config: N0xConfig,
  cwd: string,
  dry?: boolean,
): Promise<boolean> {
  const [command, ...args] = line.slice(1).trim().split(/\s+/);
  switch (command) {
    case 'help':
    case '?':
      printChatHelp();
      return true;
    case 'status':
      printChatStatus(config, cwd, dry);
      return true;
    case 'model': {
      const model = args.join(' ').trim();
      if (!model) {
        console.log(chalk.yellow('Usage: /model <name>'));
        return true;
      }
      await applyModelOverride(config, model);
      await ensureBackendReady(config);
      console.log(chalk.green(`Model switched to ${config.default_model}`));
      console.log(chalk.dim(`Backend: ${config.backend} at ${config.base_url}\n`));
      return true;
    }
    case 'memory':
      console.log(JSON.stringify(await loadMemory(), null, 2));
      return true;
    case 'clear':
      console.clear();
      return true;
    case 'checkpoint': {
      const reason = args.join(' ').trim() || 'manual chat checkpoint';
      const checkpoint = await createCheckpoint(cwd, reason);
      console.log(chalk.green(`Checkpoint created: ${checkpoint.id}`));
      console.log(chalk.dim(`Files: ${checkpoint.files.length}, skipped: ${checkpoint.skipped.length}\n`));
      return true;
    }
    case 'checkpoints':
      printCheckpointList(await listCheckpoints(cwd));
      return true;
    case 'restore': {
      const id = args[0] ?? 'latest';
      if (!(await confirmRestore(id))) return true;
      const result = await restoreCheckpoint(cwd, id);
      console.log(chalk.green(`Restored checkpoint ${result.id}`));
      console.log(chalk.dim(`Restored: ${result.restored}, removed: ${result.removed}, skipped: ${result.skipped}\n`));
      return true;
    }
    case 'exit':
    case 'quit':
    case 'q':
      return false;
    default:
      console.log(chalk.yellow(`Unknown command: /${command}`));
      console.log(chalk.dim('Run /help for available commands.\n'));
      return true;
  }
}

async function confirmRestore(id: string): Promise<boolean> {
  const { confirmAction } = await import('./lib/prompt.js');
  console.log(chalk.yellow(`Restore checkpoint ${id}? Current workspace changes may be overwritten.`));
  return confirmAction('Continue?');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function printCheckpointList(checkpoints: CheckpointManifest[]): void {
  if (checkpoints.length === 0) {
    console.log(chalk.yellow('No checkpoints found.'));
    return;
  }

  console.log(chalk.bold('\nCheckpoints'));
  for (const checkpoint of checkpoints.slice(0, 20)) {
    console.log(chalk.cyan(`  ${checkpoint.id}`));
    console.log(chalk.dim(`    ${checkpoint.createdAt}  ${checkpoint.files.length} files  ${formatBytes(checkpoint.totalBytes)}`));
    console.log(chalk.dim(`    ${checkpoint.reason}`));
  }
  console.log();
}

async function createRunCheckpoint(
  cwd: string,
  goal: string,
  editMode: EditMode,
): Promise<CheckpointManifest | undefined> {
  if (editMode === 'dry') return undefined;
  console.log(chalk.dim('Creating checkpoint...'));
  const checkpoint = await createCheckpoint(cwd, `before run: ${goal.slice(0, 120)}`);
  console.log(chalk.dim(`Checkpoint: ${checkpoint.id} (${checkpoint.files.length} files, ${formatBytes(checkpoint.totalBytes)})`));
  if (checkpoint.skipped.length > 0) {
    console.log(chalk.yellow(`Skipped ${checkpoint.skipped.length} large files. They will not be restored from this checkpoint.`));
  }
  console.log();
  return checkpoint;
}

async function runAgentCommand(opts: {
  goal: string;
  cwd: string;
  maxSteps?: number;
  model?: string;
  dry?: boolean;
  apply?: boolean;
  interactive?: boolean;
  stream?: boolean;
  lowMemory?: boolean;
}): Promise<void> {
  const config = await loadConfig();

  // Allow --model flag to switch model on the fly.
  if (opts.model) {
    await applyModelOverride(config, opts.model);
  }

  const cwd = resolve(opts.cwd);
  await assertWorkspace(cwd);
  if (opts.maxSteps) config.max_steps = opts.maxSteps;
  if (opts.stream === false) config.stream_output = false;
  if (opts.lowMemory) {
    config.stream_output = false;
    config.max_steps = Math.min(config.max_steps, 10);
    config.tavily_enabled = false;
    console.log(chalk.yellow('Low memory mode enabled'));
    console.log(chalk.dim('  - Streaming: OFF'));
    console.log(chalk.dim(`  - Max steps: ${config.max_steps}`));
    console.log(chalk.dim('  - Web search: OFF\n'));
  }

  let editMode: EditMode = 'apply';
  if (opts.dry) editMode = 'dry';
  else if (opts.interactive) editMode = 'interactive';
  else if (opts.apply) editMode = 'apply';

  await ensureBackendReady(config);
  const checkpoint = await createRunCheckpoint(cwd, opts.goal, editMode);
  await printBanner(config, cwd, opts.goal, editMode, checkpoint?.id);
  await checkSandbox(config);
  const ui = createCliRunUi(config, cwd, editMode, checkpoint?.id, config.stream_output);

  const ac = createAbortController();
  let result: Awaited<ReturnType<typeof runAgent>>;
  try {
    result = await runAgent({
      goal: opts.goal.trim(),
      cwd,
      config,
      signal: ac.signal,
      editMode,
      stream: config.stream_output,
      callbacks: ui.callbacks,
    });
  } finally {
    ui.stop();
    ac.dispose();
  }

  printResult(result);
  process.exit(result.completed ? 0 : 1);
}

export function createCli(): Command {
  const program = new Command();

  program
    .name('n0x')
    .description(`${PRODUCT_NAME} — local-first coding agent (Ollama + Bonsai)`)
    .version(VERSION)
    .option('-v, --verbose', 'Debug logging')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts() as { verbose?: boolean };
      if (opts.verbose) setLogLevel('debug');
    });

  program
    .command('run')
    .description('Run the agent on a goal (ReAct loop)')
    .argument('[goal]', 'What to build or fix')
    .option('-p, --prompt <text>', 'Goal prompt')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .option('-m, --model <name>', 'Override model (e.g. qwen2.5-coder:7b)')
    .option('--max-steps <n>', 'Max iterations (default 20)', (v) => parseInt(v, 10))
    .option('--dry', 'Preview diffs only — do not write files')
    .option('--apply', 'Write changes to disk (default)')
    .option('-i, --interactive', 'Confirm file mutations interactively')
    .option('--no-stream', 'Disable streaming tokens')
    .option('--low-memory', 'Optimize for systems with <6GB RAM')
    .action(async (goal: string | undefined, opts: {
      prompt?: string;
      cwd: string;
      model?: string;
      maxSteps?: number;
      dry?: boolean;
      apply?: boolean;
      interactive?: boolean;
      stream?: boolean;
      lowMemory?: boolean;
    }) => {
      const userGoal = opts.prompt ?? goal;
      if (!userGoal?.trim()) throw new Error('Provide a goal: n0x run "fix the login bug"');

      // Check if first run
      if (!(await hasConfig())) {
        console.log(chalk.yellow('🌿 First run detected. Running setup...\n'));
        await firstRunSetup();
      }

      await runAgentCommand({
        goal: userGoal,
        cwd: opts.cwd,
        model: opts.model,
        maxSteps: opts.maxSteps,
        dry: opts.dry,
        apply: opts.apply,
        interactive: opts.interactive,
        stream: opts.stream === false ? false : undefined,
        lowMemory: opts.lowMemory,
      });
    });

  program
    .command('explain')
    .description('Explain what a file does')
    .argument('<file>', 'File path')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .option('--no-stream', 'Disable streaming')
    .action(async (file: string, opts: { cwd: string; stream?: boolean }) => {
      const content = await readFile(resolve(opts.cwd, file), 'utf8').catch(() => null);
      if (!content) throw new Error(`Cannot read file: ${file}`);
      const config = await loadConfig();
      await ensureBackendReady(config);
      const llm = new LLMClient(config);
      const messages = [
        { role: 'system' as const, content: 'You are an expert programmer. Explain what the provided file does concisely and structurally. Do not output code unless necessary.' },
        { role: 'user' as const, content: `File: ${file}\n\n${content.slice(0, 8000)}` },
      ];
      
      console.log(chalk.bold.green(`\n🌿 ${PRODUCT_NAME} explain: ${file}\n`));
      const onToken = opts.stream === false ? undefined : (t: string) => process.stdout.write(chalk.cyan(t));
      const res = await llm.chat(messages, undefined, onToken);
      
      if (opts.stream === false && res.content) {
        console.log(chalk.cyan(res.content));
      }
      console.log();
    });

  program
    .command('commit')
    .description('Generate a conventional commit message from staged changes')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .action(async (opts: { cwd: string }) => {
      const { execFileSync } = await import('node:child_process');
      const cwd = resolve(opts.cwd);
      let diff = '';
      try {
        // SAFE: Using array args prevents command injection
        diff = execFileSync('git', ['diff', '--staged'], { cwd, encoding: 'utf8' }).trim();
      } catch {
        console.log(chalk.red('Not a git repository or git error.'));
        return;
      }

      if (!diff) {
        console.log(chalk.yellow('Nothing staged. Run git add first.'));
        return;
      }

      const config = await loadConfig();
      await ensureBackendReady(config);
      const llm = new LLMClient(config);
      const messages = [
        { role: 'system' as const, content: 'Write a conventional commit message for this diff. Output ONLY the message, one line, no backticks, no markdown.' },
        { role: 'user' as const, content: `Diff:\n\n${diff.slice(0, 15000)}` },
      ];

      console.log(chalk.dim('Generating commit message...'));
      const res = await llm.chat(messages);
      const msg = res.content?.trim().replace(/^[`"']|[`"']$/g, '') ?? '';

      if (!msg) {
        console.log(chalk.red('Failed to generate commit message.'));
        return;
      }

      const { confirmAction } = await import('./lib/prompt.js');
      console.log(`\nProposed commit message:\n${chalk.green.bold(msg)}\n`);
      const confirm = await confirmAction('Apply this commit?');
      if (confirm) {
        // SAFE: Using array args prevents command injection
        execFileSync('git', ['commit', '-m', msg], { cwd, stdio: 'inherit' });
      }
    });

  program
    .command('fix')
    .description('Fix an error from a stack trace or message')
    .argument('<error>', 'Error text or path to log file')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .option('--dry', 'Preview fixes only')
    .option('--apply', 'Apply fixes')
    .action(async (errorArg: string, opts: { cwd: string; dry?: boolean; apply?: boolean }) => {
      let errorText = errorArg;
      try {
        const maybeFile = await readFile(resolve(opts.cwd, errorArg), 'utf8');
        errorText = maybeFile;
      } catch {
        /* use arg as literal error */
      }
      await runAgentCommand({
        goal: `Fix this error in the codebase. Read relevant files, patch, run tests.\n\nError:\n${errorText.slice(0, 6000)}`,
        cwd: opts.cwd,
        dry: opts.dry,
        apply: opts.apply ?? !opts.dry,
      });
    });

  program
    .command('chat')
    .description('Interactive REPL')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .option('--dry', 'Preview edits only')
    .action(async (opts: { cwd: string; dry?: boolean }) => {
      const config = await loadConfig();
      const cwd = resolve(opts.cwd);
      await assertWorkspace(cwd);
      await ensureBackendReady(config);

      const { createInterface } = await import('node:readline');
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      console.log(chalk.bold.green(`\n🌿 ${PRODUCT_NAME} interactive`));
      console.log(chalk.dim(`Model: ${config.default_model} | Backend: ${config.backend} | ${opts.dry ? 'DRY' : 'APPLY'}`));
      console.log(chalk.dim('Run /help for commands, /exit to quit.\n'));

      const prompt = (): void => {
        rl.question(chalk.cyan('n0x> '), async (line) => {
          const trimmed = line.trim();
          if (!trimmed) {
            prompt();
            return;
          }
          if (trimmed === 'exit' || trimmed === 'quit') {
            rl.close();
            return;
          }
          if (trimmed.startsWith('/')) {
            if (await handleChatCommand(trimmed, config, cwd, opts.dry)) {
              prompt();
            } else {
              rl.close();
            }
            return;
          }
          const ac = createAbortController();
          const editMode: EditMode = opts.dry ? 'dry' : 'apply';
          const checkpoint = await createRunCheckpoint(cwd, trimmed, editMode);
          const ui = createCliRunUi(config, cwd, editMode, checkpoint?.id, config.stream_output);
          try {
            const result = await runAgent({
              goal: trimmed,
              cwd,
              config,
              signal: ac.signal,
              editMode,
              callbacks: ui.callbacks,
            });
            printResult(result);
            console.log();
          } finally {
            ui.stop();
            ac.dispose();
          }
          prompt();
        });
      };
      prompt();
    });

  program
    .command('init')
    .description('Create config, scan repo, build symbol index → .n0x/context.json')
    .option('-C, --cwd <dir>', 'Project directory', process.cwd())
    .action(async (opts: { cwd: string }) => {
      const cwd = resolve(opts.cwd);
      await writeDefaultConfig();
      const { writeFile, mkdir } = await import('node:fs/promises');
      const { existsSync } = await import('node:fs');
      await mkdir(getN0xHome(), { recursive: true });

      const mcpPath = mcpConfigPath();
      if (!existsSync(mcpPath)) {
        await writeFile(
          mcpPath,
          JSON.stringify(
            {
              mcpServers: {
                filesystem: {
                  command: 'npx',
                  args: ['-y', '@modelcontextprotocol/server-filesystem', cwd],
                },
              },
            },
            null,
            2,
          ),
          'utf8',
        );
      }

      const n0xignorePath = resolve(cwd, '.n0xignore');
      if (!existsSync(n0xignorePath)) {
        await writeFile(
          n0xignorePath,
          '# Files never sent to the model\nnode_modules/\ndist/\n.git/\n*.min.js\n',
          'utf8',
        );
      }

      console.log(chalk.dim('Scanning repository for symbols...'));
      const ctx = await buildSymbolIndex(cwd);
      const ctxPath = await saveProjectContext(cwd, ctx);

      console.log(chalk.green('n0x initialized'));
      console.log(chalk.dim(`  Config:  ${configPath()}`));
      console.log(chalk.dim(`  MCP:     ${mcpPath}`));
      console.log(chalk.dim(`  Context: ${ctxPath}`));
      console.log(chalk.dim(`  Symbols: ${ctx.symbols.length} in ${ctx.fileCount} files`));
      console.log('\n' + chalk.bold('Start your model server (llama-server recommended):'));
      console.log(chalk.cyan('  # Mainline llama.cpp (Q1_0):'));
      console.log(chalk.cyan('  llama-server -hf prism-ml/Bonsai-4B-gguf --hf-file Bonsai-4B-Q1_0.gguf'));
      console.log(chalk.cyan('  # PrismML fork (Ternary Q2_0):'));
      console.log(chalk.cyan('  llama-server -m Ternary-Bonsai-4B-Q2_0.gguf -c 4096'));
      console.log(chalk.yellow('  Note: Ollama is NOT recommended for Bonsai — its Qwen3 template'));
      console.log(chalk.yellow('        forces thinking tokens on every response and breaks 1-bit models.'));
      console.log('\nVerify:');
      console.log('\n' + chalk.bold('Run your model backend:'));
      console.log(chalk.cyan('  n0x setup'));
    });

  program
    .command('setup')
    .description('Interactive model setup and configuration')
    .action(async () => {
      await interactiveModelSetup();
    });

  program
    .command('models')
    .description('Show available Bonsai models')
    .action(async () => {
      const manager = new BonsaiManager(getN0xHome());
      await manager.init();

      const allModels = manager.getAllModels();
      const ramInfo = manager.getRAMInfo();
      const recommended = manager.recommendModel();

      console.log(chalk.bold.green('\n🌿 n0x - available models\n'));
      console.log(chalk.dim('Your system: ') + chalk.cyan(`${ramInfo.totalGB.toFixed(1)}GB RAM (${ramInfo.tier} tier)`));
      console.log();

      console.log(chalk.bold('Bonsai Family (Optimized for Low RAM):\n'));

      for (const model of allModels) {
        const isRecommended = model.id === recommended.id;
        const isDownloaded = await manager.hasModel(model.id);

        const prefix = isDownloaded ? chalk.green('✓') : chalk.dim('•');
        const name = isRecommended ? chalk.bold.green(model.displayName) : chalk.white(model.displayName);
        const tag = isRecommended ? chalk.green(' ⭐ RECOMMENDED') : '';
        const dlTag = isDownloaded ? chalk.green(' [downloaded]') : '';

        console.log(`  ${prefix} ${name}${tag}${dlTag}`);
        console.log(chalk.dim(`     ${model.ramMB}MB  •  ${model.accuracy}% accuracy  •  ${model.speed}`));
        console.log(chalk.dim(`     ${model.bestFor}`));
        console.log();
      }

      console.log(chalk.bold('Download a model:'));
      console.log(chalk.cyan('  n0x setup\n'));
    });

  program
    .command('doctor')
    .description('Check environment, model, and server status')
    .action(async () => {
      const manager = new BonsaiManager(getN0xHome());
      await manager.init();

      const config = await loadConfig();
      const modelId = config.default_model;
      const managedLlama = usesManagedLlamaServer(config);
      const modelPath = managedLlama
        ? config.model_path ?? manager.getModelPath(modelId) ?? undefined
        : undefined;
      const remoteModels = managedLlama ? undefined : await fetchOpenAiModels(config);
      const modelExists = managedLlama
        ? modelPath ? await fileExists(modelPath) : await manager.hasModel(modelId)
        : Boolean(remoteModels?.ok && remoteModels.models.includes(modelId));
      const serverPort = getConfiguredPort(config.base_url, 8080);
      const serverRunning = managedLlama
        ? await manager.isServerRunning(serverPort)
        : Boolean(remoteModels?.ok);

      const results = {
        installation: true,
        hardware: true,
        model: {
          exists: modelExists,
          name: modelId,
          path: modelPath,
          backend: config.backend,
          available: remoteModels?.models,
          ramMB: manager.getAllModels().find(m => m.id === modelId)?.ramMB,
        },
        server: {
          running: serverRunning,
          url: config.base_url,
        },
        health: {
          toolCalling: undefined as boolean | undefined,
          codeGen: undefined as boolean | undefined,
        },
      };

      // Run smoke tests if server is running
      if (results.server.running) {
        try {
          const smoke = await runToolCallSmokeTest(
            config.base_url,
            modelId,
            config.api_key,
          );
          results.health.toolCalling = smoke.ok;
          results.health.codeGen = smoke.ok;
        } catch {
          results.health.toolCalling = false;
          results.health.codeGen = false;
        }
      }

      await showDoctorResults(results);
      const healthOk = results.health.toolCalling === undefined
        || (results.health.toolCalling && results.health.codeGen);
      process.exit(results.installation && results.model.exists && healthOk ? 0 : 1);
    });

  program
    .command('map')
    .description('Repository map')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .action(async (opts: { cwd: string }) => {
      console.log(formatRepoMap(await analyzeRepository(resolve(opts.cwd))));
    });

  program
    .command('symbols')
    .description('Show symbol index from .n0x/context.json')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .action(async (opts: { cwd: string }) => {
      const ctx = await loadProjectContext(resolve(opts.cwd));
      if (!ctx) {
        console.log('No symbol index. Run: n0x init');
        process.exit(1);
      }
      console.log(formatSymbolIndex(ctx));
    });

  program
    .command('memory')
    .description('Show or set project memory')
    .option('--set <json>', 'Set memory JSON')
    .action(async (opts: { set?: string }) => {
      if (opts.set) {
        await saveMemory(memorySchema.parse(JSON.parse(opts.set)));
        console.log('Memory saved.');
      } else {
        console.log(JSON.stringify(await loadMemory(), null, 2));
      }
    });

  program
    .command('checkpoint')
    .description('Create a workspace checkpoint')
    .argument('[label]', 'Why this checkpoint exists', 'manual checkpoint')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .action(async (label: string, opts: { cwd: string }) => {
      const cwd = resolve(opts.cwd);
      await assertWorkspace(cwd);
      const checkpoint = await createCheckpoint(cwd, label);
      console.log(chalk.green(`Checkpoint created: ${checkpoint.id}`));
      console.log(chalk.dim(`Files: ${checkpoint.files.length}`));
      console.log(chalk.dim(`Size: ${formatBytes(checkpoint.totalBytes)}`));
      if (checkpoint.skipped.length > 0) {
        console.log(chalk.yellow(`Skipped: ${checkpoint.skipped.length} large files`));
      }
    });

  program
    .command('checkpoints')
    .description('List workspace checkpoints')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .action(async (opts: { cwd: string }) => {
      const cwd = resolve(opts.cwd);
      await assertWorkspace(cwd);
      printCheckpointList(await listCheckpoints(cwd));
    });

  program
    .command('restore')
    .description('Restore a checkpoint')
    .argument('[id]', 'Checkpoint id, or "latest"', 'latest')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .option('-f, --force', 'Do not ask for confirmation')
    .action(async (id: string, opts: { cwd: string; force?: boolean }) => {
      const cwd = resolve(opts.cwd);
      await assertWorkspace(cwd);
      if (!opts.force && !(await confirmRestore(id))) return;
      const result = await restoreCheckpoint(cwd, id);
      console.log(chalk.green(`Restored checkpoint ${result.id}`));
      console.log(chalk.dim(`Restored: ${result.restored}`));
      console.log(chalk.dim(`Removed: ${result.removed}`));
      console.log(chalk.dim(`Skipped: ${result.skipped}`));
    });

  program
    .command('config')
    .description('Show config')
    .action(async () => {
      console.log(configPath());
      console.log(JSON.stringify(await loadConfig(), null, 2));
    });

  program
    .command('reflections')
    .description('Show what the agent has learned from past failures')
    .option('--stats', 'Show statistics only')
    .action(async (opts: { stats?: boolean }) => {
      const reflectionEngine = new ReflectionEngine(process.cwd());
      await reflectionEngine.init();

      const stats = reflectionEngine.getStats();

      console.log(chalk.bold.cyan('\n🧠 Agent Learning & Reflections\n'));

      if (opts.stats) {
        console.log(`Total failures recorded: ${chalk.yellow(String(stats.totalFailures))}`);
        console.log(`Most failed tool: ${chalk.red(stats.mostFailedTool)}`);
        console.log(chalk.dim('\nUse: n0x reflections (without --stats) to see detailed reflections\n'));
        return;
      }

      if (stats.totalFailures === 0) {
        console.log(chalk.dim('No failures recorded yet. The agent will learn as it encounters errors.\n'));
        return;
      }

      const summary = reflectionEngine.getRecentFailureSummary(10);
      console.log(chalk.white(summary));

      console.log(chalk.dim(`\nTotal learnings: ${stats.totalFailures}`));
      console.log(chalk.dim(`Stored in: ${process.cwd()}/.n0x/reflections.jsonl\n`));
    });

  program
    .command('use')
    .description('Switch backend: ollama | llama-server | auto-detect')
    .argument('[backend]', 'Backend to use: ollama, llama-server, or a custom URL')
    .action(async (backend?: string) => {
      // Auto-detect if no arg given
      if (!backend || backend === 'auto') {
        console.log(chalk.dim('Auto-detecting running backends...'));
        const detected = await autoDetectBackend();
        if (!detected) {
          console.log(chalk.red('No backend detected on :8080 or :11434.'));
          console.log(chalk.dim('Start one first:'));
          console.log(chalk.cyan('  llama-server -hf prism-ml/Bonsai-4B-gguf --hf-file Bonsai-4B-Q1_0.gguf'));
          console.log(chalk.cyan('  ollama run hf.co/prism-ml/Bonsai-4B-gguf:Q1_0   # not recommended for Bonsai'));
          process.exit(1);
        }
        console.log(chalk.green(`✓ Detected: ${detected.type} at ${detected.url}`));
        if (detected.model) console.log(chalk.dim(`  Model: ${detected.model}`));
        await writeBackendConfig(detected.url, 'auto');
        console.log(chalk.green(`✓ Config updated: backend = "auto", base_url = "${detected.url}"`));
        console.log(chalk.dim(`Run 'n0x doctor' to verify.`));
        return;
      }

      // Named shortcuts
      const urlMap: Record<string, string> = {
        'ollama': 'http://localhost:11434/v1',
        'llama-server': 'http://localhost:8080/v1',
        'llama': 'http://localhost:8080/v1',
      };
      const url = urlMap[backend.toLowerCase()] ?? backend;

      // Validate it's live
      const detected = await autoDetectBackend(url);
      if (!detected || detected.url !== url) {
        console.log(chalk.yellow(`Warning: ${url} does not appear to be responding.`));
      } else {
        console.log(chalk.green(`✓ ${detected.type} is live at ${url}`));
      }

      const configBackend = backendForUseInput(backend, url);
      await writeBackendConfig(url, configBackend);
      console.log(chalk.green(`✓ Config updated: backend = "${configBackend}", base_url = "${url}"`));
      console.log(chalk.dim(`Run 'n0x doctor' to verify.`));
    });

  return program;
}

// validateBonsai removed — n0x now works with any model (Ollama, llama-server, etc.)


async function printBanner(
  config: Awaited<ReturnType<typeof loadConfig>>,
  cwd: string,
  goal: string,
  editMode: EditMode,
  checkpointId?: string,
): Promise<void> {
  console.log(chalk.bold(`\n${PRODUCT_NAME}`));
  console.log(chalk.dim(`model ${config.default_model}`));
  console.log(chalk.dim(`backend ${config.backend} at ${config.base_url}`));
  console.log(chalk.dim(`mode ${editMode.toUpperCase()}  steps ${config.max_steps}`));
  if (checkpointId) console.log(chalk.dim(`checkpoint ${checkpointId}`));
  console.log(chalk.dim(`cwd ${cwd}`));
  console.log(chalk.white(`\n${goal}\n`));
}

async function checkSandbox(config: Awaited<ReturnType<typeof loadConfig>>): Promise<void> {
  if (!config.sandbox_docker) return;
  if (!(await isDockerAvailable())) {
    console.warn(chalk.yellow('Warning: sandbox_docker enabled but Docker unavailable.'));
  }
}

function createCliRunUi(
  config: N0xConfig,
  cwd: string,
  editMode: EditMode,
  checkpointId: string | undefined,
  stream: boolean,
) {
  let mdStream: TerminalMarkdownStream | null = null;
  const status = new RunStatusLine({
    model: config.default_model,
    backend: config.backend,
    mode: editMode.toUpperCase(),
    cwd,
    maxSteps: config.max_steps,
    checkpointId,
  });

  const ensureMdStream = () => {
    if (!mdStream && stream) {
      status.clear();
      mdStream = createTerminalMarkdownStream({
        loadingIndicator: { text: 'Thinking...' },
        startOnNewLine: true
      });
      mdStream.start();
    }
    return mdStream;
  };

  const stopMdStream = () => {
    if (mdStream) {
      mdStream.stop();
      mdStream = null;
    }
  };

  return {
    callbacks: {
      onPlan: (p: string) => {
        stopMdStream();
        status.log(`${chalk.bold('\nPlan')}\n${chalk.dim(p)}\n`);
        status.update({ phase: 'thinking' });
      },
      onStep: (s: {
        step: number;
        maxSteps: number;
        contextPercent: number;
        approxTokens: number;
      }) => {
        status.update({
          phase: 'thinking',
          step: s.step,
          maxSteps: s.maxSteps,
          contextPercent: s.contextPercent,
          approxTokens: s.approxTokens,
          tool: '',
        });
      },
      onThought: (t: string) => {
        stopMdStream();
        if (!stream) status.log(`${chalk.dim('\nThought')}\n${chalk.cyan(t)}\n`);
      },
      onToken: stream ? (t: string) => {
        ensureMdStream()?.push(t);
      } : undefined,
      onToolStart: (name: string, args: string) => {
        stopMdStream();
        status.update({ phase: 'tool', tool: name });
        status.log(`${chalk.cyan('tool')} ${chalk.bold(name)} ${chalk.dim(formatToolOutput(args, 180))}`);
      },
      onToolEnd: (name: string, out: string, err: boolean) => {
        stopMdStream();
        status.update({ phase: err ? 'tool failed' : 'observed', tool: name });
        const label = err ? chalk.red('failed') : chalk.green('done');
        status.log(`${label} ${chalk.bold(name)} ${chalk.dim(formatToolOutput(out, err ? 420 : 260))}`);
      },
      onWarning: (msg: string) => {
        stopMdStream();
        status.log(chalk.yellow(`warning ${formatToolOutput(msg, 420)}`));
      },
    },
    stop: () => {
      stopMdStream();
      status.stop();
    },
  };
}

function formatToolOutput(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}

function printResult(result: Awaited<ReturnType<typeof runAgent>>): void {
  const color = result.completed ? chalk.green : chalk.yellow;
  console.log(color.bold(`\n${result.summary}`));
  console.log(chalk.dim(`Steps: ${result.stepsUsed}`));
}

// Removed - no longer used

export function handleCliError(err: unknown): never {
  if (isN0xError(err)) process.stderr.write(chalk.red(formatError(err)) + '\n');
  else if (err instanceof Error) process.stderr.write(chalk.red(err.message) + '\n');
  else process.stderr.write(chalk.red(String(err)) + '\n');
  process.exit(1);
}

async function ensureServerRunning(manager: BonsaiManager, config: N0xConfig): Promise<void> {
  if (!usesManagedLlamaServer(config)) {
    return;
  }

  const port = getConfiguredPort(config.base_url, 8080);

  // Check if server is alive
  if (await manager.isServerRunning(port)) {
    return; // Already running
  }

  // Server not running, start it
  console.log(chalk.dim('Starting model server...'));

  const modelPath = config.model_path ?? manager.getModelPath(config.default_model) ?? undefined;
  if (!modelPath) {
    showError(
      'Model not configured',
      'No model_path found in configuration and no downloaded model matched default_model.',
      ['Run: n0x setup', 'Or add model_path = "/path/to/model.gguf" to ~/.n0x/config.toml'],
    );
    process.exit(1);
  }

  if (!(await fileExists(modelPath))) {
    showError(
      'Model file not found',
      `Configured model_path does not exist: ${modelPath}`,
      ['Run: n0x setup', 'Or update model_path in ~/.n0x/config.toml'],
    );
    process.exit(1);
  }

  try {
    await manager.startServer(modelPath, port);
    console.log(chalk.green('✓ Server ready\n'));
  } catch (error) {
    showError(
      'Server failed to start',
      error instanceof Error ? error.message : String(error),
      [
        ...manager.getLlamaServerInstallHints(),
        'Re-run setup: n0x setup',
      ],
    );
    process.exit(1);
  }
}

async function runToolCallSmokeTest(
  baseUrl: string,
  model: string,
  apiKey: string,
): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You are a tool-calling test harness. You must call the ping function with msg="ok". Respond with a tool call only.',
          },
          { role: 'user', content: 'ping now' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'ping',
              description: 'A no-op function used for capability testing.',
              parameters: {
                type: 'object',
                properties: { msg: { type: 'string' } },
                required: ['msg'],
              },
            },
          },
        ],
        tool_choice: 'required',
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, detail: `chat completion HTTP ${res.status}` };
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };

    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc?.function?.name) {
      return { ok: false, detail: 'model did not produce a tool call (may not support tool calling)' };
    }
    if (tc.function.name !== 'ping') {
      return { ok: false, detail: `model called wrong tool: ${tc.function.name}` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(tc.function.arguments ?? '{}');
    } catch {
      return { ok: false, detail: 'model produced tool call but args are not valid JSON' };
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as Record<string, unknown>).msg !== 'string'
    ) {
      return { ok: false, detail: 'model produced tool call but missing required "msg" arg' };
    }
    return { ok: true, detail: `model produced valid tool call (msg="${(parsed as Record<string, string>).msg}")` };
  } catch (e) {
    clearTimeout(timer);
    return {
      ok: false,
      detail: `smoke test failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
