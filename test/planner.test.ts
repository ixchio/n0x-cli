import { describe, it, expect } from 'vitest';
import { formatPlan, advancePlan, type PlanStep } from '../src/agent/planner.js';

describe('formatPlan', () => {
  it('formats step statuses', () => {
    const steps: PlanStep[] = [
      { id: 1, task: 'Analyze', status: 'done' },
      { id: 2, task: 'Build', status: 'in_progress' },
      { id: 3, task: 'Test', status: 'pending' },
    ];
    const out = formatPlan(steps);
    expect(out).toContain('✓ 1. Analyze');
    expect(out).toContain('→ 2. Build');
    expect(out).toContain('○ 3. Test');
  });
});

describe('advancePlan', () => {
  it('marks step done after Bash success', () => {
    const steps: PlanStep[] = [
      { id: 1, task: 'Test', status: 'in_progress' },
      { id: 2, task: 'Next', status: 'pending' },
    ];
    advancePlan(steps, 'Bash', true);
    expect(steps[0].status).toBe('done');
    expect(steps[1].status).toBe('in_progress');
  });
});
