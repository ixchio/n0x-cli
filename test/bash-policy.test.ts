import { describe, it, expect } from 'vitest';
import { assertBashAllowed } from '../src/tools/bash-policy.js';
import { N0xError } from '../src/lib/errors.js';

describe('assertBashAllowed', () => {
  it('allows safe commands', () => {
    expect(() => assertBashAllowed('npm test')).not.toThrow();
    expect(() => assertBashAllowed('git status')).not.toThrow();
  });

  it('blocks rm -rf /', () => {
    expect(() => assertBashAllowed('rm -rf /')).toThrow(N0xError);
  });

  it('blocks fork bomb pattern', () => {
    expect(() => assertBashAllowed(':(){ :|:& };:')).toThrow(N0xError);
  });
});
