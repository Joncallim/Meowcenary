#!/usr/bin/env node
// Test runner for the Epic 19 §6 zero-allocation gate (round-3 finding F1).
//
// The allocation-file selection must be detected STATEFULLY. The round-2
// `arg.includes('zeroAllocation')` check mistook option VALUES and EXCLUSIONS
// for explicit allocation-file selection:
//   - `npm test -- -t "zeroAllocation"` ran Vitest with the name filter
//     applied to the allocation file — all nine allocation tests skipped and
//     the gate exited 0 (GATE BYPASSED);
//   - `npm test -- --exclude tests/zeroAllocation.test.ts -t "FocusNavigator"`
//     skipped the allocation stage entirely (GATE BYPASSED).
//
// This parser walks the forwarded arguments and recognizes an explicit
// allocation selection ONLY when an exact normalized POSITIONAL file path
// resolves to tests/zeroAllocation.test.ts. -t/--testNamePattern and
// --exclude values are consumed as option values and never classified as file
// selections, so every filtered/excluded/ordinary invocation still runs the
// allocation file UNFILTERED in its isolated single fork. Unknown long/short
// options conservatively consume a following value — that direction can only
// over-run the allocation stage (stage 2 below), never skip it.
//
//   1. Run the requested ordinary Vitest selection with the allocation file
//      and the runner's own subprocess tests excluded, so a forwarded `-t`
//      filter reaches only the ordinary suite.
//   2. Run the allocation file isolated (single fork) WITHOUT any unrelated
//      name filter — the gate must never be skipped by a name selection.
//   3. Run the runner's own subprocess regression tests (tests/testRunner
//      .test.ts) UNGUARDED: they re-spawn this runner under every selection
//      form and assert all nine allocation tests still execute. Every Vitest
//      process spawned by this runner carries MEOWCENARY_TEST_RUNNER_CHILD so
//      those tests skip themselves inside stages 1-3 of a nested runner —
//      no recursion — while the top-level stage 3 actually executes them.
// An explicit selection naming the allocation file runs only that file,
// still isolated, with the forwarded filter applied to it. The unfiltered CI
// path (`npm test`) runs stages 1-3 with the zero threshold and every canary
// unchanged.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitestBin = path.join(root, 'node_modules', '.bin', 'vitest');
const ALLOC_FILE = 'tests/zeroAllocation.test.ts';
const RUNNER_TESTS = 'tests/testRunner.test.ts';
const ALLOC_ISOLATION = ['--pool=forks', '--poolOptions.forks.singleFork'];

/** Options that take NO following value (pure flags). Unknown long options
 *  are conservatively treated as value-taking so their values can never be
 *  mistaken for file selections. */
const FLAG_OPTIONS = new Set([
  '--run', '--watch', '-w', '--no-color', '--silent', '--help', '-h',
  '--version', '-v', '--passWithNoTests', '--allowOnly', '--no-coverage',
  '--update', '-u', '--no-watch', '--isolate', '--no-isolate', '--globals',
  '--no-globals', '--disable-console-intercept', '--reject-unknown-options',
  '--no-file-parallelism', '--browser.headless', '--no-browser',
  '--sequence.shuffle', '--sequence.concurrent', '--changed',
  '--poolOptions.forks.singleFork', '--poolOptions.forks.isolate',
  '--poolOptions.threads.singleThread', '--poolOptions.threads.isolate',
  '--poolOptions.vmThreads.singleThread', '--poolOptions.vmThreads.isolate',
]);

/** Short pure flags. Any other short option consumes the next argument. */
const SHORT_FLAGS = new Set(['-w', '-u', '-h', '-v']);

function runVitest(args, options = {}) {
  const result = spawnSync(vitestBin, args, {
    cwd: root,
    stdio: 'inherit',
    // tests/testRunner.test.ts skips itself inside every runner-spawned
    // Vitest process (recursion guard); the unguarded stage-3 invocation
    // below actually runs them.
    env: {
      ...process.env,
      ...(options.guard === false ? {} : { MEOWCENARY_TEST_RUNNER_CHILD: '1' }),
    },
  });
  return result.status ?? 1;
}

/** Stateful scan of the forwarded arguments. Returns the positional file
 *  selections and the -t/--exclude values, never mistaking an option value
 *  for a file selection. */
function parseForwarded(rawArgs) {
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
  const positional = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--') {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        // `--name=value`: the value is never a file selection.
        i += 1;
        continue;
      }
      if (FLAG_OPTIONS.has(arg)) {
        i += 1;
        continue;
      }
      // Value-taking long option (including -t/--testNamePattern and
      // --exclude): consume its value so it is never read as a selection.
      i += 2;
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      if (SHORT_FLAGS.has(arg)) {
        i += 1;
        continue;
      }
      // -t/--testNamePattern and any other value-taking short option.
      i += 2;
      continue;
    }
    positional.push(arg);
    i += 1;
  }
  return positional;
}

/** An explicit allocation selection is an exact normalized positional file
 *  path that resolves to tests/zeroAllocation.test.ts — nothing else. */
function isExplicitAllocSelection(arg) {
  try {
    return path.resolve(root, arg) === path.resolve(root, ALLOC_FILE);
  } catch {
    return false;
  }
}

const forwardedRaw = process.argv.slice(2);
const forwarded = forwardedRaw[0] === '--' ? forwardedRaw.slice(1) : forwardedRaw;
const positional = parseForwarded(forwardedRaw);
const explicitlySelectsAlloc = positional.some(isExplicitAllocSelection);

if (explicitlySelectsAlloc) {
  // The user asked for the allocation file itself: run it isolated with the
  // forwarded selection/filter applied, and nothing else.
  process.exit(runVitest(['run', ...forwarded, ...ALLOC_ISOLATION]));
}

// Stage 1: the requested ordinary selection, allocation file and runner's own
// subprocess tests excluded.
const mainStatus = runVitest([
  'run', '--exclude', ALLOC_FILE, '--exclude', RUNNER_TESTS, ...forwarded,
]);
if (mainStatus !== 0) {
  process.exit(mainStatus);
}

// Stage 2: the full allocation gate in its isolated single fork, unfiltered
// so a forwarded name filter can never skip it.
const allocStatus = runVitest(['run', ALLOC_FILE, ...ALLOC_ISOLATION]);
if (allocStatus !== 0) {
  process.exit(allocStatus);
}

// Stage 3: the runner's own subprocess regression tests, unguarded so they
// execute at the top level of every run (round-3 F1).
process.exit(runVitest(['run', RUNNER_TESTS], { guard: false }));
