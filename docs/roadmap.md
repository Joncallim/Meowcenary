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
- Epic 11 / Balancing and Developer Tooling: complete — slices 1–2 merged in
  PR #66; slices 3–5 (dev-only cheat flags, rolling DPS/overlay metrics, local
  playtest summary, tuning guide) merged in PR #70 (#12).
- Epic 12 / Polish and Performance: complete — generic pooling, projectile/drop
  reuse, event-driven combat feedback, reduced-motion policy, `PerfSampler`, F3
  diagnostics, and FIT-responsive sizing merged in PR #71 (#13).
- Epic 13 / Presentation Runtime and Physics Stability: complete — merged in
  PR #79 (#72) — physics-debug opt-in, the actor-view presentation seam, the
  `actor-art.json` catalog, AI-directed Pixelorama sprites for every current
  actor plus one projectile and one pickup, and deterministic charger
  environment clipping; architecture and delivery record in
  [`architecture/epic-13-presentation-runtime.md`](architecture/epic-13-presentation-runtime.md);
  delivered on the single branch `agent/epic-13-presentation-runtime`.
- Epic 14 / Weapon Acquisition and Rack Economy: complete — merged in
  PR #80 (#73) — the six-slot authoritative rack, one-T1-weapon starts,
  capacity-checked weapon admission, physical no-loss full-rack pickups, the
  dedicated seeded `weapon-rewards` stream, and the guaranteed early duplicate;
  architecture and delivery record in
  [`architecture/epic-14-weapon-acquisition-and-rack-economy.md`](architecture/epic-14-weapon-acquisition-and-rack-economy.md);
  delivered on the single branch `agent/epic-14-weapon-acquisition`.
- Epic 15 / Inventory and Merge Experience: complete — merged in PR #81 (#74)
  — immutable six-slot rack read model,
  authoritative compatibility highlighting, allocation-free next-tier preview,
  direct merge-ready HUD entry, tap/keyboard commands, and responsive
  portrait/landscape presentation; architecture and delivery record in
  [`architecture/epic-15-inventory-and-merge-experience.md`](architecture/epic-15-inventory-and-merge-experience.md).
- Epic 16 / Visual Identity and Junkyard World: architecture and selected art
  direction in progress on `codex/epic-16-visual-identity` (#75) — one visual
  manifest, explicit weapon/pickup art references, pooled presentation,
  authored world data, and a camera-traversable Junkyard Lot; implementation
  contract in
  [`architecture/epic-16-visual-identity-and-junkyard-world.md`](architecture/epic-16-visual-identity-and-junkyard-world.md).

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
helpers (slices 1–2). PR #70 delivered Issue #69's remaining work — the
development-only cheat flags, read-only overlay metrics, local playtest
summary, tuning guidance, and delivery closeout — on the single branch
`agent/epic-11-remainder` per its executable work package
[`architecture/epic-11-remainder.md`](architecture/epic-11-remainder.md).
Epic 11 is complete.
Epic 12 is specified in
[`architecture/epic-12-polish-and-performance.md`](architecture/epic-12-polish-and-performance.md)
as the final single-branch delivery package. It was delivered in PR #71 with
subscriber-only combat feedback, live reduced-motion policy, strict generic
pooling, behavior-preserving projectile/drop reuse, F3 performance visibility,
an evidence-gated decision to defer enemy pooling, and FIT-based
responsive/browser verification. It explicitly forbids gameplay projectile/drop
caps because those would change combat or economy rather than merely improve
lifetime management.
Epic 14 is specified in
[`architecture/epic-14-weapon-acquisition-and-rack-economy.md`](architecture/epic-14-weapon-acquisition-and-rack-economy.md)
as the single-branch work package for Issue #73. It freezes the existing
`RunState.equipped` array as a six-slot active rack, one-T1-weapon starts,
weapon grants keyed by stable definition ID, capacity-checked fresh instance
creation through the shared run registry, physical no-loss full-rack pickups,
a dedicated seeded `weapon-rewards` stream, a guaranteed early duplicate, and
strict boundaries that leave final rack UX, art, feedback, and pacing to
Epics 15–18. It was delivered on the single branch
`agent/epic-14-weapon-acquisition` and merged in PR #80; the §9 manual Golden
Run acceptance pass is recorded in §13 as pending reviewer/local execution.

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
