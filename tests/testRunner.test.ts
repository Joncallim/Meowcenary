import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Round-3 finding F1 subprocess gate: the allocation-file selection in
// scripts/test.mjs must be detected STATEFULLY. Every non-explicit invocation
// form must still execute ALL NINE allocation tests in the runner's isolated
// second stage — a forwarded -t value, an --exclude value, an ordinary file
// selection, --run, or a reporter flag must never be mistaken for an explicit
// allocation selection (which would skip the allocation stage).
//
// The marker is the second stage's own file-summary line: the allocation file
// is EXCLUDED from stage 1, so `zeroAllocation.test.ts (9 tests)` can only be
// printed by the isolated allocation stage after all nine tests executed.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runner = path.join(root, 'scripts', 'test.mjs');

const ALL_NINE_RAN = /zeroAllocation\.test\.ts \(9 tests\)/;

function runRunner(args: string[]) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: root,
    encoding: 'utf8',
    // Mark this spawn as a NESTED runner so its stage 3 runs the subprocess
    // tests with the recursion guard (they skip themselves), while the
    // top-level runner's stage 3 runs them for real. The marker MUST be
    // MEOWCENARY_TEST_RUNNER_CHILD — the exact env var the skip guard in this
    // file checks — or every nested runner's unguarded stage 3 re-runs the
    // subprocess tests, each spawning another runner, infinitely (the
    // round-3 F1 recursion the fixer died on).
    env: {
      ...process.env,
      NO_COLOR: '1',
      MEOWCENARY_TEST_RUNNER_CHILD: '1',
      MEOWCENARY_TEST_RUNNER_SPAWNED: '1',
    },
    timeout: 180_000,
  });
}

function expectAllocationGateRan(args: string[], form: string) {
  const result = runRunner(args);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const tail = output.slice(-2000);
  expect(result.status, `${form}: runner must exit 0\n${tail}`).toBe(0);
  expect(
    output.match(ALL_NINE_RAN),
    `${form}: all nine allocation tests must execute in the isolated stage\n${tail}`,
  ).not.toBeNull();
}

describe('scripts/test.mjs stateful allocation selection (F1)', () => {
  // The runner marks every Vitest process it spawns with
  // MEOWCENARY_TEST_RUNNER_CHILD; inside those child processes this file
  // skips itself so `npm test` cannot recurse into the runner (the
  // subprocess tests run exactly once, in the top-level suite).
  const isRunnerChild = process.env.MEOWCENARY_TEST_RUNNER_CHILD === '1';

  function maybe(name: string, fn: () => void, timeout?: number) {
    if (isRunnerChild) {
      it.skip(name, fn, timeout);
    } else {
      it(name, fn, timeout);
    }
  }

  maybe('executes all nine allocation tests when a -t name filter is forwarded', () => {
    expectAllocationGateRan(['-t', 'zeroAllocation'], '-t "zeroAllocation"');
  }, 240_000);

  maybe('executes all nine allocation tests when an exclusion names the allocation file', () => {
    expectAllocationGateRan(
      ['--exclude', 'tests/zeroAllocation.test.ts', '-t', 'FocusNavigator'],
      '--exclude tests/zeroAllocation.test.ts -t "FocusNavigator"',
    );
  }, 240_000);

  maybe('executes all nine allocation tests for an ordinary file selection', () => {
    expectAllocationGateRan(['tests/focusList.test.ts'], 'ordinary file selection');
  }, 240_000);

  maybe('executes all nine allocation tests when the --run flag is forwarded', () => {
    expectAllocationGateRan(['--run', '-t', 'wraps linear movement'], '--run flag');
  }, 240_000);

  maybe('executes all nine allocation tests when a reporter flag is forwarded', () => {
    expectAllocationGateRan(['--reporter=dot', '-t', 'wraps linear movement'], 'reporter flag');
  }, 240_000);
});
