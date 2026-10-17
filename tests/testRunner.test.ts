import { describe, expect, it } from 'vitest';
import {
  ALLOC_FILE,
  ALLOC_ISOLATION,
  ART_VALIDATOR_NODE_TESTS,
  RUNNER_EXPLICIT_TESTS,
  RUNNER_TESTS,
  buildStagePlan,
  executeStagePlan,
} from '../scripts/testRunnerPlan.mjs';

const allocationStage = ['run', ALLOC_FILE, ...ALLOC_ISOLATION];

describe('scripts/test.mjs stateful allocation selection (F1)', () => {
  const ordinaryForms: Array<{ name: string; args: string[] }> = [
    { name: '-t name filter', args: ['-t', 'zeroAllocation'] },
    {
      name: 'allocation exclusion plus different name filter',
      args: ['--exclude', ALLOC_FILE, '-t', 'FocusNavigator'],
    },
    { name: 'ordinary file selection', args: ['tests/focusList.test.ts'] },
    { name: '--run flag', args: ['--run', '-t', 'wraps linear movement'] },
    { name: 'reporter flag', args: ['--reporter=dot', '-t', 'wraps linear movement'] },
  ];

  for (const form of ordinaryForms) {
    it(`always plans the unfiltered nine-test gate for ${form.name}`, () => {
      const plan = buildStagePlan(form.args);
      expect(plan.explicitlySelectsAlloc).toBe(false);
      expect(plan.stages).toHaveLength(2);
      expect(plan.stages[0]!.kind).toBe('ordinary-selection');
      expect(plan.stages[0]!.args).toContain('--exclude');
      expect(plan.stages[0]!.args).toContain(ALLOC_FILE);
      expect(plan.stages[0]!.args).toContain(RUNNER_TESTS);
      expect(plan.stages[0]!.args).toContain(RUNNER_EXPLICIT_TESTS);
      expect(plan.stages[0]!.args).toContain(ART_VALIDATOR_NODE_TESTS);
      expect(plan.stages[1]).toEqual({ kind: 'allocation-gate', args: allocationStage });
      expect(plan.stages[1]!.args).not.toContain('-t');
      expect(plan.stages[1]!.args).not.toContain('--testNamePattern');
      expect(plan.stages[1]!.args).not.toContain('--exclude');
    });
  }

  it('propagates an allocation-stage failure after planning the exact gate command', () => {
    const plan = buildStagePlan(['--exclude', ALLOC_FILE, '-t', 'FocusNavigator']);
    const calls: Array<{ kind: string; args: string[] }> = [];
    const result = executeStagePlan(plan, (args, kind) => {
      calls.push({ kind, args });
      return { status: kind === 'allocation-gate' ? 7 : 0 };
    });

    expect(result.status).toBe(7);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ kind: 'allocation-gate', args: allocationStage });
  });
});
