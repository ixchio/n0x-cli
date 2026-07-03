import { basename } from 'node:path';
import chalk from 'chalk';

export interface RunStatusLineOptions {
  model: string;
  backend: string;
  mode: string;
  cwd: string;
  maxSteps: number;
  checkpointId?: string;
}

export interface RunStatusUpdate {
  phase?: string;
  step?: number;
  maxSteps?: number;
  contextPercent?: number;
  approxTokens?: number;
  tool?: string;
}

export class RunStatusLine {
  private readonly enabled = Boolean(process.stderr.isTTY && !process.env.CI);
  private readonly state: Required<RunStatusUpdate>;
  private readonly cwdName: string;

  constructor(private readonly options: RunStatusLineOptions) {
    this.cwdName = basename(options.cwd) || options.cwd;
    this.state = {
      phase: 'starting',
      step: 0,
      maxSteps: options.maxSteps,
      contextPercent: 0,
      approxTokens: 0,
      tool: '',
    };
  }

  update(update: RunStatusUpdate): void {
    Object.assign(this.state, update);
    this.render();
  }

  clear(): void {
    if (!this.enabled) return;
    process.stderr.write('\r\x1b[2K');
  }

  render(): void {
    if (!this.enabled) return;

    const width = Math.max(40, process.stderr.columns ?? 100);
    const checkpoint = this.options.checkpointId ? ` | ckpt ${this.options.checkpointId.slice(0, 18)}` : '';
    const tool = this.state.tool ? ` | ${this.state.tool}` : '';
    const text = [
      'n0x',
      this.state.phase,
      `step ${this.state.step}/${this.state.maxSteps}`,
      `ctx ${Math.round(this.state.contextPercent)}%`,
      `~${formatNumber(this.state.approxTokens)} tok`,
      this.options.model,
      this.options.backend,
      this.options.mode,
      this.cwdName,
    ].join(' | ') + tool + checkpoint;

    const truncated = text.length > width - 1 ? `${text.slice(0, width - 2)}…` : text;
    process.stderr.write(`\r\x1b[2K${chalk.dim(truncated)}`);
  }

  log(message = ''): void {
    this.clear();
    if (message) console.log(message);
    this.render();
  }

  stop(): void {
    this.clear();
  }
}

function formatNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
