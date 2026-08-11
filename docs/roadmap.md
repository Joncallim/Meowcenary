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
- Epic 8 / Loot and Economy: complete (#9).
- Epic 9 / UI and UX: merged (PR #64) (#10).
- Epic 10 / Audio: complete — contracts and game-scoped `AudioManager` merged
  in PR #65; scene wiring, UI events, and placeholder assets merged in PR #68
  (#11).
- Epic 11 / Balancing and Developer Tooling: slices 1–2 complete in PR #66;
  slices 3–5 are the current delivery work in Issue #69, specified by
  [`architecture/epic-11-remainder.md`](architecture/epic-11-remainder.md).
- Epic 12 / Polish and Performance: open (#13), sequenced after the Epic 11
  remainder.

Epic 7 was implemented in the consolidated PR #51 and merged.
Epic 8 is complete: Slices 1–5 merged in PRs #58–62, implementing the
event-driven kill-to-loot pipeline, poolable magnet `Drop`, activated scrap
economy, chest shell, integration harness, and dev hotkey.

Epic 8 (Loot and Economy, #9) is specified in
[`architecture/epic-8-loot-and-economy.md`](architecture/epic-8-loot-and-economy.md).
It moves kill-to-loot onto the event bus (an enriched `enemy:killed` payload
consumed by `DropSystem`), adds the fail-closed `loot-tables.json` catalog with
a pure seeded resolver, replaces `XpDrop` with a poolable magnet `Drop` entity,
and activates the scrap economy (`currencyGain`, `currency:changed`) that
Epic 5 banks at run end. Epic 8 adds no new events and no save-schema change;
chests and rare drops ship as validated content shells, exactly as Epic 7
shipped hazards. Each of its five slices ships as a focused implementation PR
and as a sub-issue under the Epic 8 umbrella (#9).

`main` now holds the complete Epic 8: event-driven kill-to-loot, live scrap
economy, and the fixture/hotkey-proven chest shell.
Epic 9 is specified in
[`architecture/epic-9-ui-and-ux.md`](architecture/epic-9-ui-and-ux.md) as six
dependency-ordered implementation/review gates on the single branch
`agent/epic-9-ui-and-ux`. The architecture freezes production menu routing,
HUD/read models, settings, touch presentation, pause/inventory merge ownership,
upgrade-chooser preservation, and run-summary banking boundaries for handoff to
Kimi K2.7 and DeepSeek V4 Pro.
Epic 10 is specified in
[`architecture/epic-10-audio.md`](architecture/epic-10-audio.md) as five
dependency-ordered implementation/review gates on the single branch
`agent/epic-10-audio`. The architecture freezes the game-scoped shared
`AudioManager`, validated audio asset/map data, the pure `shouldPlay` cooldown
gate, the `settings:changed` live-settings seam, additive `ui:*` sound events,
the autoplay unlock policy (drop one-shots, defer music), and the placeholder
asset pipeline. PR #65 merged slices 1–2 (data/event contracts and the
unwired manager); PR #68 merged slices 3–5 (settings and scene lifecycle
wiring, exactly-one `ui:*` command events, deterministic placeholder WAVs, and
docs closeout), delivered on `agent/epic-10-audio-remainder` per
[`architecture/epic-10-audio-remainder.md`](architecture/epic-10-audio-remainder.md).
Epic 10 is complete.
Epic 11's overall contracts are specified in
[`architecture/epic-11-balancing-and-developer-tooling.md`](architecture/epic-11-balancing-and-developer-tooling.md).
PR #66 delivered the descriptor-driven aggregate validator and shared curve
helpers (slices 1–2). Issue #69 owns the remaining development-only cheat
flags, read-only overlay metrics, local playtest summary, tuning guidance, and
delivery closeout. Its executable work package is
[`architecture/epic-11-remainder.md`](architecture/epic-11-remainder.md) on
the single branch `agent/epic-11-remainder`.
Epic 12 (Polish and Performance, #13) follows after that delivery.

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
