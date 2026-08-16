# Epic 17 — Combat Feel and Weapon Identity

**Issue:** #76 · **Base:** Epic 16 merge commit (PR #83)

> Status: **architecture, not yet implemented**. This document is the
> implementation contract; runtime delivery lands in a follow-up PR per the
> slices in §6, mirroring how Epic 16 split architecture (PR #82) from
> runtime (PR #83).

## 1. Outcome

Epic 17 makes pistol, SMG, and shotgun — and the Dust Mite / Junk Rusher /
Trash Brute threats they fight — perceptible by feel, not just by reading
stats. It does this almost entirely as a **presentation layer over existing
authoritative state**: weapon family/tier, `pierce`/`projectileCount`/
`spreadDeg`, and the charger `winding`/`attacking` state machine are already
real, tested gameplay facts. Epic 17 does not invent new combat rules to
express them; it wires cosmetic, audio, and two small data-tuning changes to
what already exists.

The finished slice has:

- a distinct muzzle flash + held-weapon recoil punch and impact cue per
  weapon family, all pooled/allocation-free;
- per-family SFX for firing and impact (audio currently cannot distinguish
  weapons at all — every weapon shares one `sfx-weapon-fired` key);
- a visible tier-up moment on merge (T1→T2→T3), so a merge is obviously a
  power spike;
- a legible Junk Rusher wind-up telegraph and a heavier Trash Brute presence,
  both driven by `Enemy.state`/`stateTimerMs`, which are already authoritative
  and already tested;
- one small SMG data change (a tight T3 double-tap) so all three families
  clear the "beyond a hidden DPS increase" bar, using fields that already
  exist in `WeaponDefinition`;
- template (placeholder) art bindings for anything genuinely new, so Codex
  can replace pixels without touching runtime code or IDs (§9).

## 2. Repository architecture pass

### Healthy boundaries to preserve

- `WeaponSystem` owns fire timing, targeting, and projectile pooling.
  `weaponStats.resolveWeaponStats` is the only place `ModifierStack` values
  become `EffectiveWeaponStats`. Epic 17 adds cosmetic hooks at existing call
  sites; it does not touch this resolution path.
- `pierce` is already a validated per-tier scalar that flows cleanly through
  `WeaponDefinition → EffectiveWeaponStats → ProjectileSpawnOptions →
  Projectile.registerHit` with zero `GameScene`/weapon-ID branching. This is
  the pattern any future behavioral effect should copy.
- `FeedbackSystem`/`PhaserFeedbackRenderer` (Epic 12) already owns
  event-driven, pooled, reduced-motion-gated cosmetic effects with hard
  `maxEffects`/`maxHeavyEffects` caps. New cosmetics extend this renderer;
  they do not create a second effect system.
- `Enemy.state`/`stateTimerMs` (`idle | pursuing | winding | attacking |
  dead`) is already the single authoritative charger state machine
  (`src/gameplay/enemyMovement.ts`), already drives facing during `winding`,
  and is already covered by `enemyMovement.test.ts`/`enemy.test.ts`. Epic 17
  reads this state for presentation; it does not add a second timer.
- `VisualArtBinding.clips` is an open `Record<string, VisualArtClip>` (Epic
  13). Adding a new clip name (e.g. `windup`) needs no schema change — only a
  consumer that knows to look for it, with the same fail-open fallback every
  optional clip already uses.
- `HeldWeaponView` is one pooled node per player, already positioned/rotated
  toward the target and already swaps texture per shot. It is the correct
  extension point for recoil punch; it does not need a second node.
- Pooling discipline (Epic 12): every new cosmetic effect is pool-backed,
  bounded, and dt-driven — never a per-shot `scene.add.*` or `scene.tweens.add`.

### Gaps Epic 17 must close

- `AudioMapEntry`/`AudioManager.handleMappedEvent` map one event to one
  `sfxKey` and discard the event payload entirely
  (`bus.on(entry.event, () => this.handleMappedEvent(entry))`), so no event
  can select a family-specific sound today.
- `weapon:fired` carries `weaponId` but `projectile:hit` carries none, so
  impact presentation/audio cannot know which family landed a hit.
- `Projectile` has no cosmetic-only family tag; it is keyed purely by
  `projectileId` for pooling, which is correct for art but insufficient for
  emitting a family-tagged `projectile:hit`.
- Nothing currently distinguishes a merge visually beyond the rack icon
  swapping (`weapon:merged` already fires with `{fromId, toId}`, but nothing
  subscribes to it for player-facing feedback).
- `Enemy`'s `winding` state has no dedicated presentation: `syncPresentation`
  only tracks `moving`/`facing`, so a Rusher mid-telegraph looks identical to
  one standing still.
- SMG's three tiers differ only in `fireRateMs`/`damage`/`projectileSpeed`/
  `range` — a purely numeric ladder that violates Frozen Decision #2 below
  (every tier bump needs one immediately perceptible, non-numeric change).

None of these gaps justify a new effect engine, a second event bus, a new
RNG stream, or a save-schema change.

## 3. Frozen decisions

### D1 — No generic effect vocabulary; `pierce` is the pattern, not a special case

The issue asks Epic 17 to "inspect... before freezing exact types" and
explicitly forbids creating a generic effect engine "in advance" of real
need. Current Alpha 2 weapon data (`src/data/weapons.json`) uses exactly one
behavioral effect — `pierce` — and it already satisfies every rule the issue
lists for a well-formed effect: one authoritative implementation
(`Projectile.registerHit`), no `GameScene`/content-ID branching, fully
data-driven, fully tested.

Epic 17 does **not** add a generic `effects: EffectId[]` field, a resolver
registry, or any infrastructure for effects Alpha 2 doesn't use. If a second
distinct behavioral effect (burn, explosive impact, ricochet, …) becomes
necessary for approved Alpha 2 or Epic 18 content, it is added the same way
`pierce` was: one new validated scalar/field on `WeaponDefinition`, one pure
resolution point, no parallel system. This decision satisfies the issue's
"do not create a generic scripting/effect engine in advance" rule directly
rather than deferring it.

### D2 — Every tier bump gets one non-numeric, immediately perceptible change

Per the issue's Frozen Product Decision #2, a merge must be perceptible
beyond a hidden DPS increase. Two of three families already clear this bar
mechanically (shotgun via `projectileCount`/`spreadDeg` growth; pistol T3 via
`pierce`). SMG does not — all three tiers are pure numeric scaling.

**Data change:** `can-smg-t3.projectileCount` becomes `2` with a small
`spreadDeg` (a tight, forward-biased double-tap — not a shotgun-width fan).
This uses fields `WeaponDefinition` and `projectileDirections` already
support; no runtime code changes. Pistol T1→T2 and SMG T1→T2 clear the bar
through presentation scaling alone (D3): a materially bigger/brighter/louder
muzzle flash and impact at T2 is itself an immediately perceptible,
non-numeric change, and the issue's rule does not require every tier to add
a new mechanic — only a new *perceptible* thing.

### D3 — Family/tier-keyed cosmetic presentation, code-drawn first

Muzzle flash, recoil punch, and impact cues are driven by `(family, tier)`,
not by content ID. `WeaponSystem.fireAtNearestTarget` and
`WeaponSystem.handleProjectileEnemyOverlap` already resolve `definition`
(family, `mergeTier`) at exactly the two points that need to trigger
presentation — no new lookups, no ID branching in `GameScene`.

Cosmetics extend `PhaserFeedbackRenderer` with new pooled, capped effect
kinds (muzzle flash puff, recoil-punch tween-free position offset on
`HeldWeaponView`, impact cue variant) selected by a small
`WEAPON_FAMILY_PRESENTATION` data table (`src/data/weaponFeel.json` or a
constant in `src/systems/types.ts`-adjacent data file — see §4) keyed by
`family`, with `tier` scaling magnitude/size/particle count, not swapping
logic paths. First implementation is **code-drawn** (colors, shapes, particle
counts via existing `Phaser.GameObjects.Arc`/`Image` primitives, the same
technique `PhaserFeedbackRenderer` already uses) so Slice 1 ships without
depending on new art. Real muzzle-flash/impact sprites are additive later
(§9) and swap in behind the same table without changing call sites.

### D4 — `projectile:hit` and `weapon:fired` both carry enough to key presentation

`GameEventMap` additions (additive, per the existing "map is additive"
convention):

```ts
'weapon:fired':   { weaponId: string; family: string; tier: number; x: number; y: number };
'projectile:hit': { weaponId: string; family: string; tier: number; x: number; y: number; damage: number; killed: boolean };
```

`family`/`tier` are cosmetic-only duplicates of data `WeaponSystem` already
holds at the emit site (`definition.family`, `definition.mergeTier`) —
listeners never need a registry lookup, matching how `enemy:killed` already
carries `enemyId` rather than making `FeedbackSystem` look up the archetype.

`Projectile` gains a presentation-only `family: string` field (not part of
`ProjectileSpawnOptions`'s gameplay fields — set alongside `damage`/`speed`/
etc. in `spawn()`, read only when emitting `projectile:hit`). This does not
change pooling: projectiles are still pooled by `projectileId`, `family` is
just carried along for the hit event.

### D5 — Per-family, per-tier audio via a small keyed lookup, not payload branching in `AudioManager`

`AudioMapEntry` gains one optional field:

```ts
interface AudioMapEntry {
  event: GameEventKey;
  sfxKey?: string;                          // existing: default/fallback
  sfxKeyByFamily?: Record<string, string>;  // new: keyed by payload.family
  cooldownMs?: number;
  stopMusic?: boolean;
  musicFadeMs?: number;
}
```

`AudioManager.handleMappedEvent` becomes payload-aware **only** for entries
whose event payload has a `family` field (a type-level, not runtime, check —
`weapon:fired` and `projectile:hit` are the only two today). Resolution
order: `sfxKeyByFamily[payload.family] ?? sfxKey`. No other event gains
family-awareness; no generic "variant" abstraction is built for events that
don't need one. `audio-map.json` gains per-family keys for `weapon:fired`
and `projectile:hit` only; every other mapped event is untouched.

Tier is deliberately **not** part of the audio key. Per-tier differentiation
comes from pitch/volume scaling already possible via existing
`AudioManager` volume plumbing (small, code-computed tier multiplier at
`play()` time — see Slice 2), not three separate SFX files per family. This
keeps the required-asset surface small and matches "generalize only what's
needed."

### D6 — Tier-up presentation subscribes to `weapon:merged`, owns nothing new

`FeedbackSystem` adds one more subscription: `weapon:merged` → a short,
capped, reduced-motion-aware "power spike" cue (bigger pulse than a normal
hit, plus a `sfx-weapon-merged` SFX) centered on the player. `weapon:merged`
already carries `{fromId, toId}`; `toId`'s tier is resolved once via the
existing `weaponRegistry` the caller (not `FeedbackSystem`) already has, or
— simpler and consistent with D4 — `UpgradeSystem`/rack merge code adds
`toTier: number` to the existing payload at the point it already knows it.
No new merge logic; this is strictly an additional listener plus one payload
field.

### D7 — Enemy telegraph presentation reads `Enemy.state`, adds no timer

`Enemy.syncPresentation` gains a third input alongside `moving`/`facing`:
the archetype's presentation state, derived directly from
`this.state`/`this.stateTimerMs` — never a second countdown. `winding`
maps to a distinct pose:

- if `art.clips.windup` exists (a new **optional** clip name — no
  `VisualArtBinding` schema change per the existing gap analysis), play it
  and let its own duration carry the telegraph;
- if it does not exist (art not yet produced), fall back to a code-drawn cue
  on the existing accent node: a bounded pulse/tint ramp scaled by
  `stateTimerMs / definition.attack.telegraphMs` (0→1 as the charge
  completes), reusing `PlaceholderView`'s existing accent-node pattern rather
  than adding new display objects.

`attacking` (the dash) gets a brief motion-trail cue (pooled, capped, heavy
category — reduced-motion suppresses it exactly like `FeedbackSystem`'s
existing heavy dots). Trash Brute (`tank` archetype) additionally gets a
heavier, lower-frequency landing pulse on each pursuit step and a larger
screen-shake weight on its hits than `chaser`/`charger`, both still routed
through the existing `heavyMotion` gate — no new reduced-motion policy.

### D8 — Pooling and allocation discipline (unchanged from Epic 12)

Every new cosmetic — muzzle flash, recoil offset, impact variant, tier-up
pulse, telegraph tint, dash trail — is either:

- a property mutation on an already-pooled/glued node (`HeldWeaponView`'s
  image, `Enemy`'s accent node), or
- a new pooled kind inside `PhaserFeedbackRenderer` with its own bounded cap,
  following the exact `dotPool`/`liveDots`/`dropped` pattern already there.

No per-shot `scene.add.*`, no per-frame array allocation, no new tween
objects (tweens are banned in this codebase's cosmetic paths per Epic 10/12
precedent — `feedback.ts` and `HeldWeaponView` are both dt-driven, not
tween-driven, and Epic 17 continues that).

## 4. Data and event contracts

### `src/data/weapon-feel.json` (new — presentation-only, no gameplay fields)

```json
[
  {
    "family": "pistol",
    "muzzle": { "color": "#fbbf24", "radius": 5, "lifetimeMs": 70 },
    "impact": { "color": "#fbbf24", "radius": 5 },
    "recoilPx": 3,
    "sfxTierVolumeMultiplier": [1.0, 1.12, 1.28]
  },
  {
    "family": "smg",
    "muzzle": { "color": "#38bdf8", "radius": 4, "lifetimeMs": 50 },
    "impact": { "color": "#38bdf8", "radius": 4 },
    "recoilPx": 1.5,
    "sfxTierVolumeMultiplier": [1.0, 1.08, 1.18]
  },
  {
    "family": "shotgun",
    "muzzle": { "color": "#f97316", "radius": 8, "lifetimeMs": 90 },
    "impact": { "color": "#f97316", "radius": 7 },
    "recoilPx": 6,
    "sfxTierVolumeMultiplier": [1.0, 1.15, 1.35]
  }
]
```

Validated the same way every other catalog is (`validation.ts`): required
fields, positive numeric bounds, `family` must match an existing weapon
family with no unknown/missing family. Code-drawn shapes (D3) read this
directly; when real art lands, `muzzle`/`impact` gain an optional `artId`
pointing at a `visual-art.json` binding and the renderer prefers art over
the drawn shape — same fail-open pattern as every other optional-art path in
this codebase.

### `GameEventMap` additions (additive, see D4/D6)

```ts
'weapon:fired':   { weaponId: string; family: string; tier: number; x: number; y: number };
'projectile:hit': { weaponId: string; family: string; tier: number; x: number; y: number; damage: number; killed: boolean };
'weapon:merged':  { fromId: string; toId: string; toTier: number };
```

### `audio-map.json` additions

```json
{ "event": "weapon:fired",   "sfxKey": "sfx-weapon-fired",   "sfxKeyByFamily": { "pistol": "sfx-weapon-fired-pistol", "smg": "sfx-weapon-fired-smg", "shotgun": "sfx-weapon-fired-shotgun" }, "cooldownMs": 90 },
{ "event": "projectile:hit", "sfxKey": "sfx-projectile-hit", "sfxKeyByFamily": { "pistol": "sfx-projectile-hit-pistol", "smg": "sfx-projectile-hit-smg", "shotgun": "sfx-projectile-hit-shotgun" }, "cooldownMs": 90 },
{ "event": "weapon:merged",  "sfxKey": "sfx-weapon-merged" }
```

`sfxKey` stays the fallback used whenever `sfxKeyByFamily[family]` — or the
family-specific asset — is missing (dev/placeholder state never crashes;
matches the existing `warnOnce` degrade-gracefully behavior in
`AudioManager.play`).

### `weapons.json` change

`can-smg-t3.projectileCount: 1 → 2`, `spreadDeg: 0 → 6` (tight, not a fan).
No other weapon data changes.

## 5. File ownership

```text
src/data/weapon-feel.json        new — presentation-only per-family constants
src/data/weapons.json            modified — SMG T3 double-tap only (D2)
src/data/audio-map.json          modified — sfxKeyByFamily on 2 entries, +weapon:merged
src/data/audio-assets.json       modified — new SFX keys (placeholder WAVs, Epic 10 pipeline)
src/data/visual-art.json         modified — new *optional* muzzle/impact/windup bindings (§9)
src/engine/eventBus.ts           modified — GameEventMap additions (D4/D6)
src/systems/types.ts             modified — AudioMapEntry.sfxKeyByFamily, WeaponFeelDefinition
src/systems/audio.ts             modified — family-aware handleMappedEvent (D5)
src/systems/validation.ts        modified — weapon-feel.json validator + audio-map family-key checks
src/systems/WeaponSystem.ts      modified — emits family/tier on fired+hit, drives muzzle/recoil/impact
src/systems/feedback.ts          modified — muzzle/impact/tier-up/telegraph/dash-trail pooled kinds
src/entities/Projectile.ts       modified — presentation-only `family` tag (D4)
src/entities/heldWeaponView.ts   modified — recoil punch offset, tier-scaled
src/entities/Enemy.ts            modified — winding/attacking presentation (D7)
src/gameplay/weapons.ts          unchanged — merge/rack rules untouched
src/gameplay/weaponStats.ts      unchanged — no new resolved stat
src/gameplay/enemyMovement.ts    unchanged — no new authoritative state
```

## 6. Implementation slices and commit gates

### Slice 1 — Weapon presentation identity (code-drawn)

`weapon-feel.json` + validator; `weapon:fired`/`projectile:hit` gain
`family`/`tier`; `Projectile` gains the presentation-only `family` tag;
code-drawn muzzle flash + impact variant in `feedback.ts`; recoil punch on
`HeldWeaponView`. No audio yet. Gate: full suite green, new focused tests for
the validator and the family/tier payloads, manual smoke on all three
families at all three tiers.

### Slice 2 — Family/tier audio

`AudioMapEntry.sfxKeyByFamily`, `AudioManager` family resolution, tier
volume multiplier from `weapon-feel.json`, new placeholder WAV keys via the
existing Epic 10 deterministic-audio pipeline (`scripts/`), `audio-map.json`
+ `audio-assets.json` updates. Gate: `audioAssets.test.ts`-style coverage for
the new keys, manual smoke confirms three distinct fire sounds and three
distinct impact sounds.

### Slice 3 — Tier-up presentation

`weapon:merged` payload gains `toTier`; `FeedbackSystem` subscribes; pooled
power-spike cue; `sfx-weapon-merged`. Gate: merge event test coverage,
manual T1→T2→T3 merge smoke.

### Slice 4 — Enemy telegraph and weight presentation

`Enemy.syncPresentation` third state input; code-drawn winding pulse
fallback + optional `windup` clip consumption; Trash Brute landing/hit
weight cues; dash motion trail (pooled, heavy-gated). Gate: presentation
unit coverage mirroring `player.test.ts`'s hurt/defeat pattern, reduced-motion
coverage for every new heavy path, manual Rusher/Brute smoke.

### Slice 5 — SMG double-tap data change and Golden Run closeout

`can-smg-t3` data change; full player-experience matrix pass (§8); shuffled
full-suite reruns; `art:validate`; diff hygiene; delivery record.

Each slice is its own reviewable commit/PR gate on one branch, matching the
Epic 14/15/16 single-branch delivery convention — no speculative work ships
ahead of the slice that needs it.

## 7. Automated acceptance

- Full suite green after every slice; shuffled-seed reruns green at Slice 5.
- `weapon-feel.json` validated: every family present exactly once, no
  unknown family, positive numeric bounds, `sfxTierVolumeMultiplier` has
  exactly 3 entries (T1–T3) all `> 0`.
- `audio-map.json` validated: every `sfxKeyByFamily` key is a real weapon
  `family` value; every referenced `sfxKey` exists in `audio-assets.json`
  (extends the existing cross-reference validator, same pattern as
  `assertArenaVisualReferences`).
- New pooled effect kinds report `active`/`allocated`/`dropped` counts
  through the existing F3 diagnostics surface — no new debug surface.
- Reduced-motion tests cover: muzzle flash (light — stays on), recoil punch
  (light — stays on), impact variant heavy burst (suppressed), tier-up pulse
  heavy variant (suppressed), dash trail (suppressed), Trash Brute shake
  weight (suppressed to the existing light tier).
- `git diff --check`, lint, build all pass.

## 8. Player-experience matrix (mirrors issue §Player-Experience Gate)

| Check | Mechanism |
| --- | --- |
| Pistol/SMG/shotgun distinguishable by sound | D5 — distinct `sfxKeyByFamily` per family |
| Pistol/SMG/shotgun distinguishable by cadence/impact/feel | Already true (`fireRateMs`) + D3 muzzle/impact + D5 audio |
| T1→T2 merge immediately noticeable | D2/D3 — presentation scaling is itself the perceptible change |
| T3 materially stronger without breaking readability | D2 (pierce/double-tap already tier-3-gated) + D3 tier-scaled magnitude, capped |
| Dust Mite/Junk Rusher/Trash Brute distinct readable threat | Already true via archetype accent (Epic 13) + D7 telegraph/weight |
| Rusher charge clearly telegraphed | D7 — reads existing `winding` state, no new timer to drift |
| Enemy hurt/death and player damage obvious | Already true (Epic 16 hurt/defeat clips); unchanged by Epic 17 |
| Dense late-wave combat stays readable/performant | D8 pooling discipline + existing `maxEffects`/`maxHeavyEffects` caps |
| Reduced motion keeps essential cues, drops heavy motion | D7/D3 heavy-gated exactly like existing `FeedbackSystem` paths |

## 9. Art template contract for Codex

Nothing in Slice 1–4 *requires* new art to function — every new cosmetic has
a code-drawn fallback (D3, D7). Where real pixel art would improve feel, the
manifest slot is reserved now so Codex can fill it later without touching
runtime code, IDs, or call sites:

| ID (not yet in `visual-art.json`) | Kind | Notes |
| --- | --- | --- |
| `fx:muzzle:pistol` / `fx:muzzle:smg` / `fx:muzzle:shotgun` | `world` (or new `fx` kind if a static-image spritesheet doesn't fit `world`) | Optional; `required: false`. Renderer prefers this over the drawn puff (D3) when present. |
| `fx:impact:pistol` / `fx:impact:smg` / `fx:impact:shotgun` | same | Optional; same fallback rule. |
| `character:scrap-tabby` / future characters — no change | — | Hurt/defeat already covered by Epic 16. |
| `enemy:junk-rusher` gains an optional `clips.windup` entry on its **existing** binding | — | No new binding ID — same `enemy:junk-rusher` id, one new clip name (schema already supports arbitrary clip names per Epic 13). |

Rules for whoever (Codex or otherwise) fills these in later, matching the
Epic 13/16 art pipeline exactly:

1. Every new binding gets a deterministic Pixelorama source under
   `assets-src/`, a Lua builder under `docs/art/scripts/`, and a validated
   export under `public/assets/` — reuse `docs/art/scripts/lib/` helpers
   rather than one-off scripts.
2. New bindings default `required: false` until their asset exists;
   `npm run art:validate` and `BootScene`'s required-asset gate must both
   stay green with the slot present but unfilled.
3. IDs above are frozen; do not rename them when filling in art.
4. No runtime file changes — this table's IDs are the entire contract; the
   renderer/consumer code already prefers art over the drawn fallback the
   moment `scene.textures.exists(binding.textureKey)` is true (D3/D7).

## 10. Reviewer traps

- **Do not** add a generic effect/behavior engine — D1 is a deliberate
  architectural decision, not a placeholder for one. A PR that adds
  `effects: EffectId[]` for zero currently-needed effect types is out of
  scope.
- **Do not** let `AudioManager` gain a `weaponRegistry`/`ctx.data` dependency
  to resolve family — `family`/`tier` travel on the event payload precisely
  so listeners stay dependency-free (D4).
- **Do not** add tier to the audio *key* space (`sfxKeyByFamily`) — tier is a
  volume multiplier, not a new asset per tier (D5). Three families × one SFX
  each, not three families × three tiers.
- **Do not** give `Enemy` a second countdown for telegraph presentation —
  `stateTimerMs` is already authoritative and already tested; a parallel
  timer will drift (D7).
- **Do not** implement recoil/muzzle/impact via `scene.tweens.add` — this
  codebase's cosmetic paths are dt-driven and pool-backed throughout Epic 10
  and 12; a tween-based implementation is an architecture regression, not a
  style choice.
- **Do not** hardcode family/tier branches in `GameScene` — every decision
  point in this document resolves at `WeaponSystem`/`Enemy`/`FeedbackSystem`,
  where the data already lives.

## 11. Current delivery record

- [x] Architecture baseline reviewed and merged (PR #96).
- [x] Slice 1 — weapon presentation identity, code-drawn muzzle/impact/recoil
  (PR #97).
- [x] Slice 2 — family/tier weapon audio via `sfxKeyByFamily` and tier volume
  multipliers (PR #99).
- [x] Slice 3 — tier-up presentation on merge (PR #100).
- [x] Slice 4 — enemy telegraph and weight presentation (PR #101).
- [x] Slice 5 — SMG double-tap data change and Golden Run closeout: full
  suite green under two independently shuffled seeds, lint/build/art:validate
  clean (PR #102).
- [x] Post-merge orthogonal closeout review across all five slices, three
  independent passes, fixes applied on top of `main`.

Closeout review findings and fixes:

- Trash Brute's `enemy:heavyStep` cadence was measuring the *intended*
  (obstacle-agnostic) `chaseStep` target delta instead of actually-resolved
  displacement, so a Brute stuck against an obstacle kept cosmetically
  "walking." Fixed by sourcing the distance from the same
  current-vs-`presentationPos` delta `syncPresentation` already computes for
  the `moving` flag.
- `enemyHeavyStep`'s landing-pulse dot wasn't marked `heavy`, so it evaded
  `maxHeavyEffects` and didn't retract via `cancelHeavyMotion()` when reduced
  motion was toggled on mid-run, unlike the dash trail's dots. Fixed by
  threading a `heavy` flag through `spawnStationary`.
- `sfxKeyByFamily` validated cleanly on any event, including ones whose
  payload never carries `family`/`tier`, so a misconfigured entry would
  silently never fire rather than failing closed at boot. Fixed by cross-
  checking `entry.event` against a shared `FAMILY_TIER_EVENT_KEYS` constant
  (single source of truth with `AudioManager.eventFamilyTier`).
- **Junk Rusher showed zero winding telegraph in the shipped game.**
  `enemy:junk-rusher` already ships full idle/run/hurt/defeat art (Epic 13),
  so `Enemy` builds a `SpriteView` and destroys the `PlaceholderView` accent
  node the D7 fallback pulse depends on — and no `windup` clip was ever added
  to close the gap the other way. Fixed by giving `SpriteView` its own
  self-contained fallback: a sprite tint lerping toward a warning color as
  the charge completes, used only when no `windup` clip is present. This was
  the most significant finding — the sole charger-archetype enemy in the game
  had no perceptible telegraph despite the player-experience matrix (§8)
  claiming "Rusher charge clearly telegraphed."
- Two small DRY cleanups: `weapon-feel.json`'s muzzle/impact validation
  shared one helper instead of two near-identical blocks; the
  family→`WeaponFeelDefinition` lookup map, previously built independently in
  `WeaponSystem`, `AudioManager`, and `PhaserFeedbackRenderer`, now goes
  through one shared `weaponFeelByFamily()` helper.
- Minor: muzzle/impact hex colors are now parsed once per family at
  construction instead of on every `muzzleFlash`/`projectileHit` call.

All fixes shipped with full regression coverage (new tests in
`actorView.test.ts`, `enemy.test.ts`, `feedback.test.ts`, `validation.test.ts`)
and the full suite, lint, build, and `art:validate` green throughout.
