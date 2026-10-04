#!/usr/bin/env node
// Retired compatibility entry point. It must never recreate the old category
// placeholders over the selected upgrade production candidates.
import { spawnSync } from 'node:child_process';

const result = spawnSync('python3', ['docs/art/scripts/build-upgrade-production-art.py', '--check'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('The former placeholder generator is retired; pinned upgrade production art passed its check.');
