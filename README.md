# Meowcenary

A browser-first roguelite survivor about heavily armed animal mercenaries fighting through a junkyard, collecting scrap, and turning increasingly stupid weapons into increasingly effective ones.

Combat is automatic. The player controls movement, positioning, build choices, equipment and progression rather than manual aiming.

## Current state

Meowcenary is a playable TypeScript/Phaser game with substantially more than the original combat prototype.

Implemented systems include:

- movement, automatic targeting and firing, enemy waves, bosses, win/loss runs
- multiple stages, encounter profiles, difficulty profiles and arenas
- a six-slot weapon rack with pickups, merging and tier progression
- run upgrades and build variation
- eight playable mercenaries with distinct stats, passives, abilities and unlocks
- achievements and progression-linked unlocks
- persistent gun parts / Gunsmith data
- armour and equipment data
- XP, scrap, loot tables and chests
- keyboard, touch and controller input paths
- local save/progression state
- audio, effects, authored character/enemy art and a traversable Junkyard Lot
- automated tests, content validation and CI

The game is still under active development. Some content catalogs and progression systems are further along in data/architecture than their final UI and polish.

## Design

The core rules are deliberately simple:

- automatic combat; movement and build decisions are the main player inputs
- short, replayable runs
- readable enemy intent even when combat gets busy
- meaningful weapon and character identity
- persistent progression without paid power, energy systems or forced timers
- gameplay content defined as data where practical instead of being hard-coded into scenes

## Tech

- Phaser 3
- TypeScript
- Vite
- Vitest
- browser LocalStorage for persistent state

## Run locally

```bash
npm install
npm run dev
```

Then open the Vite development URL shown in the terminal.

## Checks

```bash
npm run lint
npm run test
npm run build
npm run art:validate
```

`npm run test` uses the repository test runner; `npm run test:watch` starts Vitest directly for interactive development.

## Repository layout

```text
src/
  data/          Gameplay/content definitions
  engine/        Runtime helpers and adapters
  entities/      Player, enemies, projectiles and drops
  gameplay/      Combat and run rules
  scenes/        Phaser scenes
  systems/       Input, saves, spawning, weapons and progression
  ui/            Menus and HUD

assets-src/      Editable/source artwork
docs/            Architecture, delivery records, roadmap and art documentation
scripts/         Repository validation/test tooling
```

The content layer in `src/data/` includes characters, abilities, achievements, weapons, enemies, arenas, encounters, difficulty profiles, equipment, gun parts, loot tables, upgrades, audio mappings and asset bundles.

## Documentation

[`docs/roadmap.md`](docs/roadmap.md) tracks milestone and epic status.

[`docs/architecture.md`](docs/architecture.md) describes the main system boundaries. Detailed feature contracts live under [`docs/architecture/`](docs/architecture/), while implementation/certification records live under [`docs/delivery/`](docs/delivery/).

Art direction and validation tooling live under [`docs/art/`](docs/art/).

## Scope

Meowcenary is currently focused on the game itself: combat, stages, characters, builds, progression, equipment, the Gunsmith and presentation.

Ads, paid progression, subscriptions, online accounts, co-op and competitive multiplayer are not part of the current product scope.
