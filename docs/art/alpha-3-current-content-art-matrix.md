# Alpha 3 RC1 Current-Content Art Matrix

**Status:** exact **RC1 baseline inventory** reviewed at `codex/alpha3-campaign` / `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Not final V4 production authority.** Apply `alpha-3-v4-product-art-delta.md` before commissioning or validating active V4 art. The V4 delta retires permanent-upgrade production, replaces Well Protected with Warden Down, adds Forge/Foundry and final navigation art, and changes resource/source policy.

This file remains useful because it records what the frozen RC1 implementation actually contained and guards against count-only catalog mistakes.

---

# 1. RC1 catalog coverage

| RC1 data file/domain | RC1 player-facing visual need | V4 interpretation |
| --- | --- | --- |
| `abilities.json` | 8 active ability concepts/icons | active; V4 generic icon/resource contract |
| `achievements.json` | 10 RC1 badge identities | active set changes: Well Protected retires, Warden Down added |
| `arenas.json` | Junkyard world/location presentation | active + V4 Forge Foundry world packet |
| `asset-bundles.json` | grouping/loading only | no standalone art; V4 resource-bundle architecture expands |
| `audio-assets.json` / `audio-map.json` | audio | graphics out of scope |
| `characters.json` | 8 actors, portraits, passives; starting weapon reuses weapon art | active |
| `difficulty-profiles.json` | no standalone art | remains simulation/tuning only |
| `encounter-profiles.json` | no standalone art | Contract UI composes real enemy/location art |
| `enemies.json` | 10 actor sheets | active; Compendium reuses them by default |
| `equipment.json` | 32 piece icons + 8 Set emblems target | active, but V4 moves Set ownership out of provider pieces |
| `gun-parts.json` | 12 physical Part icons + 8 slot glyphs + shared trait emblems target | active under V4 generic icon contract |
| `loot-tables.json` | no loot-table icon | compose actual reward/drop art |
| `meta-upgrades.json` | 4 legacy RC1 progression concepts | **retired V4 production scope** |
| `reward-profiles.json` | no profile painting | result composes actual grants/availability |
| `spawn-curves.json` | no standalone art | simulation only |
| `stages.json` | chapter/location/objective/boss presentation | active; V4 final Contract IA + Forge location |
| `upgrades.json` | 18 run-upgrade icons | active |
| `visual-art.json` | RC1 runtime binding inventory | V4 refactors logical bindings vs physical resources |
| `weapon-feel.json` | procedural muzzle/impact/recoil | remains runtime presentation data unless later evidence justifies sprites |
| `weapons.json` | 9 rack icons, 9 held weapons, 3 family projectiles + legacy default projectile | active |

Rule:

> Future exhaustiveness starts from **all active player-facing V4 data catalogs + all major UI surfaces + logical art registry/resources**, not from one manifest or count.

---

# 2. Exact RC1 collision-prone stable-ID sets

These sets exist because the first PR review proved that counts can be correct while identities are wrong.

## Run upgrades — exact RC1 18

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

Any active V4 run-upgrade production matrix must equal the authoritative target catalog by stable ID; `Last Stand` was an invalid earlier invented replacement and is not current content.

## Gunsmith Parts — exact RC1 12

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

RC1 Part slots include:

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

Earlier imagined “Long-Range Optic / Stable Stock / Standard Underbarrel / Incendiary Barrel” rows were review errors, not current definitions.

## RC1 achievements — exact 10

```text
achievement:first-kill
achievement:kill-milestone-25
achievement:kill-milestone-100
achievement:first-merge
achievement:boss-crusher
achievement:chapter-junkyard
achievement:first-victory
achievement:mastery-scrap-tabby
achievement:scrap-banked-1000
achievement:permanent-reinforced-coat-3
```

V4 active target explicitly:

```text
remove active: achievement:permanent-reinforced-coat-3 / Well Protected
add active:    achievement:boss-forge / Warden Down
```

Historical earned Well Protected state is a Save V4 migration concern, not an active art requirement.

---

# 3. RC1 legacy permanent/meta progression — historical only

The four RC1 concepts were:

```text
reinforced-vest
quick-paws-training
sharpened-ammo
magnetic-whiskers
```

They were correctly discovered in the RC1 exhaustiveness audit because the old Progression surface exposed them even though they were not dedicated visual-manifest entries.

V4 retires that purchasable domain. Therefore:

- do not commission these four icons for active V4;
- do not keep the old feature merely because briefs once existed;
- do not treat their absence from V4 art as a completeness failure.

---

# 4. Non-raster/procedural decisions retained

Do not create bespoke images merely to inflate art count.

Keep procedural/live UI where it is the truthful owner:

- weapon muzzle/impact/recoil timing;
- meter fill amounts;
- focus/locked/disabled state overlays;
- encounter/difficulty/spawn simulation data;
- reward-profile identity itself.

Reward surfaces show actual Scrap/items/projects; Contract surfaces show actual chapter/location/objective/threat art.

---

# 5. Major UI surface cross-check

V4 production must provide or compose art for:

| Surface | Art source |
| --- | --- |
| Home | title/backdrop + Play Contract + next-Contract composition |
| Contracts | chapter/location/objective/boss/reward composition |
| Mercenary | portrait/actor/ability/passive/weapon art |
| Loadout / Equipment | Set emblems, item icons, shared stat/state chrome |
| Loadout / Gunsmith | weapon/Part/slot/trait art |
| Career | real next-goal content art; Achievement badges; Compendium mark |
| Compendium | final enemy sheets; shared Career list/chrome |
| Training | practice/Golden Run identity if retained |
| Settings | settings/audio/fullscreen/reduced-motion glyphs |
| HUD | health/timer/objective/ability + XP/Scrap reuse |
| Upgrade chooser | exact run-upgrade icons + card chrome |
| Inventory/rack/merge | weapon art + merge/focus state |
| Results | clear/fail + actual reward/build/availability composition |

No generic top-level Progression production family remains in V4.

---

# 6. Final authority / production gate

For V4 production read:

1. `alpha-3-v4-product-art-delta.md` — active V4 overrides;
2. `alpha-3-art-production-briefs.md` — unchanged detailed item/family directions only;
3. `../architecture/content-authoring-templates-v4.md` — scalable logical/resource authoring;
4. `../architecture/alpha-3-final-execution-handoff.md` — sequencing/resource prerequisites;
5. #167/#170 implementation trackers.

PASS uses exact **stable-ID equality**, not only counts. A new V4 catalog/UI addition updates the active coverage matrix/resource metadata as part of its generic conformance gate.
