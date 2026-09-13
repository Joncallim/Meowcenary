# Alpha 3 Art Production — V4 Product Delta

**Status:** authoritative V4 override for `alpha-3-art-production-briefs.md` and `alpha-3-current-content-art-matrix.md`.

**Execution/resource authority:** `../architecture/alpha-3-final-execution-handoff.md`, `../architecture/content-authoring-templates-v4.md`, and #170.

**How to read this:** the earlier art brief remains useful for unchanged detailed character/enemy/weapon/current-content design directions. This file **supersedes every V4/product/resource/source-policy difference listed below**. Do not implement stale wording from the earlier brief when this delta says otherwise.

The post-acceptance review deliberately changed the target game after the RC1 art inventory was frozen. Do not commission art for retired plumbing merely because it existed in RC1.

---

# 1. Active V4 catalog corrections

## Retired active achievement: Well Protected

Do not commission a new V4 badge for:

```text
achievement:permanent-reinforced-coat-3 — Well Protected
```

It belongs to the retired permanent-stat shop. Save V4 preserves already-earned historical completion where authoritative history exists, but the definition is removed from the active V4 achievement catalog.

Any Well Protected badge direction in the older brief is **historical/retired production scope**, not a missing V4 asset.

## New active achievement: Warden Down

Target stable ID:

```text
achievement:boss-forge — Warden Down
```

32x32 badge direction:

- shared workshop medal/patch frame;
- tall split furnace-gantry faceplate;
- central furnace throat;
- one broken asymmetric tool arm dropping outward;
- clean diagonal fracture through the hot core.

Palette: dark gunmetal/charcoal, cream fracture, restrained copper/orange accent. It must remain distinct in grayscale from Crusher Down.

Must not become a generic crown/skull boss badge or the intact Forge chapter emblem.

---

# 2. Retire permanent/meta-upgrade production art

V4 retires the legacy purchasable permanent-stat shop and generic Progression destination.

Therefore the four RC1 meta-upgrade icon briefs are **not active V4 production requirements**:

```text
reinforced-vest
quick-paws-training
sharpened-ammo
magnetic-whiskers
```

Do not commission them merely because `meta-upgrades.json` existed in RC1. Their historical concepts remain in Git history for migration/debug context.

If a future product feature genuinely introduces a new persistent upgrade domain, it receives a new reviewed V4 content/mechanic contract rather than reviving this retired catalog implicitly.

---

# 3. Forge / Foundry world packet — justified second location family

The earlier art pass correctly refused to invent a second Arena solely to create pictures. V4 now has a product reason: Forge chapter requires a real Foundry location using the existing Arena architecture.

Family thesis:

> **A working improvised foundry built into reclaimed industrial scrap.**

Contrast:

| Junkyard | Forge / Foundry |
| --- | --- |
| scattered salvage | processed/ordered industrial material |
| open dirty plate yard | heat-management lanes |
| tyre/crate/engine junk | ingots/coils/quench/ducting |
| rust + cyan power accents | charcoal + refractory cream + copper heat accents |
| hanging salvage press | furnace throat / cooling manifold |
| irregular debris | deliberate grates/rails/heat-safe boundaries |

Do not make Forge a generic lava level. Heat is contained industrial machinery; most floor remains usable work space.

## 3.1 Floor family — 3

### `world:forge-floor:base`

32x32 seamless dark charcoal/steel plate floor with broad refractory seam and sparse square fasteners. Straighter/more maintained than Junkyard. Quiet average value.

### `world:forge-floor:grate-patch`

32x32 compatible variant with one broad drain/grate band, dark negative slots and restrained copper edge. Visual-only slots must not imply a pit/collider.

### `world:forge-floor:heat-scar`

32x32 refractory plate with historical heat-discoloration arc/ring and replacement weld. No active glow; distinct from live heat hazard.

## 3.2 Boundary family — 4

### `world:forge-boundary:straight`

Heavy refractory lower mass + continuous steel rail/duct. Inner edge matches collision truth.

### `world:forge-boundary:corner`

Turns the same inner collision edge cleanly; no decorative overhang into the playable lane.

### `world:forge-boundary:patch`

Repaired straight segment with oversized cream refractory replacement tile and dark clamps while structural line remains continuous.

### `world:forge-boundary:gate`

Industrial feed/chute aperture framed by rollers/heat shields. Opening matches actual spawn/passability semantics.

Black silhouette must be straighter/heavier/more engineered than Junkyard’s stacked-scrap wall.

## 3.3 Low props — 6

