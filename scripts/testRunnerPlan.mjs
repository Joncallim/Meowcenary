import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ALLOC_FILE = 'tests/zeroAllocation.test.ts';
export const RUNNER_TESTS = 'tests/testRunner.test.ts';
export const RUNNER_EXPLICIT_TESTS = 'tests/testRunnerExplicit.test.ts';
export const RUNNER_EXECUTABLE_TESTS = 'tests/testRunnerExecutable.test.ts';
// Validator tooling uses Node's native test runner. Keep its fixture suite
// out of Vitest discovery; `npm run art:validate` executes it explicitly.
export const ART_VALIDATOR_NODE_TESTS = 'docs/art/scripts/**/*.test.mjs';
export const ALLOC_ISOLATION = ['--pool=forks', '--poolOptions.forks.singleFork'];

/** Options that take NO following value (pure flags). Unknown long options
 * are conservatively treated as value-taking so their values can never be
 * mistaken for file selections. */
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

/** Stateful scan of forwarded arguments. */
export function parseForwarded(rawArgs) {
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
 * path that resolves to tests/zeroAllocation.test.ts — nothing else. */
export function isExplicitAllocSelection(arg, root = SCRIPT_ROOT) {
  try {
    return path.resolve(root, arg) === path.resolve(root, ALLOC_FILE);
  } catch {
    return false;
  }
}

/** Build the two mandatory Vitest stages without executing them. The second
 * stage is always an exact, unfiltered allocation-file command. */
export function buildStagePlan(rawArgs, root = SCRIPT_ROOT) {
  const forwardedRaw = [...rawArgs];
  const forwarded = forwardedRaw[0] === '--' ? forwardedRaw.slice(1) : forwardedRaw;
  const positional = parseForwarded(forwardedRaw);
  const explicitlySelectsAlloc = positional.some((arg) => isExplicitAllocSelection(arg, root));
  const stageOne = explicitlySelectsAlloc
    ? {
      kind: 'forwarded-selection',
      args: ['run', ...forwarded, ...ALLOC_ISOLATION],
    }
    : {
      kind: 'ordinary-selection',
      args: [
        'run', '--exclude', ALLOC_FILE, '--exclude', RUNNER_TESTS,
        '--exclude', RUNNER_EXPLICIT_TESTS, '--exclude', RUNNER_EXECUTABLE_TESTS,
        '--exclude', ART_VALIDATOR_NODE_TESTS,
        ...forwarded,
      ],
    };
  return {
    forwarded,
    positional,
    explicitlySelectsAlloc,
    stages: [
      stageOne,
      { kind: 'allocation-gate', args: ['run', ALLOC_FILE, ...ALLOC_ISOLATION] },
    ],
  };
}

/** Execute the planned stage commands through an injected executor. The real
 * runner uses runVitest; tests use a deterministic fake to prove omission and
 * failure propagation without spawning the GC-sensitive gate recursively. */
export function executeStagePlan(plan, execute) {
  for (const stage of plan.stages) {
    const result = execute(stage.args, stage.kind);
    if (result.status !== 0) return result;
  }
  return { status: 0 };
}
