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
//      .test.ts, then tests/testRunnerExplicit.test.ts) UNGUARDED: they
//      re-spawn this runner under every selection form and assert all nine
//      allocation tests still execute. Every Vitest process spawned by this
//      runner carries MEOWCENARY_TEST_RUNNER_CHILD so those tests skip
//      themselves inside stages 1-3 of a nested runner — no recursion —
//      while the top-level stage 3 actually executes them. Stage 3 runs one
//      test per invocation: a whole-file invocation blocks one worker for
//      ~103s on GitHub's 2-core runner, deterministically tripping vitest's
//      hardcoded 60s worker RPC timeout (round-4 F1 guard was only fast
//      enough on the dev machine; round-5 CI hardening splits per test).
//      Every invocation's summary must show "Tests 1 passed" — vitest exits
//      0 with all tests skipped for a non-matching -t, so a renamed test
//      fails loudly instead of skipping the stage silently.
// An explicit selection naming the allocation file runs the user's requested
// selection first — still isolated, with the forwarded filter applied to it
// (round-4 F1: this used to satisfy the gate, so `-t=FocusNavigator` skipped
// all nine allocation tests and the runner exited 0). It NEVER satisfies the
// gate: after any successful forwarded request (relative path, absolute path,
// or an expanded glob containing the file), stage 2 below always re-runs the
// allocation file UNFILTERED in its isolated single fork, then stage 3 runs
// the runner's own subprocess regressions. The unfiltered CI path (`npm
// test`) runs stages 1-3 with the zero threshold and every canary unchanged.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitestBin = path.join(root, 'node_modules', '.bin', 'vitest');
const ALLOC_FILE = 'tests/zeroAllocation.test.ts';
const RUNNER_TESTS = 'tests/testRunner.test.ts';
const RUNNER_EXPLICIT_TESTS = 'tests/testRunnerExplicit.test.ts';
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
    stdio: options.capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : 'buffer',
    // Capture mode buffers the whole invocation output; bound it so a noisy
    // failure can never OOM or hit the 1MB default (ENOBUFS leaves status
    // null and the run would be misreported as name-pattern drift).
    maxBuffer: options.capture ? 32 * 1024 * 1024 : undefined,
    // tests/testRunner.test.ts skips itself inside every runner-spawned
    // Vitest process (recursion guard); the unguarded stage-3 invocation
    // below actually runs them.
    env: {
      ...process.env,
      ...(options.capture ? { NO_COLOR: '1' } : {}),
      ...(options.guard === false ? {} : { MEOWCENARY_TEST_RUNNER_CHILD: '1' }),
    },
  });
  if (options.capture) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
  }
  return {
    status: result.status ?? 1,
    output: options.capture ? `${result.stdout ?? ''}\n${result.stderr ?? ''}` : '',
    // Spawn-level failures (ENOENT, ENOBUFS, signal kill) leave status null;
    // surface them so the stage-3 guard can reject instead of misreading a
    // partial summary.
    error: result.error ? `${result.error.code ?? 'spawn-error'}: ${result.error.message}` : null,
    signal: result.signal ?? null,
  };
}

