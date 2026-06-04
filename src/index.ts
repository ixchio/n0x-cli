#!/usr/bin/env node
import { createCli, handleCliError } from './cli.js';

createCli()
  .parseAsync(process.argv)
  .catch(handleCliError);
