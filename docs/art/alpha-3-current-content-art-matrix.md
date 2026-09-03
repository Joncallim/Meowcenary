# Alpha 3 Current-Content Art Matrix

**Status:** catalog-exact exhaustiveness companion to `alpha-3-art-production-briefs.md` for Issue #167.

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

This file exists because a visual-manifest audit alone is insufficient: some player-facing data uses text/borrowed icons and therefore has no dedicated `visual-art.json` binding yet. Counts are not enough either. The pass condition is **stable-ID coverage** against every current player-facing catalog.

If this matrix and an older art brief differ, the current repository catalog wins and the brief must be corrected.

---

# 1. Current data-catalog coverage

| Data file | Player-facing visual need | Production coverage |
| --- | --- | --- |
| `abilities.json` | 8 active ability icons | Main brief §4 |
| `achievements.json` | exact 10 current achievement badges + hidden treatment | Main brief §10 |
| `arenas.json` | 15 world assets + one location-card composition | Main brief §§13–14 |
| `asset-bundles.json` | no standalone art; grouping/loading only | Explicitly none |
| `audio-assets.json` | audio, not graphics | Out of graphics scope |
| `audio-map.json` | audio routing, not graphics | Out of graphics scope |
| `characters.json` | 8 actor sheets, 8 portraits, 8 passive icons; starting weapons reuse weapon art | Main brief §§3, 5, 6 |
| `content-version.json` | no player-facing art | Explicitly none |
| `difficulty-profiles.json` | no dedicated art; tuning remains data | Explicitly none |
| `encounter-profiles.json` | no standalone art; stage/Compendium derive real monster relationships | Explicitly none |
| `enemies.json` | exact 10 current actor sheets; Compendium reuses them | Main brief §11 + Compendium plan |
| `equipment.json` | 32 dedicated piece icons + 8 set emblems | Main brief §9 |
| `gun-parts.json` | exact 12 current physical part icons + **8** slot glyphs (including `trait`) + 3 used trait emblems | Main brief §8 |
| `loot-tables.json` | no loot-table icon; rewards compose actual XP/scrap/chest/weapon/part/equipment art | Main brief §§6, 8, 9, 12 |
| `meta-upgrades.json` | 4 current legacy progression icons if surface survives #165 | Main brief §15 |
| `reward-profiles.json` | no reward-profile painting; show actual granted content/currency | Explicitly none |
| `spawn-curves.json` | simulation data; no standalone art | Explicitly none |
| `stages.json` | 2 chapter emblems, 1 location card, 4 objective icons, boss marker | Main brief §14 |
| `upgrades.json` | exact 18 current run-upgrade icons | Main brief §7 |
| `visual-art.json` | 77 current runtime bindings need approval/replacement audit | Main brief §§2–13 |
| `weapon-feel.json` | muzzle/impact/recoil remain runtime procedural feedback | Explicitly none |
| `weapons.json` | 9 rack icons, 9 held weapons, 3 family projectiles; legacy default projectile separately retained/reviewed | Main brief §6 |

Future exhaustiveness starts from **all player-facing data catalogs + all UI surfaces + the visual manifest**, then compares stable IDs rather than only counts.

---

# 2. Stable-ID proof for previously collision-prone catalogs

## 2.1 Run upgrades — exact 18

The production brief must contain one icon brief for each of these current IDs and no invented substitute:

```text
quick-paws
extra-scrap
hot-barrel
scrap-magnet
reinforced-coat
fast-learner
heavy-rounds
long-barrel
split-shot
punch-through
glass-cannon
run-and-gun
pistol-deadeye
pistol-needle-rounds
smg-overclock
smg-spray
shotgun-buckshot
shotgun-breacher
```

The earlier draft's `Last Stand` was not current content and is removed. `pistol-needle-rounds` is now explicitly briefed.

## 2.2 Gunsmith parts — exact 12

```text
part:receiver-compact
part:receiver-heavy
part:barrel-standard
part:barrel-long
part:optic-red-dot
part:stock-padded
part:trigger-hair
part:magazine-extended
part:underbarrel-grenade
part:barrel-piercing
part:trait-fire
part:trait-fire-mastered
```

Current slots represented by the data contract:

```text
receiver
barrel
optic
stock
trigger
magazine
underbarrel
trait
```

The physical part list must therefore not invent Long-Range Optic, Stable Stock, Standard Underbarrel or an Incendiary Barrel as if they were current definitions. FIRE/PIERCING/EXPLOSIVE emblems remain reusable trait semantics; physical Fire Trait Core items remain separate art.

## 2.3 Achievements — exact 10

```text
achievement:first-kill                    -> First Blood
achievement:kill-milestone-25             -> Scrap Squad
achievement:kill-milestone-100            -> Junkyard Veteran
achievement:first-merge                   -> Forge Initiate
achievement:boss-crusher                  -> Crusher Down
achievement:chapter-junkyard              -> Junkyard Champion
achievement:first-victory                 -> First Victory
achievement:mastery-scrap-tabby           -> Tabby Mastery
achievement:scrap-banked-1000             -> Scrap Tycoon
achievement:permanent-reinforced-coat-3   -> Well Protected
```

