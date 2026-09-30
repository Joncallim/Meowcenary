#!/usr/bin/env node
/** Compatibility entry point for the selected-master Mercenary identity builder. */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--check')) {
  throw new Error('Usage: export-mercenary-identity-atlases.mjs [--check]');
}

const root = resolve(import.meta.dirname, '../../..');
const arguments_ = ['docs/art/scripts/build-mercenary-identity-concept-atlas.py'];
if (process.argv[2] === '--check') arguments_.push('--check');
execFileSync('python3', arguments_, { cwd: root, stdio: 'inherit' });
