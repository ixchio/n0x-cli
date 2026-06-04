import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import {
  loadConfig,
  writeDefaultConfig,
  configPath,
  getN0xHome,
  mcpConfigPath,
} from './config.js';
import { runAgent } from './agent/loop.js';
import { LLMClient } from './llm/client.js';
import { checkLlmHealth } from './llm/health.js';
import { analyzeRepository, formatRepoMap } from './repo/analyze.js';
import { loadMemory, saveMemory } from './agent/memory.js';
import { memorySchema } from './config/schema.js';
import { PRODUCT_NAME, BONSAI_MODELS } from './constants.js';
import { isDockerAvailable } from './sandbox/docker.js';
import { formatError, isN0xError } from './lib/errors.js';
import { setLogLevel } from './lib/logger.js';
import { spawn } from 'node:child_process';

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

export function createCli(): Command {
  const program = new Command();

  program
    .name('n0x')
    .description(`${PRODUCT_NAME} — local-first coding agent (Bonsai only)`)
    .version(VERSION)
    .option('-v, --verbose', 'Debug logging')
    .hook('preAction', (thisCommand) => {
      if (thisCommand.opts().verbose) setLogLevel('debug');
    });

  program
    .command('run')
    .description('Run the agent on a goal')
    .argument('[goal]', 'What to build or fix')
    .option('-p, --prompt <text>', 'Goal prompt')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .option('--max-steps <n>', 'Override max agent steps', (v) => parseInt(v, 10))
    .action(async (goal: string | undefined, opts: {
      prompt?: string;
      cwd: string;
      maxSteps?: number;
    }) => {
      const config = await loadConfig();
      validateBonsai(config.default_model);

      const userGoal = opts.prompt ?? goal;
      if (!userGoal?.trim()) {
        throw new Error('Provide a goal: n0x run "fix the login bug"');
      }

      const cwd = resolve(opts.cwd);
      await assertWorkspace(cwd);
      if (opts.maxSteps) config.max_steps = opts.maxSteps;

      await printBanner(config, cwd, userGoal);
      await checkSandbox(config);

      const ac = createAbortController();
      const result = await runAgent({
        goal: userGoal.trim(),
        cwd,
        config,
        signal: ac.signal,
        callbacks: cliCallbacks(),
      });

      printResult(result);
      process.exit(result.completed ? 0 : 1);
    });

  program
    .command('chat')
    .description('Interactive REPL')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .action(async (opts: { cwd: string }) => {
      const config = await loadConfig();
      validateBonsai(config.default_model);
      const cwd = resolve(opts.cwd);
      await assertWorkspace(cwd);

      const { createInterface } = await import('node:readline');
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      console.log(chalk.bold.green(`\n🌿 ${PRODUCT_NAME} interactive`));
      console.log(chalk.dim(`Model: ${config.default_model} | exit to quit\n`));

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
            callbacks: cliCallbacks(),
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
    .description('Create ~/.n0x config and example MCP file')
    .action(async () => {
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
                  args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
                },
              },
            },
            null,
            2,
          ),
          'utf8',
        );
      }

      console.log(chalk.green('n0x initialized'));
      console.log(chalk.dim(`  Config: ${configPath()}`));
      console.log(chalk.dim(`  MCP:    ${mcpPath}`));
      console.log('\nStart Bonsai:');
      console.log(chalk.cyan('  llama-server -hf prism-ml/Bonsai-4B-gguf:Q1_0'));
      console.log('\nVerify:');
      console.log(chalk.cyan('  n0x doctor'));
    });

  program
    .command('doctor')
    .description('Check environment, LLM server, and tools')
    .action(async () => {
      const config = await loadConfig();
      const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

      checks.push({
        name: 'Config',
        ok: true,
        detail: configPath(),
      });

      checks.push({
        name: 'Bonsai model',
        ok: LLMClient.isBonsaiModel(config.default_model),
        detail: config.default_model,
      });

      const health = await checkLlmHealth(config);
      checks.push({
        name: 'LLM server',
        ok: health.ok,
        detail: health.ok
          ? `${config.base_url} (${health.latencyMs}ms, models: ${health.models?.slice(0, 3).join(', ') ?? 'n/a'})`
          : (health.error ?? 'unreachable'),
      });

      const rgOk = await commandExists('rg');
      checks.push({
        name: 'ripgrep',
        ok: rgOk,
        detail: rgOk ? 'installed' : 'missing — apt install ripgrep',
      });

      if (config.sandbox_docker) {
        const dockerOk = await isDockerAvailable();
        checks.push({
          name: 'Docker sandbox',
          ok: dockerOk,
          detail: dockerOk ? 'ready' : 'not running',
        });
      }

      const hasTavilyKey = Boolean(
        config.tavily_api_key?.trim() || process.env.TAVILY_API_KEY?.trim(),
      );
      checks.push({
        name: 'Tavily web tools',
        ok: config.tavily_enabled,
        detail: config.tavily_enabled
          ? hasTavilyKey
            ? 'enabled (API key set) — WebSearch + WebExtract'
            : 'enabled (keyless mode) — get key at https://tavily.com'
          : 'disabled in config',
      });

      console.log(chalk.bold(`\n🌿 ${PRODUCT_NAME} doctor\n`));
      let allOk = true;
      for (const c of checks) {
        const icon = c.ok ? chalk.green('✓') : chalk.red('✗');
        console.log(`${icon} ${c.name}: ${c.detail}`);
        if (!c.ok) allOk = false;
      }
      console.log();
      process.exit(allOk ? 0 : 1);
    });

  program
    .command('map')
    .description('Generate repository map')
    .option('-C, --cwd <dir>', 'Working directory', process.cwd())
    .action(async (opts: { cwd: string }) => {
      const map = await analyzeRepository(resolve(opts.cwd));
      console.log(formatRepoMap(map));
    });

  program
    .command('memory')
    .description('Show or set project memory')
    .option('--set <json>', 'Set memory JSON')
    .action(async (opts: { set?: string }) => {
      if (opts.set) {
        const mem = memorySchema.parse(JSON.parse(opts.set));
        await saveMemory(mem);
        console.log('Memory saved.');
      } else {
        console.log(JSON.stringify(await loadMemory(), null, 2));
      }
    });

  program
    .command('config')
    .description('Show config path and values')
    .action(async () => {
      const config = await loadConfig();
      console.log(configPath());
      console.log(JSON.stringify(config, null, 2));
    });

  return program;
}

