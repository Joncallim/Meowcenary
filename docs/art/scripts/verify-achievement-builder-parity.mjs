#!/usr/bin/env node
/**
 * Render the Achievement Lua builder into an isolated temporary Pixelorama
 * project and compare it byte-for-byte with the committed editable source.
 * This closes builder -> PXO parity without rewriting the worktree.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const temporary = mkdtempSync(join(tmpdir(), 'meow-achievement-builder-'));
const generated = join(temporary, 'achievement-icons-atlas.pxo');
const committed = join(root, 'assets-src/achievements/source/achievement-icons-atlas.pxo');

function archiveMembers(path) {
  return execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .sort();
}

function memberBytes(path, member) {
  return execFileSync('unzip', ['-p', path, member], { encoding: 'buffer' });
}

try {
  execFileSync('lua', [
    'docs/art/scripts/validate-builders.lua',
    '--only', 'docs/art/scripts/build-achievement-icons-atlas.lua',
    '--write-to', generated,
  ], { cwd: root, stdio: 'pipe' });
  // ZIP deflate streams are allowed to differ across the Ubuntu/zlib versions
  // used locally and in CI. Pixelorama project parity is the canonical member
  // set plus every member's exact bytes, not incidental container compression.
  const generatedMembers = archiveMembers(generated);
  const committedMembers = archiveMembers(committed);
  if (generatedMembers.join('\n') !== committedMembers.join('\n')) {
    throw new Error('Achievement Pixelorama source member set is out of date with its deterministic builder');
  }
  for (const member of committedMembers) {
    if (member.endsWith('/')) continue;
    if (!memberBytes(generated, member).equals(memberBytes(committed, member))) {
      throw new Error(`Achievement Pixelorama source member ${member} is out of date with its deterministic builder`);
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
