# Roadmap

## Current Position

- Epic 0 / Foundation: complete (#1).
- Epic 1 / Core Gameplay Loop: complete (#2).
- Epic 2 / Weapons and Merge System: complete (#3).
- Epic 3 / Upgrade Cards: complete (#4).
- Epic 4 / Enemy AI and Spawn Director: complete (#5).
- Epic 5 / Meta Progression: complete (#6).
- Epic 6 / Characters: complete (#7).
- Epic 7 / Maps and Arenas: complete (#8).

Epic 7 was implemented in the consolidated PR #51 and merged.
Epic 8 is next.

The current `main` branch is the clean post-Epic-7 baseline.
The Epic 7 architecture is documented in
[`architecture/epic-7-maps-and-arenas.md`](architecture/epic-7-maps-and-arenas.md),
which adds the arena data/registry/selection contracts, the pure
`spawnPoint(arena, rng)` bridge into Epic 4's spawn director, arena world
bounds, static obstacles, and an optional hazard shell. Epic 7 extends the
pre-run `RunRequest` boundary Epic 6 established — arena selection follows the
identical `GameContext` pattern used for characters — and closes the
pre-existing duplication where `SpawnSystem` re-derived `spawnCurves[0]`
instead of consuming `RunState.arenaId`. Each slice ships as its own
architecture PR and as a sub-issue under the Epic 7 umbrella (#8).

## Milestone 0: Foundation

- Vite, Phaser, TypeScript scaffold.
- Scene shell.
- Data loading.
- Repository standards.
- Issue backlog.

## Milestone 1: Playable Combat Slice

- Player movement.
- Auto targeting and auto firing.
- Enemy spawning.
- Damage and death.
- XP drops.
- Level-up choice screen.

## Milestone 2: Weapon and Upgrade Depth

- Weapon framework.
- Projectile variants.
- Merge rules.
- Upgrade card generation.
- Weapon synergies.
- Run summary.

## Milestone 3: Meta Progression

- Local save system.
- Persistent currency.
- Permanent upgrades.
- Character unlock shell.
- Weapon unlock shell.

## Milestone 4: Content Expansion

- Multiple enemy archetypes.
- Boss framework.
- Arena variants.
- More upgrade families.
- Better economy tuning.

## Milestone 5: Polish and Release Candidate

- Responsive mobile controls.
- UI polish.
- Particles and combat feedback.
- Audio.
- Accessibility settings.
- Performance pass.

## Explicitly Later

- Online accounts.
- Cloud saves.
- Leaderboards.
- Co-op.
- Cosmetic store.
- Any monetisation.
