#!/usr/bin/env node
/** Non-mutating selected-source -> PXO/runtime parity for Mercenary identity art. */
import { execFileSync } from 'node:child_process';

execFileSync(
  'python3',
  ['docs/art/scripts/build-mercenary-identity-concept-atlas.py', '--check'],
  { stdio: 'pipe' },
);