/** Escape a test name for use as a vitest --testNamePattern regex. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  // The user asked for the allocation file itself (relative path, absolute
  // path, or an expanded positional list containing it): run the requested
  // selection isolated so the user sees their chosen tests. This is NOT a
  // substitute for the gate — the forwarded filter (e.g. -t=FocusNavigator)
  // may skip every allocation test here, so stage 2 below unconditionally
  // re-runs the allocation file unfiltered afterwards (round-4 F1). Fail
  // fast on a real failure in the forwarded run: the gate would also fail
  // on a genuine regression.
  const explicitStatus = runVitest(['run', ...forwarded, ...ALLOC_ISOLATION]);
  if (explicitStatus.status !== 0) {
    process.exit(explicitStatus.status);
  }
} else {
  // Stage 1: the requested ordinary selection, allocation file and the
  // runner's own subprocess test files excluded.
  const mainStatus = runVitest([
    'run', '--exclude', ALLOC_FILE, '--exclude', RUNNER_TESTS,
    '--exclude', RUNNER_EXPLICIT_TESTS, ...forwarded,
  ]);
  if (mainStatus.status !== 0) {
    process.exit(mainStatus.status);
  }
}

// Stage 2: the full allocation gate in its isolated single fork, unfiltered
// so a forwarded name filter can never skip it.
const allocStatus = runVitest(['run', ALLOC_FILE, ...ALLOC_ISOLATION]);
if (allocStatus.status !== 0) {
  process.exit(allocStatus.status);
}

// Stage 3: the runner's own subprocess regression tests, unguarded so they
// execute at the top level of every run (round-3 F1). Stage 3 runs ONE test
// per invocation: a whole-file invocation blocks one worker for ~103s on
// GitHub's 2-core runner, deterministically tripping vitest's hardcoded 60s
// worker RPC timeout ("[vitest-worker]: Timeout calling onTaskUpdate") even
// when every test passes (round-5 CI infra finding — the round-4 two-file
// split was only fast enough on the dev machine). The -t pattern is escaped,
// and each invocation MUST show vitest's "Tests 1 passed" summary (the other
// tests in the file show as skipped): vitest exits 0 with every test SKIPPED
// when a -t pattern matches nothing, so a renamed test or a typo here fails
// loudly instead of silently bypassing the stage.
function runSubprocessSuite(file, names, expectedTotal) {
  // A NESTED runner (spawned by the subprocess tests themselves) carries BOTH
  // protocol markers — MEOWCENARY_TEST_RUNNER_CHILD and
  // MEOWCENARY_TEST_RUNNER_SPAWNED — and expects its stage-3 invocations to
  // come back all-skipped (the test files self-skip under the recursion
  // guard): any status-0 invocation is fine there. A top-level run with only
  // a leaked or preset CHILD marker is NOT nested: its stage-3 invocations
  // must each show exactly one test passed, or the stage fails loudly —
  // otherwise an external CHILD=1 would silently skip the whole subprocess
  // gate (round-5 Sol closing finding #2).
  const nestedRunner =
    process.env.MEOWCENARY_TEST_RUNNER_CHILD === '1' &&
    process.env.MEOWCENARY_TEST_RUNNER_SPAWNED === '1';
  for (const name of names) {
    const { status, output, error, signal } = runVitest(
      ['run', file, '-t', escapeRegExp(name)],
      { guard: false, capture: true },
    );
    // Exactly one test must have run, passed, AND the file must have exited
    // cleanly: vitest prints the passed summary and still exits non-zero on
    // teardown failures / unhandled worker errors (the original 60s-RPC
    // failure printed "Tests 5 passed" then exited 1 — round-5 Sol closing
    // finding #1). expectedTotal pins the file's test count so a renamed or
    // added test fails loudly instead of drifting into a different shape.
    const summary = output.match(/Tests\s+(\d+) passed(?: \| (\d+) skipped)? \((\d+)\)/);
    const ranExactlyOne = Boolean(summary) && summary[1] === '1' && summary[3] === String(expectedTotal);
    const ok = status === 0 && ranExactlyOne;
    const nestedSkipOk = nestedRunner && status === 0 && !error && !signal;
    if (!(ok || nestedSkipOk)) {
      console.error(
        `\n[test.mjs] stage-3 invocation did not behave as expected: '${name}'` +
        `\n[test.mjs] vitest status=${status}, summary=${summary ? summary[0] : 'none'}` +
        `${error ? `, spawn error=${error}` : ''}${signal ? `, signal=${signal}` : ''}` +
        '\n[test.mjs] A renamed test must update the name list below; the stage is never allowed to skip silently.',
      );
      process.exit(1);
    }
  }
  return 0;
}

runSubprocessSuite(RUNNER_TESTS, [
  'executes all nine allocation tests when a -t name filter is forwarded',
  'executes all nine allocation tests when an exclusion names the allocation file',
  'executes all nine allocation tests for an ordinary file selection',
  'executes all nine allocation tests when the --run flag is forwarded',
  'executes all nine allocation tests when a reporter flag is forwarded',
  'fails loudly when the recursion marker leaks without the spawn token',
], 6);
process.exit(runSubprocessSuite(RUNNER_EXPLICIT_TESTS, [
  'executes all nine allocation tests when a relative path selects the allocation file with -t=FocusNavigator',
  'executes all nine allocation tests when an absolute path selects the allocation file with --testNamePattern=FocusNavigator',
  'executes all nine allocation tests when an expanded positional list contains the allocation file',
], 3));
