# Roadmap

## Current Position

- Epic 0 / Foundation: complete (#1).
- Epic 1 / Core Gameplay Loop: complete (#2).
- Epic 2 / Weapons and Merge System: complete (#3).
- Epic 3 / Upgrade Cards: complete (#4).
- Epic 4 / Enemy AI and Spawn Director: complete (#5).
- Epic 5 / Meta Progression: complete (#6).
- Epic 6 / Characters: next (#7).

The current `main` branch is the clean post-Epic-5 baseline. Epic 6 follows the
seven implementation slices in
[`architecture/epic-6-characters.md`](architecture/epic-6-characters.md), which
establishes the pre-run `RunRequest` configuration boundary, the character
data/registry/selection contracts, and the reactive-passive lifecycle seam
that Epics 7 and 9 build on.

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
