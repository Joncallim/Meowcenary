import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Round-4 finding F1 subprocess gate: an EXPLICIT selection naming the
// allocation file (relative path, absolute path, or an expanded positional
// list containing it) must still enforce the gate. The runner forwards the
// user's filtered selection first (so the requested run happens exactly as
// asked — a -t/--testNamePattern filter is applied there and may skip every
// allocation test) and then ALWAYS re-runs the allocation file UNFILTERED in
// its isolated second stage, followed by the runner's own subprocess stage.
//
// The marker therefore requires the PASSED form of the allocation file's
// per-file summary line: a filtered run prints `(9 tests | 9 skipped)`, which
// must never satisfy the gate — and since the forwarded filtered run prints
// the skipped form BEFORE the unfiltered gate, the passed form must appear
// AFTER it. A skipped-only run (the round-4 bypass, where the runner exited
// after the forwarded request) fails both checks.
//
// This file lives separately from tests/testRunner.test.ts because the runner
// runs stage 3 as two sequential vitest invocations: all eight subprocess
// regressions in a single vitest run block one worker for ~65s, which
// deterministically trips vitest's 60s worker RPC timeout
// ("[vitest-worker]: Timeout calling onTaskUpdate") even though every test
// passes.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runner = path.join(root, 'scripts', 'test.mjs');

// The strict `(9 tests)` form structurally cannot match the skipped form
// `(9 tests | 9 skipped)` a filtered run prints — the gate is satisfied only
// when all nine tests actually executed, never when they were skipped.
const ALL_NINE_RAN = /zeroAllocation\.test\.ts \(9 tests\)/;
const ALL_NINE_SKIPPED = /zeroAllocation\.test\.ts \(9 tests \| 9 skipped\)/;

function runRunner(args: string[]) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: root,
    encoding: 'utf8',
    // Mark this spawn as a NESTED runner so its stage 3 runs the subprocess
    // tests with the recursion guard (they skip themselves), while the
    // top-level runner's stage 3 runs them for real. The marker MUST be
    // MEOWCENARY_TEST_RUNNER_CHILD — the exact env var the skip guard in
    // these files checks — or every nested runner's unguarded stage 3
    // re-runs the subprocess tests, each spawning another runner, infinitely.
    env: {
      ...process.env,
      NO_COLOR: '1',
      MEOWCENARY_TEST_RUNNER_CHILD: '1',
      MEOWCENARY_TEST_RUNNER_SPAWNED: '1',
    },
    timeout: 180_000,
  });
}

function expectAllocationGateRan(
  args: string[],
  form: string,
  options: { expectsForwardedFilteredRun?: boolean } = {},
) {
  const result = runRunner(args);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const tail = output.slice(-2000);
  expect(result.status, `${form}: runner must exit 0\n${tail}`).toBe(0);
  const passedIndex = output.search(ALL_NINE_RAN);
  expect(
    passedIndex,
    `${form}: all nine allocation tests must execute in the PASSED form in the isolated stage (a filtered run prints '(9 tests | 9 skipped)' and must never satisfy the gate)\n${tail}`,
  ).not.toBe(-1);
  if (options.expectsForwardedFilteredRun) {
    // The explicit branch forwards the user's filtered selection BEFORE the
    // unfiltered gate: the skipped form must appear, and the passed form must
    // come AFTER it — a skipped-only run (the round-4 bypass) fails here.
    const skippedIndex = output.search(ALL_NINE_SKIPPED);
    expect(
      skippedIndex,
      `${form}: the forwarded filtered run should print the skipped form\n${tail}`,
    ).not.toBe(-1);
    expect(
      passedIndex,
      `${form}: the unfiltered gate must run AFTER the forwarded filtered run\n${tail}`,
    ).toBeGreaterThan(skippedIndex);
  }
}

describe('scripts/test.mjs explicit allocation selection (round-4 F1)', () => {
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

  maybe('executes all nine allocation tests when a relative path selects the allocation file with -t=FocusNavigator', () => {
    expectAllocationGateRan(
      ['./tests/zeroAllocation.test.ts', '-t=FocusNavigator'],
      'relative path + -t=FocusNavigator',
      { expectsForwardedFilteredRun: true },
    );
  }, 240_000);

  maybe('executes all nine allocation tests when an absolute path selects the allocation file with --testNamePattern=FocusNavigator', () => {
    expectAllocationGateRan(
      [path.join(root, 'tests', 'zeroAllocation.test.ts'), '--testNamePattern=FocusNavigator'],
      'absolute path + --testNamePattern=FocusNavigator',
      { expectsForwardedFilteredRun: true },
    );
  }, 240_000);

  maybe('executes all nine allocation tests when an expanded positional list contains the allocation file', () => {
    // Shell-expanded glob `tests/*.test.ts -t FocusNavigator` lands here: the
    // ordinary file in the list runs in the forwarded request, the allocation
    // file's forwarded (filtered) run skips, and the unfiltered gate must
    // still run all nine behind it.
    expectAllocationGateRan(
      ['tests/focusList.test.ts', 'tests/zeroAllocation.test.ts', '-t', 'FocusNavigator'],
      'expanded positional list containing the allocation file',
      { expectsForwardedFilteredRun: true },
    );
  }, 240_000);
});
