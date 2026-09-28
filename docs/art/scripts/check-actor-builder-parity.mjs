#!/usr/bin/env node
/** Enforce builder -> editable PXO parity for every player-reachable actor. */
import { execFileSync } from 'node:child_process';

const characters = [
  'scrap-tabby', 'bolt-hound', 'volt-lynx', 'brass-boar', 'ember-cougar',
  'scrap-weasel', 'rattle-raptor', 'piston-ram',
];

for (const actor of characters) {
  execFileSync('lua', [
    'docs/art/scripts/validate-builders.lua',
    '--only', `docs/art/scripts/build-${actor}.lua`,
    '--check-source',
  ], { stdio: 'inherit' });
}

// Enemy artwork is imported from the selected production masters by one
// deterministic family builder. The old per-enemy geometric builders remain
// as history, but are no longer allowed to overwrite the approved PXO sheets.
execFileSync('python3', ['docs/art/scripts/build-enemy-production-art.py', '--check'], { stdio: 'inherit' });
execFileSync('python3', ['docs/art/scripts/export-enemy-pxo-fallback.py', '--check'], { stdio: 'inherit' });
