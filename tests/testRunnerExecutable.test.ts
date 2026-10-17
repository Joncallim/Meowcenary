import { describe, expect, it } from 'vitest';
import { runTestRunner } from '../scripts/test.mjs';

const EXPECTED_ALLOCATION_STAGE = [
  'run',
  'tests/zeroAllocation.test.ts',
  '--pool=forks',
  '--poolOptions.forks.singleFork',
];
const EXPECTED_RUNNER_STAGE = [
  'run',
  'tests/testRunner.test.ts',
  'tests/testRunnerExplicit.test.ts',
  'tests/testRunnerExecutable.test.ts',
];
const RUNNER_VITEST_BIN = 'node_modules/.bin/vitest';

type SpawnCall = {
  file: string;
  args: string[];
  options: {
    cwd: string;
    stdio: 'inherit';
    env: Record<string, string | undefined>;
  };
};

function mockedSpawn(statuses: Array<number | null>) {
  const calls: SpawnCall[] = [];
  return {
    calls,
    spawn: (file: string, args: string[], options: SpawnCall['options']) => {
      calls.push({ file, args, options });
      return { status: statuses.shift() ?? null };
    },
  };
}

function expectAllocationStage(call: SpawnCall) {
  expect(call.file.endsWith(RUNNER_VITEST_BIN)).toBe(true);
  expect(call.args).toEqual(EXPECTED_ALLOCATION_STAGE);
}

describe('scripts/test.mjs executable stage ordering', () => {
  const successfulSelections: Array<{ name: string; args: string[]; firstStage: string[] }> = [
    {
      name: 'ordinary selection',
      args: [],
      firstStage: [
        'run',
        '--exclude', 'tests/zeroAllocation.test.ts',
        '--exclude', 'tests/testRunner.test.ts',
        '--exclude', 'tests/testRunnerExplicit.test.ts',
        '--exclude', 'tests/testRunnerExecutable.test.ts',
        '--exclude', 'docs/art/scripts/**/*.test.mjs',
      ],
    },
    {
      name: 'name filter',
      args: ['-t', 'FocusNavigator'],
      firstStage: [
        'run',
        '--exclude', 'tests/zeroAllocation.test.ts',
        '--exclude', 'tests/testRunner.test.ts',
        '--exclude', 'tests/testRunnerExplicit.test.ts',
        '--exclude', 'tests/testRunnerExecutable.test.ts',
        '--exclude', 'docs/art/scripts/**/*.test.mjs',
        '-t', 'FocusNavigator',
      ],
    },
    {
      name: 'exclude plus name filter',
      args: ['--exclude', 'tests/focusList.test.ts', '-t', 'FocusNavigator'],
      firstStage: [
        'run',
        '--exclude', 'tests/zeroAllocation.test.ts',
        '--exclude', 'tests/testRunner.test.ts',
        '--exclude', 'tests/testRunnerExplicit.test.ts',
        '--exclude', 'tests/testRunnerExecutable.test.ts',
        '--exclude', 'docs/art/scripts/**/*.test.mjs',
        '--exclude', 'tests/focusList.test.ts',
        '-t', 'FocusNavigator',
      ],
    },
    {
      name: 'explicit allocation path',
      args: ['tests/zeroAllocation.test.ts', '-t', 'FocusNavigator'],
      firstStage: [
        'run',
        'tests/zeroAllocation.test.ts',
        '-t', 'FocusNavigator',
        '--pool=forks',
        '--poolOptions.forks.singleFork',
      ],
    },
  ];

  for (const selection of successfulSelections) {
    it(`runs the requested ${selection.name}, then the exact unfiltered gate`, () => {
      const mock = mockedSpawn([0, 0, 0]);

      expect(runTestRunner(selection.args, { spawn: mock.spawn })).toBe(0);
      expect(mock.calls).toHaveLength(3);
      expect(mock.calls[0]!.args).toEqual(selection.firstStage);
      expectAllocationStage(mock.calls[1]!);
      expect(mock.calls[2]!.args).toEqual(EXPECTED_RUNNER_STAGE);
    });
  }

  it('stops after a main-stage failure and omits both later stages', () => {
    const mock = mockedSpawn([13]);

    expect(runTestRunner(['-t', 'FocusNavigator'], { spawn: mock.spawn })).toBe(13);
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]!.args).not.toEqual(EXPECTED_ALLOCATION_STAGE);
  });

  it('propagates allocation-stage failure and omits the runner stage', () => {
    const mock = mockedSpawn([0, 17]);

    expect(runTestRunner(['-t', 'FocusNavigator'], { spawn: mock.spawn })).toBe(17);
    expect(mock.calls).toHaveLength(2);
    expectAllocationStage(mock.calls[1]!);
  });

  it('propagates runner-stage failure after both preceding stages pass', () => {
    const mock = mockedSpawn([0, 0, 19]);

    expect(runTestRunner([], { spawn: mock.spawn })).toBe(19);
    expect(mock.calls).toHaveLength(3);
    expectAllocationStage(mock.calls[1]!);
    expect(mock.calls[2]!.args).toEqual(EXPECTED_RUNNER_STAGE);
  });

  const nullSpawnCases: Array<{ name: string; statuses: Array<number | null>; expectedCalls: number }> = [
    { name: 'main stage', statuses: [null], expectedCalls: 1 },
    { name: 'allocation stage', statuses: [0, null], expectedCalls: 2 },
    { name: 'runner stage', statuses: [0, 0, null], expectedCalls: 3 },
  ];

  for (const scenario of nullSpawnCases) {
    it(`treats a null spawn status as failure in the ${scenario.name}`, () => {
      const mock = mockedSpawn(scenario.statuses);

      expect(runTestRunner([], { spawn: mock.spawn })).toBe(1);
      expect(mock.calls).toHaveLength(scenario.expectedCalls);
      if (scenario.expectedCalls >= 2) expectAllocationStage(mock.calls[1]!);
      if (scenario.expectedCalls === 3) expect(mock.calls[2]!.args).toEqual(EXPECTED_RUNNER_STAGE);
    });
  }
});
