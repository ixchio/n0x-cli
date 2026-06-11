import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { access, readFile } from 'node:fs/promises';
import {
  loadConfig,
  writeDefaultConfig,
  configPath,
  getN0xHome,
  mcpConfigPath,
} from './config.js';
import { runAgent } from './agent/loop.js';
import { LLMClient } from './llm/client.js';
import { analyzeRepository, formatRepoMap } from './repo/analyze.js';
import { loadMemory, saveMemory } from './agent/memory.js';
import { memorySchema } from './config/schema.js';
import { PRODUCT_NAME, MODEL_RECOMMENDATIONS } from './constants.js';
import { isDockerAvailable } from './sandbox/docker.js';
import { formatError, isN0xError } from './lib/errors.js';
import { setLogLevel } from './lib/logger.js';
import { spawn } from 'node:child_process';
import {
  buildSymbolIndex,
  saveProjectContext,
  loadProjectContext,
  formatSymbolIndex,
} from './context/symbols.js';
import type { EditMode } from './tools/types.js';
import { createTerminalMarkdownStream, TerminalMarkdownStream } from 'markstream-cli';
import { autoDetectBackend } from './llm/detect.js';

const VERSION = '0.1.0';

function createAbortController(): AbortController {
  const ac = new AbortController();
  process.on('SIGINT', () => {
    process.stderr.write(chalk.yellow('\n\nInterrupted. Finishing current step...\n'));
    ac.abort();
  });
  return ac;
}