The earlier draft's Untouchable, Hot Work and Fully Suited badges were not current achievement definitions and are removed from the production list.

---

# 3. Legacy permanent/meta progression — 4 icons

These remain relevant only while the Progression surface exposes them.

## Reinforced Vest — `reinforced-vest`

Work vest on a small workshop mannequin/stand with two stacked reinforcement plates and progress notch. The mannequin/training framing distinguishes permanent investment from run Reinforced Coat and equippable armour.

## Quick Paws Training — `quick-paws-training`

Paw trail crossing three workshop stepping/training blocks with an upward progress notch. Distinct from Quick Paws, Light Paws and Adrenaline.

## Sharpened Ammo — `sharpened-ammo`

Broad fictional scrap slug against filing/grinding jig, making the permanent workshop preparation operation the read. Distinct from Heavy Rounds, Punch Through and PIERCING.

## Magnetic Whiskers — `magnetic-whiskers`

Abstract cat muzzle with two long bent coil-tipped whiskers drawing bolts inward. Distinct from Scrap Magnet, Magnet Belly and Scavenge Pulse.

If #165 retires legacy Progression, remove these art requirements with the feature.

---

# 4. Non-raster/procedural graphics explicitly reviewed

## Weapon feel

`weapon-feel.json` owns family muzzle radius/color, impact radius/color and recoil. Keep these as crisp bounded runtime FX unless visual evidence proves a sprite materially improves readability. Asset art never owns timing/recoil values.

## Health/XP meters

Meters remain runtime geometry with art-backed framing/glyphs. Do not bake fill amounts into sprites.

## Focus, locked, disabled and rarity state

Use reusable state chrome from the main brief. Do not redraw every card in every state.

## Encounter/difficulty/spawn data

These change simulation/composition. Stage cards communicate through real stage/objective/enemy content rather than invented “difficulty art” that can drift from rules.

## Rewards

Reward surfaces show actual granted item/part/equipment/scrap art. A `reward:stage-01` illustration would duplicate truth.

---

# 5. UI-surface cross-check

| Surface | Required art source |
| --- | --- |
| Main menu | title lockup, backdrop, reusable navigation/chrome |
| Stages/Contracts | chapter, arena, objective, boss marker, state overlays |
| Golden Run / legacy Arena | Golden Run nav emblem + Junkyard location/world art |
| Characters | portrait, actor, active/passive icons, weapon icon, stat glyphs |
| Progression | four meta-upgrade icons if #165 retains surface |
| Gunsmith | exact 12 part icons, 8 slot glyphs, trait emblems, weapon/stat art, chrome |
| Equipment | 32 item icons, 8 set emblems, stat glyphs, state chrome |
| Achievements | exact current 10 badges + hidden/locked treatment |
| Compendium | final enemy sheets + Compendium nav/chrome; no duplicate portraits by default |
| Settings | audio/music/SFX/reduced-motion/fullscreen glyphs |
| HUD | XP/scrap reuse, health/timer/kills, objective/ability art |
| Touch/controller controls | device-neutral logical-action glyphs |
| Upgrade chooser | exact current 18 upgrade icons + consistent card chrome |
| Inventory/rack/merge | weapon icons + merge symbol + card/focus chrome |
| Run result/summary | clear/fail emblem + actual earned/build art |

---

# 6. Template/scalability gate

The matrix is part of the future content template, not a one-time Alpha 3 spreadsheet-in-Markdown.

When a new content-bearing catalog or item is introduced:

1. the source definition is added with a stable ID;
2. the relevant authoring template declares whether dedicated art is required;
3. explicit presentation/art references are added where the owner can have multiple assets;
4. this matrix/category coverage is updated automatically or by review;
5. generic validation checks every required current ID resolves;
6. a synthetic N+1 fixture proves ordinary content does not require scene/controller/save/renderer branching;
7. explicit encounter/reward/loot/bundle pools are edited only where intended.

An exhaustiveness gate that merely checks `count === 18` is insufficient; it must compare the actual stable ID set.

---

# 7. Review history and closure

The original companion was created after a catalog-wide pass found four meta-upgrades that a manifest-only review missed.

A subsequent PR review then found a stronger failure mode: **matching counts with incorrect item identities**. Specifically:

- `Last Stand` was incorrectly briefed while current `pistol-needle-rounds` was missing;
- several Gunsmith part briefs described nonexistent current parts and omitted real `trait`-slot cores/Piercing Barrel/Padded Stock;
- several achievement badges described nonexistent current achievements while omitting First Victory, Scrap Tycoon and Well Protected.

Those P1 findings are now corrected in the main brief and this matrix. The permanent process change is that #167 coverage is checked by **stable ID**, not prose count.

The combined production authority is:

- `docs/art/alpha-3-art-production-briefs.md`
- `docs/art/alpha-3-current-content-art-matrix.md`
- `docs/architecture/content-authoring-templates.md`
- `docs/architecture/content-authoring-template-coverage.md`

No future content addition is considered production-ready until its stable IDs pass the same matrix/template/conformance path.