/**
 * Beautiful UI components for Bonsai setup
 */

import chalk from 'chalk';
import { createInterface } from 'readline/promises';
import type { RAMTierInfo } from './models.js';
import type { BonsaiModel } from './models.js';

/**
 * Beautiful welcome banner
 */
export function showWelcomeBanner(): void {
  console.log();
  console.log(chalk.bold.green('  🌿 n0x - local-first coding agent'));
  console.log(chalk.dim('  ─'.repeat(40)));
  console.log();
}

/**
 * Show hardware detection results
 */
export function showHardwareInfo(ramInfo: RAMTierInfo): void {
  console.log(chalk.bold('Detecting hardware...'));
  console.log(`  ${chalk.green('✓')} Platform: ${process.platform} ${process.arch}`);
  console.log(`  ${chalk.green('✓')} RAM: ${ramInfo.totalGB.toFixed(1)}GB total, ${ramInfo.freeGB.toFixed(1)}GB free`);

  const tierColors = {
    'ultra-low': chalk.red,
    'low': chalk.yellow,
    'medium': chalk.cyan,
    'high': chalk.green,
  };

  const tierNames = {
    'ultra-low': 'Ultra-Low (<4GB)',
    'low': 'Low (4-6GB)',
    'medium': 'Medium (6-12GB)',
    'high': 'High (12GB+)',
  };

  const tierColor = tierColors[ramInfo.tier];
  const tierName = tierNames[ramInfo.tier];

  console.log(`  ${chalk.green('✓')} Tier: ${tierColor(tierName)}`);
  console.log();
}

/**
 * Show recommended model
 */
export function showRecommendedModel(model: BonsaiModel): void {
  console.log(chalk.bold.cyan(`Recommended: ${model.displayName}`));
  console.log(chalk.dim('  ────────────────────────────────────'));
  console.log(`  ${chalk.bold('Size:')}     ${model.ramMB}MB`);
  console.log(`  ${chalk.bold('Quality:')}  ${model.accuracy}% accuracy`);
  console.log(`  ${chalk.bold('Speed:')}    ${model.speed}`);
  console.log(`  ${chalk.bold('Best for:')} ${model.bestFor}`);
  console.log();
}

/**
 * Show model selection menu
 */
export function showModelSelectionMenu(models: BonsaiModel[], recommended: BonsaiModel): void {
  console.log(chalk.bold('Available models:\n'));

  models.forEach((model, index) => {
    const isRecommended = model.id === recommended.id;
    const prefix = isRecommended ? chalk.green('●') : chalk.dim('○');
    const name = isRecommended ? chalk.bold.green(model.displayName) : chalk.white(model.displayName);
    const tag = isRecommended ? chalk.green.bold(' ⭐ RECOMMENDED') : '';

    console.log(`  ${prefix} ${index + 1}. ${name}${tag}`);
    console.log(chalk.dim(`     ${model.ramMB}MB  •  ${model.accuracy}% accuracy  •  ${model.speed}`));
    console.log(chalk.dim(`     ${model.description}`));
    console.log();
  });
}

/**
 * Ask user a yes/no question
 */
export async function askYesNo(question: string, defaultYes = true): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await rl.question(chalk.bold(`${question} ${suffix}: `));
  rl.close();

  if (!answer.trim()) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

/**
 * Ask user to select a number
 */
export async function askNumber(
  question: string,
  min: number,
  max: number,
  defaultValue?: number,
): Promise<number> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const suffix = defaultValue !== undefined ? `[1-${max}, default=${defaultValue}]` : `[1-${max}]`;
  const answer = await rl.question(chalk.bold(`${question} ${suffix}: `));
  rl.close();

  if (!answer.trim() && defaultValue !== undefined) return defaultValue;

  const num = parseInt(answer.trim(), 10);
  if (isNaN(num) || num < min || num > max) {
    console.log(chalk.red(`Invalid choice. Please enter a number between ${min} and ${max}.`));
    return askNumber(question, min, max, defaultValue);
  }

  return num;
}

/**
 * Show server starting status
 */
export function showServerStarting(modelName: string, port: number): void {
  console.log(chalk.cyan('🚀 Starting llama.cpp server...'));
  console.log(chalk.dim(`   Model: ${modelName}`));
  console.log(chalk.dim(`   Port: ${port}`));
}

/**
 * Show server ready status
 */
export function showServerReady(url: string, ramMB: number): void {
  console.log(chalk.green(`✓ Server running at ${url}`));
  console.log(chalk.dim(`  RAM usage: ~${ramMB}MB\n`));
}

/**
 * Show setup complete message
 */
export function showSetupComplete(): void {
  console.log(chalk.green.bold('✨ Setup complete!\n'));
  console.log(chalk.bold('Ready to code! Try:'));
  console.log(chalk.cyan('  n0x run "add a hello world function"'));
  console.log(chalk.cyan('  n0x chat'));
  console.log();
  console.log(chalk.dim('Documentation: https://github.com/ixchio/n0x-cli'));
  console.log();
}

/**
 * Show low RAM warning
 */
export function showLowRAMWarning(ramInfo: RAMTierInfo): void {
  if (ramInfo.tier === 'ultra-low' || ramInfo.tier === 'low') {
    console.log(chalk.yellow('⚠️  Low RAM detected. For best results:'));
    console.log(chalk.dim('   • Close background apps before running n0x'));
    console.log(chalk.dim('   • Use smaller models (1.7B or 4B)'));
    console.log(chalk.dim('   • Consider using --low-memory flag for heavy tasks'));
    console.log();
  }
}

