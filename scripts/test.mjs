#!/usr/bin/env node
// Test runner for the Epic 19 §6 zero-allocation gate (round-2 finding F5).
//
// The old `vitest run --exclude tests/zeroAllocation.test.ts && vitest run
// tests/zeroAllocation.test.ts ...` script broke npm argument propagation:
// `npm test -- -t "<name>"` appended the filter only to the SECOND command,
// so the ordinary suite ran unfiltered and the allocation file was skipped by
// the name filter.
//
// This runner parses the forwarded arguments itself:
//   1. Run the requested ordinary Vitest selection with the allocation file
//      excluded, so a forwarded `-t` filter reaches only the ordinary suite.
//   2. Run the allocation file isolated (single fork) WITHOUT any unrelated
//      name filter — the gate must never be skipped by a name selection.
//   3. An explicit selection naming the allocation file runs only that file,
//      still isolated, with the forwarded filter applied to it.
// The unfiltered CI path (`npm test`) still runs BOTH stages with the zero
// threshold and every canary unchanged.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitestBin = path.join(root, 'node_modules', '.bin', 'vitest');
const ALLOC_FILE = 'tests/zeroAllocation.test.ts';
const ALLOC_ISOLATION = ['--pool=forks', '--poolOptions.forks.singleFork'];

function runVitest(args) {
  const result = spawnSync(vitestBin, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  return result.status ?? 1;
}

const forwardedRaw = process.argv.slice(2);
// `npm test -- -t "..."` forwards `-t "..."`; a direct
// `node scripts/test.mjs -- -t "..."` forwards the `--` too. Vitest treats a
// leading `--` as the end of its option parsing, which silently drops the
// name filter, so normalize it away.
const forwarded = forwardedRaw[0] === '--' ? forwardedRaw.slice(1) : forwardedRaw;
const explicitlySelectsAlloc = forwarded.some((arg) => arg.includes('zeroAllocation'));

if (explicitlySelectsAlloc) {
  // The user asked for the allocation file itself: run it isolated with the
  // forwarded selection/filter applied, and nothing else.
  process.exit(runVitest(['run', ...forwarded, ...ALLOC_ISOLATION]));
}

// Stage 1: the requested ordinary selection, allocation file excluded.
const mainStatus = runVitest(['run', '--exclude', ALLOC_FILE, ...forwarded]);
if (mainStatus !== 0) {
  process.exit(mainStatus);
}

// Stage 2: the full allocation gate in its isolated single fork, unfiltered
// so a forwarded name filter can never skip it.
process.exit(runVitest(['run', ALLOC_FILE, ...ALLOC_ISOLATION]));
