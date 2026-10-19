import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { ALLOC_FILE, ALLOC_ISOLATION, buildStagePlan } from '../scripts/testRunnerPlan.mjs';

const allocationStage = ['run', ALLOC_FILE, ...ALLOC_ISOLATION];

describe('scripts/test.mjs explicit allocation selection (round-4 F1)', () => {
  const explicitForms: Array<{ name: string; args: string[] }> = [
    {
      name: 'relative path with -t=FocusNavigator',
      args: ['./tests/zeroAllocation.test.ts', '-t=FocusNavigator'],
    },
    {
      name: 'absolute path with --testNamePattern=FocusNavigator',
      args: [path.resolve(process.cwd(), ALLOC_FILE), '--testNamePattern=FocusNavigator'],
    },
    {
      name: 'expanded positional list containing allocation file',
      args: ['tests/focusList.test.ts', 'tests/zeroAllocation.test.ts', '-t', 'FocusNavigator'],
    },
  ];

  for (const form of explicitForms) {
    it(`forwards the requested selection, then plans an unfiltered gate for ${form.name}`, () => {
      const plan = buildStagePlan(form.args);
      expect(plan.explicitlySelectsAlloc).toBe(true);
      expect(plan.stages).toHaveLength(2);
      expect(plan.stages[0]!.kind).toBe('forwarded-selection');
      expect(plan.stages[0]!.args).toEqual(['run', ...form.args, ...ALLOC_ISOLATION]);
      expect(plan.stages[1]).toEqual({ kind: 'allocation-gate', args: allocationStage });
      expect(plan.stages[1]!.args).not.toContain('-t');
      expect(plan.stages[1]!.args).not.toContain('--testNamePattern');
    });
  }
});