/**
 * Show error with helpful context
 */
export function showError(title: string, message: string, suggestions?: string[]): void {
  console.log();
  console.log(chalk.red.bold(`❌ ${title}`));
  console.log();
  console.log(chalk.white(message));

  if (suggestions && suggestions.length > 0) {
    console.log();
    console.log(chalk.yellow('What to try:'));
    suggestions.forEach((suggestion, index) => {
      console.log(chalk.dim(`  ${index + 1}. ${suggestion}`));
    });
  }

  console.log();
  console.log(chalk.dim('Need help? https://github.com/ixchio/n0x-cli/issues'));
  console.log();
}

/**
 * Show spinner animation
 */
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private interval?: NodeJS.Timeout;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    this.interval = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      process.stdout.write(`\r${chalk.cyan(frame)} ${this.message}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      process.stdout.write('\r' + ' '.repeat(this.message.length + 3) + '\r');
      if (finalMessage) {
        console.log(finalMessage);
      }
    }
  }

  update(message: string): void {
    this.message = message;
  }
}

/**
 * Show doctor diagnostic results
 */
export async function showDoctorResults(results: {
  installation: boolean;
  hardware: boolean;
  model: {
    exists: boolean;
    name?: string;
    path?: string;
    backend?: string;
    available?: string[];
    ramMB?: number;
  };
  server: { running: boolean; url?: string; uptime?: string };
  health: { toolCalling?: boolean; codeGen?: boolean };
}): Promise<void> {
  const { detectRAMTier } = await import('./models.js');

  console.log(chalk.bold.green('\n🌿 n0x diagnostics\n'));

  // Installation
  const installIcon = results.installation ? chalk.green('✓') : chalk.red('✗');
  console.log(`${installIcon} ${chalk.bold('Installation')}`);
  if (results.installation) {
    console.log(chalk.dim('  Binary: n0x (detected)'));
  }
  console.log();

  // Hardware
  const hwIcon = results.hardware ? chalk.green('✓') : chalk.red('✗');
  console.log(`${hwIcon} ${chalk.bold('Hardware')}`);
  const ramInfo = detectRAMTier();
  console.log(chalk.dim(`  Platform: ${process.platform} ${process.arch}`));
  console.log(chalk.dim(`  RAM: ${ramInfo.totalGB.toFixed(1)}GB total, ${ramInfo.freeGB.toFixed(1)}GB free`));
  console.log();

  // Model
  const modelIcon = results.model.exists ? chalk.green('✓') : chalk.red('✗');
  console.log(`${modelIcon} ${chalk.bold('Model')}`);
  if (results.model.backend) {
    console.log(chalk.dim(`  Backend: ${results.model.backend}`));
  }
  if (results.model.name) {
    console.log(chalk.dim(`  Name: ${results.model.name}`));
  }
  if (results.model.exists) {
    if (results.model.path) {
      console.log(chalk.dim(`  Path: ${results.model.path}`));
    }
    if (results.model.ramMB) {
      console.log(chalk.dim(`  RAM: ~${results.model.ramMB}MB`));
    }
    if (!results.model.path) {
      console.log(chalk.dim('  Status: Available from backend'));
    }
  } else {
    if (results.model.path) {
      console.log(chalk.yellow(`  Configured file not found: ${results.model.path}`));
    } else if (results.model.available?.length) {
      console.log(chalk.yellow('  Configured model was not returned by backend.'));
      console.log(chalk.dim(`  Available: ${results.model.available.slice(0, 5).join(', ')}`));
    } else if (results.model.backend && results.model.backend !== 'llama-cpp') {
      console.log(chalk.yellow('  Backend did not report this model.'));
    } else {
      console.log(chalk.yellow('  No model installed. Run: n0x setup'));
    }
  }
  console.log();

  // Server
  const serverIcon = results.server.running ? chalk.green('✓') : chalk.red('✗');
  console.log(`${serverIcon} ${chalk.bold('Server')}`);
  if (results.server.running) {
    console.log(chalk.dim(`  URL: ${results.server.url}`));
    console.log(chalk.dim(`  Status: Running`));
  } else {
    console.log(chalk.yellow('  Not running. Will auto-start on next run.'));
  }
  console.log();

  // Health
  if (results.health.toolCalling !== undefined) {
    const healthIcon = results.health.toolCalling && results.health.codeGen ? chalk.green('✓') : chalk.yellow('⚠');
    console.log(`${healthIcon} ${chalk.bold('Health Check')}`);
    console.log(chalk.dim(`  Tool calling: ${results.health.toolCalling ? 'PASS' : 'FAIL'}`));
    console.log(chalk.dim(`  Code generation: ${results.health.codeGen ? 'PASS' : 'FAIL'}`));
    console.log();
  }

  const healthChecked = results.health.toolCalling !== undefined || results.health.codeGen !== undefined;
  const healthGood = !healthChecked || Boolean(results.health.toolCalling && results.health.codeGen);
  const setupReady = results.installation && results.model.exists;
  if (setupReady && results.server.running && healthGood) {
    console.log(chalk.green.bold('All systems operational! 🚀\n'));
  } else if (setupReady && results.server.running && !healthGood) {
    console.log(chalk.yellow.bold('Backend reachable, but health checks failed.\n'));
  } else if (setupReady) {
    console.log(chalk.green.bold('Model configured. Server will auto-start on next run.\n'));
  } else {
    console.log(chalk.yellow.bold('Setup incomplete. Run: n0x setup\n'));
  }
}
