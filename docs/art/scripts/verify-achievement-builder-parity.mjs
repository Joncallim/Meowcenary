#!/usr/bin/env node
/**
 * Render the Achievement Lua builder into an isolated temporary Pixelorama
 * project and compare it byte-for-byte with the committed editable source.
 * This closes builder -> PXO parity without rewriting the worktree.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const temporary = mkdtempSync(join(tmpdir(), 'meow-achievement-builder-'));
const generated = join(temporary, 'achievement-icons-atlas.pxo');
const committed = join(root, 'assets-src/achievements/source/achievement-icons-atlas.pxo');
try {
  execFileSync('lua', [
    'docs/art/scripts/validate-builders.lua',
    '--only', 'docs/art/scripts/build-achievement-icons-atlas.lua',
    '--write-to', generated,
  ], { cwd: root, stdio: 'pipe' });
  if (!readFileSync(generated).equals(readFileSync(committed))) {
    throw new Error('Achievement Pixelorama source is out of date with its deterministic builder');
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