- `world:forge-prop:coil-rack` — two large rolled coils on squat rack; circular negative space; not tyres.
- `world:forge-prop:ingot-pallet` — broad stacked ingots, not tiny bar noise.
- `world:forge-prop:quench-drum` — short wide tank, dark liquid opening, thick hose; not generic hazard barrel.
- `world:forge-prop:tool-cart` — low tray/cart with broad tool silhouettes; not a vehicle.
- `world:forge-prop:slag-pile` — low cooled dark slag; no active glow/damage implication.
- `world:forge-prop:heat-beacon` — original shutter/lens warning post; avoid copied regulatory symbol/text.

Decorative versions must not visually promise collision that does not exist.

## 3.4 Landmarks / obstacle skins — 2

### `world:forge-landmark:furnace-throat`

64x64 minimum. Squat-wide furnace with dark central throat, cream refractory rim, asymmetric exhaust hood, copper heat pipe/valve mass and chassis aligned to actual footprint.

Must not resemble Forge Warden, which is tall/articulated/mobile.

### `world:forge-landmark:cooling-manifold`

64x64 minimum. Twin-cylinder cooling assembly, serpentine pipe and large dark fan/radiator grid. Small coolant/control accent only. Silhouette differs from Junkyard barrel power stack.

## 3.5 Active heat hazard — 1

### `world:forge-hazard:heat-grate`

32x32 tiling gameplay hazard: thick dark grate/vent, broad refractory border, contained cream->copper/orange hot underlayer.

Safe floor vs live hazard must differ in grayscale by grate density/border silhouette, not hue alone.

Runtime owns damage/timing/rect. Art tiles/clips to exact hazard bounds. Reduced motion never removes danger readability.

Forge world packet total:

```text
3 floor
4 boundary
6 low props
2 landmarks
1 heat hazard
= 16 world assets
```

plus Forge chapter/location presentation.

---

# 4. Forge chapter / location presentation

## Chapter emblem

Intact clipped furnace hood + refractory side blocks + feed-route notch + contained hot core. It is a location/chapter identity, not the destroyed Warden Down badge.

## Location card

Crop-safe roughly 96x64 composition:

- dark plate/grate floor;
- refractory boundary rail;
- furnace throat on one rear side;
- cooling manifold opposite;
- open central navigation lane;
- small heat-grate cue;
- no monsters/text baked in.

Junkyard and Forge cards must remain distinguishable at thumbnail size by composition, not only palette.

---

# 5. Final V4 navigation art

The older generic navigation inventory is superseded by the final player-facing structure:

```text
Play Contract
Mercenary
Loadout -> Equipment / Gunsmith
Career -> Next Goals / Achievements / Compendium
Training (optional Golden Run)
Settings
```

There is no peer Home `Arena` destination and no generic top-level `Progression` icon.

## Play Contract — `ui-nav:play-contract`

Workshop contract/tag plate intersected by bold forward route notch. Reads mission + go; no tiny clipboard text.

## Home next-Contract frame — `ui-home:next-contract-frame`

Reusable decorated frame with space for chapter/location/objective/reward content. Focus/selection is live UI state, not baked art.

## Mercenary — `ui-nav:mercenary`

Original animal-ear silhouette over simple diagonal tool/weapon harness strap. No military rank chevrons.

## Loadout — `ui-nav:loadout`

Interlocked weapon receiver + armour plate in divided workshop tray. Equipment/Gunsmith child surfaces reuse their own icon vocabularies.

## Career — `ui-nav:career`

Workshop service strip with large accomplishment notches + rising route node. No generic trophy cup.

## Compendium — `ui-nav:compendium`

Open riveted field-guide plate with one large monster-eye/silhouette print; no tiny fake writing.

## Training — `ui-nav:training`

Workshop practice target on stand + short route/motion mark. If Golden Run is retained, gold/cream accent is secondary to the practice silhouette.

Settings retains the existing system-configuration family.

---

# 6. Career composition rule

Career next-goal rows compose authoritative content art rather than receiving bespoke art per generated sentence:

```text
next Contract -> chapter/location/objective art
next boss -> boss actor/badge silhouette
Mercenary unlock -> portrait
mastery -> portrait + reusable mastery treatment
achievement -> badge when spoiler-safe
Compendium progress -> Compendium mark + count
```

Do not create another duplicate icon database for Career.

---

# 7. Generated / selected source policy — V4 supersession

The earlier absolute wording that generated concept pixels can never become production pixels is superseded.

V4 rule:

