# Alpha 3 Current-Content Art Matrix

**Status:** final exhaustiveness companion to `alpha-3-art-production-briefs.md` for Issue #167.

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

This file exists because a visual-manifest audit alone is not enough: some current player-facing data uses text or borrowed icons and therefore has no dedicated `visual-art.json` binding yet. The final review checks every current `src/data` catalog and records whether it requires dedicated art, composes existing art, or deliberately remains procedural/textual.

If this matrix and the main production brief differ on completeness, **this matrix is the later exhaustive review**.

---

## 1. Current data-catalog coverage

| Data file | Player-facing visual need | Production coverage |
| --- | --- | --- |
| `abilities.json` | 8 active ability icons | Main brief §4 |
| `achievements.json` | 10 achievement badges + hidden treatment | Main brief §10 |
| `arenas.json` | 15 world assets + one location-card composition | Main brief §§13–14 |
| `asset-bundles.json` | No standalone art; owns grouping/loading only | Explicitly none |
| `audio-assets.json` | Audio, not graphics | Out of graphics scope |
| `audio-map.json` | Audio routing, not graphics | Out of graphics scope |
| `characters.json` | 8 actor sheets, 8 portraits, 8 passive icons; starting weapon reuses weapon art | Main brief §§3, 5, 6 |
| `content-version.json` | No player-facing art | Explicitly none |
| `difficulty-profiles.json` | No dedicated art; difficulty remains text/state, not a fake badge taxonomy | Explicitly none |
| `encounter-profiles.json` | No standalone art; stage cards compose real monster/stage art where needed | Explicitly none |
| `enemies.json` | 10 actor sheets; Compendium reuses them | Main brief §11 + Compendium plan |
| `equipment.json` | 32 dedicated piece icons + 8 set emblems | Main brief §9 |
| `gun-parts.json` | 12 part icons + 7 slot glyphs + 3 currently used trait emblems | Main brief §8 |
| `loot-tables.json` | No loot-table icon. Rewards compose XP/scrap/chest/weapon/part/equipment art | Main brief §§6, 8, 9, 12 |
| `meta-upgrades.json` | **4 current legacy progression icons** | Section 2 below |
| `reward-profiles.json` | No reward-profile painting; compose actual granted item/currency icons | Explicitly none |
| `spawn-curves.json` | Simulation data, no standalone art | Explicitly none |
| `stages.json` | 2 chapter emblems, 1 location card, 4 objective icons, boss marker | Main brief §14 |
| `upgrades.json` | 18 run-upgrade icons | Main brief §7 |
| `visual-art.json` | 77 current runtime bindings need approval/replacement audit | Main brief §§2–13 |
| `weapon-feel.json` | Muzzle/impact/recoil remain runtime procedural feedback, not raster sprites | Explicitly none |
| `weapons.json` | 9 rack icons, 9 held weapons, 3 family projectiles; legacy default projectile separately retained/reviewed | Main brief §6 |

### Rule established by this review

Future exhaustiveness passes start from **all current player-facing data catalogs + all UI surfaces + the visual manifest**, not from `visual-art.json` alone.

---

# 2. Legacy permanent/meta progression — 4 icons

These four definitions are still present in `meta-upgrades.json` and therefore need a deliberate visual treatment for as long as the Progression surface continues to expose them. They use the 24×24 semantic icon language but must not collide with similarly named run upgrades, passives or equipment.

If #165 retires the legacy Progression system entirely, remove these requirements together with the player-facing feature; do not keep the feature merely because icons were produced.

## 2.1 Reinforced Vest — `reinforced-vest`

**Meaning:** permanent maximum-health training/upgrade.

**Brief:** a simple work vest mounted on a small workshop mannequin/stand, with **two stacked added reinforcement plates** across the torso and a small upward progression notch beneath it. The training/installed-upgrade framing is important: this must not look like an equippable inventory item.

**Palette/read:** dark workwear, steel plates, cream edge; one restrained teal progress accent.

**Must not become:**

- run upgrade **Reinforced Coat**, which is a patched wearable coat/vest with one plate;
- Commando/Juggernaut equipment armor, which is an owned physical equipment piece;
- a generic heart icon.

**Black-silhouette cue:** vest-on-stand + double plate.

## 2.2 Quick Paws Training — `quick-paws-training`

**Meaning:** permanent movement-speed training.

**Brief:** two paw prints crossing **three chunky workshop stepping blocks/training markers** in sequence, ending with a small upward arrow-notch built into the last block. The course/conditioning motif distinguishes permanent training from an immediate speed effect.

**Palette/read:** cream paw marks, dark/steel blocks, small cyan progress notch.

**Must not become:**

- run upgrade **Quick Paws**, which is only forward paw prints + speed ticks;
- Volt Lynx **Light Paws**, which uses narrow airborne lynx prints;
- Adrenaline, which uses a speedometer arc.

**Black-silhouette cue:** paw trail over three rectangular steps.

## 2.3 Sharpened Ammo — `sharpened-ammo`

**Meaning:** permanent weapon-damage improvement.

**Brief:** one broad, clearly fictional filed scrap slug held against a small **workshop grinding/file wheel or beveling jig**, with a bright newly cut edge on the slug. The workshop operation is the main semantic cue: this is permanent preparation, not an in-run projectile effect.

