#!/usr/bin/env node
// Test runner for the Epic 19 §6 zero-allocation gate (round-3 finding F1).
//
// testRunnerPlan.mjs owns the pure argument scan and the two-stage plan. This
// executable keeps the authoritative behavior explicit:
//   1. run the requested selection, excluding the allocation and runner files;
//   2. run tests/zeroAllocation.test.ts unfiltered in a single fork;
//   3. run deterministic forwarding/propagation tests.
//
// The allocation stage is never skipped because a caller supplies -t,
// --testNamePattern, --exclude, an ordinary file, or an explicit allocation
// path. A failing stage exits nonzero before stage 3.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RUNNER_EXECUTABLE_TESTS,
  buildStagePlan,
  executeStagePlan,
} from './testRunnerPlan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitestBin = path.join(root, 'node_modules', '.bin', 'vitest');
const RUNNER_TESTS = 'tests/testRunner.test.ts';
const RUNNER_EXPLICIT_TESTS = 'tests/testRunnerExplicit.test.ts';

export function runTestRunner(rawArgs = process.argv.slice(2), { spawn = spawnSync } = {}) {
  function runVitest(args) {
    const result = spawn(vitestBin, args, {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        // Preserve the historical guard marker for any runner-aware fixtures;
        // the forwarding tests themselves no longer recursively spawn a runner.
        MEOWCENARY_TEST_RUNNER_CHILD: '1',
      },
    });
    return { status: result.status ?? 1 };
  }

  const stagePlan = buildStagePlan(rawArgs, root);
  const stageResult = executeStagePlan(stagePlan, (args) => runVitest(args));
  if (stageResult.status !== 0) {
    return stageResult.status;
  }

  // Stage 3 is deterministic planner/executor coverage. The real allocation
  // gate above remains the only authoritative nine-test execution in this run,
  // avoiding recursive GC-sensitive probes inside Vitest workers.
  return runVitest(['run', RUNNER_TESTS, RUNNER_EXPLICIT_TESTS, RUNNER_EXECUTABLE_TESTS]).status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runTestRunner());
}
