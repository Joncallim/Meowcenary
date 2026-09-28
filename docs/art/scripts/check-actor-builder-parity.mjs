#!/usr/bin/env node
/** Enforce builder -> editable PXO parity for every player-reachable actor. */
import { execFileSync } from 'node:child_process';

const actors = [
  'scrap-tabby', 'bolt-hound', 'volt-lynx', 'brass-boar', 'ember-cougar',
  'scrap-weasel', 'rattle-raptor', 'piston-ram',
  'dust-mite', 'junk-rusher', 'trash-brute', 'scrap-sniper', 'scrap-skitter',
  'bastion-beetle', 'junk-nester', 'shard-bot', 'boss-crusher', 'boss-forge',
];

for (const actor of actors) {
  execFileSync('lua', [
    'docs/art/scripts/validate-builders.lua',
    '--only', `docs/art/scripts/build-${actor}.lua`,
    '--check-source',
  ], { stdio: 'inherit' });
}