- exploratory boards are not automatically runtime art;
- a generated sheet/image may become a **selected production source** after deliberate review;
- preserve the untouched selected generated source as provenance;
- import through a deterministic source pipeline;
- review/edit/polish in Pixelorama as required for silhouette, palette, originality, anchor, frame/tag and scale quality;
- final builder/import parity reproduces the **accepted production source**, not an obsolete pre-polish concept;
- real-game review determines acceptance.

No ceremonial manual redraw is required solely because generation contributed to the accepted source.

This policy does not weaken originality review: copied/reference-game expression remains prohibited.

---

# 8. Logical art / physical resource production rule

Use `../architecture/alpha-3-final-execution-handoff.md`, `../architecture/content-authoring-templates-v4.md` and #170—not the retired intermediate blueprint—as authority.

Separate:

```text
stable logical VisualArtBinding identity
from
physical image / atlas / spritesheet resource identity
```

For static UI art:

- one stable logical ID per semantic asset;
- editable source + deterministic builder/import retained;
- runtime may pack many logical IDs into deterministic named-frame atlases;
- atlas frame index/position is never semantic identity;
- repacking cannot rename gameplay/save/logical art IDs.

Animated actors/world textures may stay dedicated resources when simpler.

Renderer kinds describe behavior (`icon`, `portrait`, `animated-actor`, `world`, etc.), not semantic ownership. Equipment/Achievement/Part/Ability icons do not each create a renderer branch.

Bulk #167 production does not land onto RC1’s one-binding/one-texture/global-Boot-preload model before #170’s resource foundation is ready.

---

# 9. Active V4 stable-ID coverage gate

Before production, compare exact stable ID sets from **target V4 catalogs**, not count alone.

Required equality/coverage includes:

```text
Mercenaries -> actor + portrait + passive + referenced ability presentation
Enemies -> actor
Run upgrades -> icon
Active achievements -> badge
Equipment Sets -> emblem
Equipment pieces -> icon
Gun Parts -> icon
Abilities -> active icon
Contracts/chapters/Arenas -> presentation/world refs
Compendium -> enemy actor by default; no duplicate portrait requirement
```

Retired content such as Well Protected/meta-upgrade icons is explicitly excluded from active V4 coverage.

A count of 10 badges is not proof if one real stable ID was replaced with an invented one.

---

# 10. Mandatory distinguishability groups

Review side-by-side in black silhouette/grayscale where applicable:

### World

- Junkyard base vs Forge base;
- Junkyard gate vs Forge feed gate;
- tyre pile vs Forge coil rack;
- power stack vs cooling manifold;
- oil stain vs cooled slag vs active heat grate;
- hanging press vs furnace throat.

### Boss/chapter

- Forge chapter emblem vs Forge location card vs Forge Warden actor vs Warden Down badge;
- Crusher Down vs Warden Down.

### Navigation

- Play Contract vs Career;
- Mercenary vs Compendium;
- Loadout vs Gunsmith child icon;
- Training vs Play Contract.

Each group passes:

1. black silhouette where relevant;
2. grayscale;
3. 24–32px icon scale;
4. 390x844 live composition;
5. label-hidden recognition by independent review.

If text is required to separate two semantic icons, revise the art.

---

# 11. Production workflow

Per family:

1. generate exact target stable-ID inventory;
2. instantiate detailed family/item brief;
3. explore multiple directions where ambiguity warrants it;
4. select with collision/originality rationale;
5. create or import committed editable production source;
6. preserve deterministic source/build/import parity;
7. export through logical-art/resource/atlas pipeline;
8. run generic art/content/parity validation;
9. review silhouette, grayscale, palette, anchor, animation, threat/semantic read, originality and reduced motion;
10. review in actual 360x640 / 390x844 and desktop composition;
11. record approved source/export/resource mapping.

---

# 12. V4 art PASS

The V4 art tranche is complete only when:

- exact active V4 stable-ID coverage passes;
- Well Protected/meta-upgrade production is retired and Warden Down exists;
- all 16 Forge world assets + Forge location/chapter presentation are approved;
- final Contract/Mercenary/Loadout/Career/Compendium/Training navigation art is approved;
- unchanged detailed Mercenary/enemy/weapon/run-upgrade/Equipment/Part briefs are instantiated correctly;
- logical bindings map to bounded physical resources/atlases under #170;
- source/builder/export parity is machine-checked;
- actors/icons/pickups/world are distinct in grayscale/silhouette where required;
- real 360x640 / 390x844 + desktop review passes;
- no active shipped content depends on accidental clone/placeholder/borrowed final art.

Do not start or close bulk production from the older brief without applying this delta.
