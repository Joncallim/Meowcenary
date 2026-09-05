#!/usr/bin/env node
/**
 * Alpha 3 content authoring gate.  This deliberately composes the existing
 * validators and generic conformance suites rather than copying their rules
 * into another validator.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitest = path.join(root, 'node_modules', '.bin', 'vitest');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ['docs/art/scripts/validate-visual-art.mjs']);
run('lua', ['docs/art/scripts/validate-builders.lua']);
run(vitest, [
  'run',
  'tests/validateAllData.test.ts',
  'tests/stageConformance.test.ts',
  'tests/enemyBehaviors.test.ts',
  'tests/achievements.test.ts',
  'tests/gunsmith.test.ts',
  'tests/roster.test.ts',
  'tests/equipment.test.ts',
  'tests/progressionIntegration.test.ts',
]);