**Palette/read:** steel slug, dark jig, cream freshly filed edge, small rust/cyan workshop accents.

**Must not become:**

- **Heavy Rounds**, which is one oversized weighted slug;
- **Punch Through**, which is a projectile crossing plates;
- the PIERCING trait emblem;
- realistic ammunition.

**Black-silhouette cue:** broad slug + circular/angled filing jig contact.

## 2.4 Magnetic Whiskers — `magnetic-whiskers`

**Meaning:** permanent pickup-radius improvement.

**Brief:** a compact cat muzzle/cheek silhouette with **two long bent whiskers ending in small salvage-coil tips**, drawing one bolt inward from each side. Keep the muzzle abstract enough to read at 24px; the paired whiskers are the dominant shape.

**Palette/read:** cream muzzle/whiskers, dark outline, teal coil tips, one rust bolt.

**Must not become:**

- **Scrap Magnet**, which is a horseshoe magnet pulling a bolt;
- Scrap Weasel **Magnet Belly**, which is a belt coil around one bolt;
- **Scavenge Pulse**, which is a central coil sending pulse rings;
- Scrap Tabby **Scrap Hoarder**, which is a pouch.

**Black-silhouette cue:** central muzzle with two long symmetrical hooked whiskers.

---

# 3. Non-raster / procedural graphics explicitly reviewed

The following current visual feedback does **not** need a bespoke sprite simply to make the art list longer.

## Weapon feel

`weapon-feel.json` currently owns family-specific muzzle radius/color, impact radius/color and recoil. Keep muzzle flash/impact as crisp bounded runtime FX unless visual review proves a pixel sprite materially improves readability. Runtime remains the timing authority. If sprite FX are later introduced, create one small family per genuinely different shape and keep lifetime/recoil out of the asset.

## Health / XP meters

Meters remain runtime geometry with art-backed framing/glyphs. Do not bake meter fill amounts into sprites.

## Focus, locked, disabled and rarity state

Use reusable UI chrome/state overlays from the main brief. Do not redraw every card in every state.

## Encounter/difficulty/spawn data

These change simulation/composition. The stage card communicates them through real stage/objective/enemy presentation, not invented “difficulty art” that can drift from actual rules.

## Rewards

Reward surfaces show the actual rewarded item/part/equipment/scrap art. A `reward:stage-01` icon would be duplicate truth.

---

# 4. UI-surface cross-check

The final review also checked current major player-facing surfaces rather than only data files.

| Surface | Required art source |
| --- | --- |
| Main menu | title lockup, backdrop, reusable navigation/chrome |
| Stages/Contracts | chapter, arena, objective, boss marker, state overlays |
| Golden Run / legacy Arena | Golden Run nav emblem + Junkyard location/world art |
| Characters | portrait, actor, active/passive icons, weapon icon, stat glyphs |
| Progression | four meta-upgrade icons in this file; remove if feature is removed |
| Gunsmith | weapon icons, part/slot/trait icons, stat glyphs, UI chrome |
| Equipment | 32 item icons, 8 set emblems, stat glyphs, state chrome |
| Achievements | 10 badges + hidden/locked treatment |
| Compendium | final enemy sheets + Compendium nav/chrome; no duplicate portraits by default |
| Settings | audio/music/SFX/reduced-motion/fullscreen glyphs |
| HUD | XP/scrap reuse, health/timer/kills, objective/ability art |
| Touch/controller controls | device-neutral logical-action glyphs |
| Upgrade chooser | 18 upgrade icons + consistent card chrome |
| Inventory/rack/merge | weapon icons + merge symbol + card/focus chrome |
| Run result/summary | clear/fail emblem + actual earned/build art |

No current major gameplay/menu surface is left with an unclassified art source after this pass.

---

# 5. Final distinguishability review after the meta-upgrade correction

The four newly discovered progression icons were compared against the most collision-prone existing concepts:

- Reinforced Vest vs Reinforced Coat vs equipment armor — **separated by mannequin/training framing and double-plate construction**.
- Quick Paws Training vs Quick Paws vs Light Paws vs Adrenaline — **separated by stepping-course blocks**.
- Sharpened Ammo vs Heavy Rounds vs Punch Through vs PIERCING — **separated by visible workshop filing/jig operation**.
- Magnetic Whiskers vs Scrap Magnet vs Magnet Belly vs Scavenge Pulse — **separated by paired whisker silhouette and central muzzle**.

All four survive a black-silhouette description without requiring their labels.

---

# 6. Review closure

This companion was added after an intentionally hostile post-write check found the main packet's only material current-content omission: `meta-upgrades.json` was player-facing but absent from the visual manifest, so it escaped the earlier manifest-led inventory.

The follow-up then walked **every file in `src/data/`** and every major current UI surface, classifying it as:

1. dedicated production art required;
2. art composed/reused from an already planned domain;
3. intentionally procedural/textual; or
4. non-graphics scope.

No further current catalog or player-facing surface produced an unbriefed graphics requirement. The combined production authority for #167 is therefore:

- `docs/art/alpha-3-art-production-briefs.md`
- **this exhaustive current-content matrix**

A future data/UI addition must update the same coverage matrix as part of its conformance gate.