async function assertWorkspace(cwd: string): Promise<void> {
  await access(cwd);
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
}): Promise<void> {
  const config = await loadConfig();

  // Allow --model flag or env override to switch model on the fly
  if (opts.model) {
    config.default_model = opts.model;
    // If user explicitly sets a model, update base_url to match expected backend
    if (!opts.model.includes('bonsai')) {
      const detected = await autoDetectBackend(config.base_url);
      if (!detected) {
        // Fallback: assume Ollama if no backend found and non-bonsai model requested
        config.base_url = 'http://localhost:11434/v1';
      }
    }
  }

  const cwd = resolve(opts.cwd);
  await assertWorkspace(cwd);
  if (opts.maxSteps) config.max_steps = opts.maxSteps;
  if (opts.stream === false) config.stream_output = false;

  let editMode: EditMode = 'apply';
  if (opts.dry) editMode = 'dry';
  else if (opts.interactive) editMode = 'interactive';
  else if (opts.apply) editMode = 'apply';

  await printBanner(config, cwd, opts.goal, editMode);
  await checkSandbox(config);

  const ac = createAbortController();
  const result = await runAgent({
    goal: opts.goal.trim(),
    cwd,
    config,
    signal: ac.signal,
    editMode,
    stream: config.stream_output,
    callbacks: cliCallbacks(config.stream_output),
  });

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
    .option('-i, --interactive', 'Confirm each file write interactively')
    .option('--no-stream', 'Disable streaming tokens')
    .action(async (goal: string | undefined, opts: {
      prompt?: string;
      cwd: string;
      model?: string;
      maxSteps?: number;
      dry?: boolean;
      apply?: boolean;
      interactive?: boolean;
      noStream?: boolean;
    }) => {
      const userGoal = opts.prompt ?? goal;
      if (!userGoal?.trim()) throw new Error('Provide a goal: n0x run "fix the login bug"');
      await runAgentCommand({
        goal: userGoal,
        cwd: opts.cwd,
        model: opts.model,
        maxSteps: opts.maxSteps,
        dry: opts.dry,
        apply: opts.apply,
        interactive: opts.interactive,
        stream: opts.noStream ? false : undefined,
      });
    });

  program
    .command('explain')
    .description('Explain what a file does')
    .argument('<file>', 'File path')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .option('--no-stream', 'Disable streaming')
    .action(async (file: string, opts: { cwd: string; noStream?: boolean }) => {
      const content = await readFile(resolve(opts.cwd, file), 'utf8').catch(() => null);
      if (!content) throw new Error(`Cannot read file: ${file}`);
      const config = await loadConfig();
      const llm = new LLMClient(config);
      const messages = [
        { role: 'system' as const, content: 'You are an expert programmer. Explain what the provided file does concisely and structurally. Do not output code unless necessary.' },
        { role: 'user' as const, content: `File: ${file}\n\n${content.slice(0, 8000)}` },
      ];
      
      console.log(chalk.bold.green(`\n🌿 ${PRODUCT_NAME} explain: ${file}\n`));
      const onToken = opts.noStream ? undefined : (t: string) => process.stdout.write(chalk.cyan(t));
      const res = await llm.chat(messages, undefined, onToken);
      
      if (opts.noStream && res.content) {
        console.log(chalk.cyan(res.content));
      }
      console.log();
    });

  program
    .command('commit')
    .description('Generate a conventional commit message from staged changes')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .action(async (opts: { cwd: string }) => {
      const { execSync } = await import('node:child_process');
      const cwd = resolve(opts.cwd);
      let diff = '';
      try {
        diff = execSync('git diff --staged', { cwd, encoding: 'utf8' }).trim();
      } catch {
        console.log(chalk.red('Not a git repository or git error.'));
        return;
      }
      
      if (!diff) {
        console.log(chalk.yellow('Nothing staged. Run git add first.'));
        return;
      }
      
      const config = await loadConfig();
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
        execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd, stdio: 'inherit' });
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

      const { createInterface } = await import('node:readline');
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      console.log(chalk.bold.green(`\n🌿 ${PRODUCT_NAME} interactive`));
      console.log(chalk.dim(`Model: ${config.default_model} | ${opts.dry ? 'DRY' : 'APPLY'} | exit to quit\n`));

      const prompt = (): void => {
        rl.question(chalk.cyan('you> '), async (line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'exit' || trimmed === 'quit') {
            rl.close();
            return;
          }
          const ac = createAbortController();
          const result = await runAgent({
            goal: trimmed,
            cwd,
            config,
            signal: ac.signal,
            editMode: opts.dry ? 'dry' : 'apply',
            callbacks: cliCallbacks(config.stream_output),
          });
          printResult(result);
          console.log();
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
    .description('Interactive setup for LLM backends')
    .action(async () => {
      console.log(chalk.bold('\n🌿 n0x setup\n'));
      console.log('1. Install Ollama: https://ollama.com');
      console.log('2. Pull a recommended model:');
      console.log(chalk.cyan('   ollama run qwen2.5-coder:7b'));
      console.log('3. Set as default:');
      console.log(chalk.cyan('   n0x use ollama'));
    });

  program
    .command('models')
    .description('Show recommended models and how to pull them')
    .action(() => {
      console.log(chalk.bold('\n🌿 n0x — recommended models\n'));
      console.log(chalk.dim('Install Ollama first: curl -fsSL https://ollama.com/install.sh | sh\n'));
      for (const m of MODEL_RECOMMENDATIONS) {
        const tag = m.backend === 'ollama' ? chalk.green('[Ollama]') : chalk.yellow('[llama-server]');
        console.log(`${tag} ${chalk.cyan(m.id)}`);
        console.log(`  Task: ${m.task}`);
        console.log(`  RAM:  ${m.ram}`);
        console.log(`  Why:  ${m.why}`);
        if (m.ollamaCmd) console.log(`  Run:  ${chalk.dim(m.ollamaCmd)}`);
        console.log();
      }
      console.log(chalk.dim('Switch model for one run:'));
      console.log(chalk.cyan('  n0x run --model qwen2.5-coder:7b "refactor the auth module"'));
    });

  program
    .command('doctor')
    .description('Check environment, LLM server, and tools')
    .action(async () => {
      const config = await loadConfig();
      const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

      checks.push({ name: 'Config', ok: true, detail: configPath() });
      checks.push({
        name: 'Bonsai model',
        ok: LLMClient.isBonsaiModel(config.default_model),
        detail: config.default_model,
      });

      // Probe both backends
      console.log(chalk.dim('Probing backends...'));
      const detected = await autoDetectBackend(config.base_url);
      if (detected) {
        const backendLabel = detected.type === 'ollama'
          ? `Ollama at ${detected.url}`
          : `llama-server at ${detected.url}`;
        checks.push({
          name: 'LLM backend',
          ok: true,
          detail: `${backendLabel} — model: ${detected.model ?? 'unknown'}`,
        });

        const smoke = await runToolCallSmokeTest(detected.url, detected.model ?? config.default_model, config.api_key);
        checks.push({
          name: 'Tool-call smoke test',
          ok: smoke.ok,
          detail: smoke.detail,
        });

        if (detected.type === 'ollama') {
          checks.push({
            name: 'Bonsai compatibility',
            ok: false,
            detail: 'Ollama + Bonsai is not recommended — Qwen3 template forces <think> tokens. Use llama-server.',
          });
        }
      } else {
        checks.push({
          name: 'LLM backend',
          ok: false,
          detail: 'No server found on :8080 or :11434. Start llama-server or run: ollama run hf.co/prism-ml/Bonsai-4B-gguf:Q1_0',
        });
      }

      checks.push({
        name: 'ripgrep',
        ok: await commandExists('rg'),
        detail: (await commandExists('rg')) ? 'installed' : 'missing — install with: sudo apt install ripgrep',
      });

      if (config.sandbox_docker) {
        const dockerOk = await isDockerAvailable();
        checks.push({
          name: 'Docker sandbox',
          ok: dockerOk,
          detail: dockerOk ? 'ready' : 'not running',
        });
      }

      checks.push({
        name: 'Tavily search',
        ok: config.tavily_enabled,
        detail: config.tavily_enabled
          ? (config.tavily_api_key ? 'enabled (personal key)' : 'enabled (keyless mode)')
          : 'disabled — set tavily_enabled = true in config to enable',
      });

      console.log(chalk.bold(`\n🌿 ${PRODUCT_NAME} doctor\n`));
      let allOk = true;
      for (const c of checks) {
        console.log(`${c.ok ? chalk.green('✓') : chalk.red('✗')} ${c.name}: ${c.detail}`);
        if (!c.ok) allOk = false;
      }
      console.log();
      process.exit(allOk ? 0 : 1);
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
    .command('config')
    .description('Show config')
    .action(async () => {
      console.log(configPath());
      console.log(JSON.stringify(await loadConfig(), null, 2));
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
        console.log(chalk.dim('\nThis session will use the detected backend automatically.'));
        console.log(chalk.dim(`To make it permanent, set in ~/.n0x/config.toml:`));
        console.log(chalk.cyan(`  base_url = "${detected.url}"`));
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

      const configFile = configPath();
      const raw = await readFile(configFile, 'utf8').catch(() => '');
      const updated = raw.replace(
        /^base_url\s*=\s*.+$/m,
        `base_url = "${url}"`,
      );
      if (updated === raw) {
        // Not found — append
        await import('node:fs/promises').then(({ appendFile }) =>
          appendFile(configFile, `\nbase_url = "${url}"\n`)
        );
      } else {
        await import('node:fs/promises').then(({ writeFile: wf }) =>
          wf(configFile, updated, 'utf8')
        );
      }
      console.log(chalk.green(`✓ Config updated: base_url = "${url}"`));
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
): Promise<void> {
  console.log(chalk.bold.green(`\n🌿 ${PRODUCT_NAME}\n`));
  console.log(chalk.dim(`Model: ${config.default_model} | Mode: ${editMode.toUpperCase()} | Max steps: ${config.max_steps}`));
  console.log(chalk.dim(`Server: ${config.base_url}`));
  console.log(chalk.dim(`CWD: ${cwd}\n`));
  console.log(chalk.yellow(`Goal: ${goal}\n`));
}

async function checkSandbox(config: Awaited<ReturnType<typeof loadConfig>>): Promise<void> {
  if (!config.sandbox_docker) return;
  if (!(await isDockerAvailable())) {
    console.warn(chalk.yellow('Warning: sandbox_docker enabled but Docker unavailable.'));
  }
}

function cliCallbacks(stream: boolean) {
  let mdStream: TerminalMarkdownStream | null = null;

  const ensureMdStream = () => {
    if (!mdStream && stream) {
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
    onPlan: (p: string) => {
      stopMdStream();
      console.log(chalk.blue('\nPlan:\n') + p + '\n');
    },
    onThought: (t: string) => {
      stopMdStream();
      if (!stream) console.log(chalk.cyan(t));
    },
    onToken: stream ? (t: string) => {
      ensureMdStream()?.push(t);
    } : undefined,
    onToolStart: (name: string, args: string) => {
      stopMdStream();
      console.log(chalk.magenta(`\n▸ ${name}`) + chalk.dim(` ${args}`));
    },
    onToolEnd: (name: string, out: string, err: boolean) => {
      stopMdStream();
      console.log(chalk[err ? 'red' : 'green'](`${name}: ${out}`));
    },
    onWarning: (msg: string) => {
      stopMdStream();
      console.log(chalk.yellow(`\n⚠️  ${msg}\n`));
    },
  };
}

function printResult(result: Awaited<ReturnType<typeof runAgent>>): void {
  const color = result.completed ? chalk.green : chalk.yellow;
  console.log(color.bold(`\n${result.summary}`));
  console.log(chalk.dim(`Steps: ${result.stepsUsed}`));
}

function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('which', [cmd], { stdio: 'ignore' });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

export function handleCliError(err: unknown): never {
  if (isN0xError(err)) process.stderr.write(chalk.red(formatError(err)) + '\n');
  else if (err instanceof Error) process.stderr.write(chalk.red(err.message) + '\n');
  else process.stderr.write(chalk.red(String(err)) + '\n');
  process.exit(1);
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
