import { describe, it, expect } from 'vitest';
import { applyUnifiedPatch, previewPatch } from '../src/lib/patch.js';

describe('patch', () => {
  it('applies unified diff', () => {
    const old = 'line1\nline2\nline3\n';
    const neu = 'line1\nLINE2\nline3\n';
    const patch = previewPatch('f.txt', old, neu);
    const result = applyUnifiedPatch(old, patch);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content).toBe(neu);
  });
});