function validateBonsai(model: string): void {
  if (!LLMClient.isBonsaiModel(model)) {
    console.error(chalk.red('Only Bonsai models are supported.'));
    console.error(`Allowed: ${BONSAI_MODELS.join(', ')}`);
    process.exit(1);
  }
}

async function printBanner(
  config: Awaited<ReturnType<typeof loadConfig>>,
  cwd: string,
  goal: string,
): Promise<void> {
  console.log(chalk.bold.green(`\n🌿 ${PRODUCT_NAME}\n`));
  console.log(chalk.dim(`Model: ${config.default_model}`));
  console.log(chalk.dim(`Server: ${config.base_url}`));
  console.log(chalk.dim(`CWD: ${cwd}\n`));
  console.log(chalk.yellow(`Goal: ${goal}\n`));
}

async function checkSandbox(
  config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
  if (!config.sandbox_docker) return;
  const ok = await isDockerAvailable();
  if (!ok) {
    console.warn(chalk.yellow('Warning: sandbox_docker enabled but Docker is not available.'));
  }
}

function cliCallbacks() {
  return {
    onPlan: (p: string) => console.log(chalk.blue('\nPlan:\n') + p + '\n'),
    onThought: (t: string) => console.log(chalk.cyan(t)),
    onToolStart: (name: string, args: string) =>
      console.log(chalk.magenta(`\n▸ ${name}`) + chalk.dim(` ${args}`)),
    onToolEnd: (name: string, out: string, err: boolean) =>
      console.log(chalk[err ? 'red' : 'green'](`${name}: ${out}`)),
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
  if (isN0xError(err)) {
    process.stderr.write(chalk.red(formatError(err)) + '\n');
  } else if (err instanceof Error) {
    process.stderr.write(chalk.red(err.message) + '\n');
  } else {
    process.stderr.write(chalk.red(String(err)) + '\n');
  }
  process.exit(1);
}
