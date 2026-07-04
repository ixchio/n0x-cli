#!/usr/bin/env node
import { createCli, handleCliError } from './cli.js';

function normalizeHelpArgv(argv: string[]): string[] {
  const prefix = argv.slice(0, 2);
  const args = argv.slice(2);
  const normalizedArgs = args.map((arg) => arg.toLowerCase());

  if (
    normalizedArgs.length === 1 &&
    ['-help', '-hlep', '--hlep', '-?', 'help'].includes(normalizedArgs[0]!)
  ) {
    return [...prefix, '--help'];
  }

  if (
    normalizedArgs.length === 2 &&
    normalizedArgs[0] === '-' &&
    ['help', 'hlep'].includes(normalizedArgs[1]!)
  ) {
    return [...prefix, '--help'];
  }

  return argv;
}

createCli()
  .parseAsync(normalizeHelpArgv(process.argv))
  .catch(handleCliError);
