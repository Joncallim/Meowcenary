# Meowcenary

A browser-first roguelite survivor about an over-armed animal mercenary building ridiculous weapons from scrap.

Meowcenary is inspired by the accessible loops of Gun Hero, Archero, and Vampire Survivors, but it is not a clone. The product direction is: simple controls, automatic combat, quick runs, readable upgrades, data-driven balancing, and no ads or paid progression.

## Design Goals

- Browser-first, mobile-friendly, desktop-compatible.
- No advertisements, energy systems, pay-to-win, timers, or forced monetisation loops.
- Very low skill floor: movement, positioning, and upgrade choices should matter more than twitch aiming.
- Short sessions with strong meta progression.
- Data-driven tuning for weapons, enemies, upgrades, loot, and spawn curves.
- AI-agent-friendly architecture with small feature slices and clear acceptance criteria.

## Tech Stack

- Phaser 3 for the game runtime.
- TypeScript for game logic and data contracts.
- Vite for local development and builds.
- Vitest for tests.
- LocalStorage first for settings and saves, with IndexedDB reserved for larger save payloads later.

## AI Workflow

The repository is structured for an architecture-first handoff:

1. Opus Supercode produces feature architecture: interfaces, state flow, data model, acceptance criteria, and implementation boundaries.
2. GPT-5.5 implements the feature and focused tests.
3. Codex handles repository integration, refactors, CI cleanup, and regression review.
4. Human playtesting decides whether the mechanic is fun enough to keep.

## Product Pillars

- **Move, shoot, survive:** The first loop must be playable before deeper systems are added.
- **No aiming burden:** Combat is automatic. Player decisions come from movement, build choices, and merge/upgrades.
- **Readable chaos:** Effects can become intense, but enemy intent and player danger must stay clear.
- **Balance as data:** Stats live in JSON under `src/data/` wherever possible.
- **Small shippable slices:** Every feature should be testable and playable in isolation.

## Repository Layout

```text
src/
  data/          Data-driven gameplay definitions
  engine/        Engine-level helpers and adapters
  entities/      Player, enemies, projectiles, drops
  gameplay/      Run state, progression, combat rules
  scenes/        Phaser scenes
  systems/       Input, save, spawning, upgrades, weapons
  ui/            HUD and menus

docs/
  architecture.md
  roadmap.md
  vision.md
```

## Local Development

```bash
npm install
npm run dev
```

## Scripts

```bash
npm run dev       # Start Vite dev server
npm run build     # Type-check and build production assets
npm run test      # Run Vitest
npm run lint      # Type-check without emitting files
```

## Current Scope

The initial milestone is a no-ads MVP:

- One arena.
- One playable character.
- Automatic firing.
- Enemy waves.
- XP and level-up choices.
- Basic weapon definitions.
- Basic upgrade cards.
- Local run completion and save shell.

Paid upgrades, ads, subscriptions, online accounts, and social features are explicitly out of scope for now.
