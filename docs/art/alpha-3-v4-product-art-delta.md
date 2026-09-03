# Alpha 3 Art Production — V4 Product Delta

**Status:** authoritative product-delta companion to `alpha-3-art-production-briefs.md` and `alpha-3-current-content-art-matrix.md`.

**Read order:** the main art brief remains the authority for unchanged assets. This file **supersedes** only the V4/product decisions listed below.

**Reason for delta:** the post-acceptance product review deliberately changed the target game after the original “current Alpha 3” art inventory was frozen. Do not commission art for retired plumbing merely because it appeared in the earlier list.

---

# 1. Target-catalog corrections

## 1.1 Retired badge: Well Protected

Do **not** commission a new final badge for:

```text
achievement:permanent-reinforced-coat-3 — Well Protected
```

That achievement is tied to the legacy permanent-upgrade shop retired by the V4 product plan. Existing earned save history is preserved by migration, but the goal is not advertised to new V4 players.

The earlier Well Protected badge brief is therefore **retired production scope**, not a missing asset.

## 1.2 Replacement active badge: Warden Down

New active target:

```text
achievement:boss-forge — Warden Down
```

**Meaning:** defeat Forge Warden.

**32×32 badge brief:** the shared junkyard/workshop medal frame contains a **split furnace-gantry faceplate**: tall hood/gantry silhouette, central furnace throat, one broken asymmetric tool arm dropping outward and a clean diagonal fracture through the hot core. The broken tool-arm silhouette is mandatory.

**Palette:** dark gunmetal/charcoal, cream fracture, restrained copper/orange hot-core accent. Badge must still read with accent removed.

**Must not become:**

- Crusher Down, which is a broad horizontal compactor jaw with central fracture;
- generic crown/skull “boss defeated” art;
- Forge chapter emblem, which is an intact furnace/route identity rather than a destroyed boss;
- Demolition/EXPLOSIVE badge language.

**Black-silhouette cue:** tall gantry + one visibly fallen/broken side arm.

**Grayscale gate:** Crusher Down and Warden Down must be distinguishable with all color removed.

---

# 2. Forge / Foundry world packet — new justified location family

The earlier art plan correctly refused to invent a second arena merely to generate more pictures. The product review now provides the missing justification: the existing Forge chapter cannot feel like a new chapter while every contract takes place in the exact Junkyard Lot art/bundle.

The Forge location remains mechanically inside the existing Arena system. This is a **world-art/content packet**, not a new map engine.

## Family thesis

**“A working improvised foundry built into reclaimed industrial scrap.”**

Visual contrast against Junkyard:

| Junkyard | Forge / Foundry |
| --- | --- |
| scattered salvage | processed/ordered industrial material |
| open dirty plate yard | enclosed heat-management lanes |
| tyre/crate/engine junk | ingots/coils/quench/ducting |
| rust + cyan power accents | charcoal + refractory cream + copper heat accents |
| hanging salvage press | furnace throat / cooling manifold |
| irregular debris | deliberate grates, rails, heat-safe boundaries |

Do not make Forge a generic lava level. Heat is contained by machinery; most floor remains navigable industrial work space.

## 2.1 Floor family — 3 tiles

### `world:forge-floor:base`

**32×32 seamless tile.** Dark charcoal/steel plate floor with one broad refractory seam and sparse square fasteners. Compared with Junkyard base, seams are straighter and more deliberately maintained. Average value remains quiet enough for cream/cyan/orange actors and drops.

**Must not:** repeat the Junkyard random plate-break pattern; contain glowing lava; imply collision.

### `world:forge-floor:grate-patch`

**32×32 seamless-compatible variant.** One large industrial drain/grate band crossing part of the tile with very dark negative slots and a restrained copper edge. Slots are visual only and cannot look like holes the player should avoid.

**Silhouette/value cue:** broad parallel bars.

### `world:forge-floor:heat-scar`

**32×32 variant.** Refractory plate with one large heat-discoloration ring/arc and welded replacement seam. No active glow: this is historic heat wear, not a live hazard.

**Must not:** resemble the active heat-grate hazard below.

## 2.2 Boundary family — 4 tiles

### `world:forge-boundary:straight`

**32×32.** Heavy lower refractory brick/plate mass topped by one continuous steel safety rail/duct. The clean inner edge must match collision truth.

### `world:forge-boundary:corner`

**32×32.** Turns the refractory mass and top rail cleanly. The inner playable corner remains visually open; no diagonal overhang beyond collider intent.

### `world:forge-boundary:patch`

**32×32.** Repaired straight segment with one oversized cream refractory replacement tile held by dark corner clamps. Structural line/rail remains continuous.

### `world:forge-boundary:gate`

**32×32.** Narrow industrial feed/chute opening framed by two vertical rollers/heat shields. Unlike Junkyard’s salvage gate, this is a material-feed aperture. Opening must match actual spawn/passability semantics.

**Boundary collision gate:** in black silhouette, Forge boundary is straighter/heavier/more engineered than the Junkyard stacked-scrap wall.

## 2.3 Low/decorative props — 6 assets

These are non-colliding unless the Arena definition explicitly promotes one to an obstacle skin. Artwork must not imply an invisible collider.

### `world:forge-prop:coil-rack` — 32×24

Two large rolled metal coils on a squat open rack; one dominant circular negative space. Dark steel + copper edge. Reads manufactured stock, not tyres.

**Collision risk:** must sit low enough not to look impassable when decorative.

### `world:forge-prop:ingot-pallet` — 32×20

Three/four oversized rectangular ingots stacked in a deliberate offset pattern on one dark pallet/base. Use broad masses, not tiny bars.

### `world:forge-prop:quench-drum` — 22×26

Short wide cylindrical quench tank with cream rim, dark liquid opening and one thick side hose. No hazard-red barrel shorthand.

### `world:forge-prop:tool-cart` — 28×24

Low wheeled workshop cart with one broad top tray and two large tool silhouettes/clamps. Wheels are tiny support cues; cart is not a vehicle.

### `world:forge-prop:slag-pile` — 36×20

Low irregular dark cooled slag/glass-like chunks with one/two copper-brown crust facets. No active glow, no damage implication.

### `world:forge-prop:heat-beacon` — 18×28

Short industrial warning post with a large **striped shutter/lens housing**, not a copied road/construction beacon. Muted when decorative. Avoid text and familiar regulatory symbols.

## 2.4 Landmarks / obstacle skins — 2 assets

### `world:forge-landmark:furnace-throat` — 64×64 minimum

Primary Forge landmark. Squat-wide furnace body with:

- large central dark mouth/throat;
- thick cream refractory rim;
- asymmetric upper exhaust hood;
- one copper heat pipe/valve mass;
- broad lower chassis aligned to its real obstacle footprint.

The throat may contain a restrained warm interior accent but must not spill a permanent huge glow into gameplay space.

**Must not become:** Forge Warden boss. The boss is tall, articulated and mobile; this landmark is broad, fixed and architectural.

### `world:forge-landmark:cooling-manifold` — 64×64 minimum

Large vertical/sideways industrial cooling assembly with two broad cylinders, one serpentine pipe and a big dark fan/radiator grid. Cyan may appear only as a small coolant/control accent, not the Junkyard power-stack identity.

**Silhouette:** twin-cylinder + pipe loop; unmistakably different from Junkyard barrel power stack.

## 2.5 Active heat hazard — 1 tile family

### `world:forge-hazard:heat-grate`

**32×32 tiling gameplay hazard surface.** Thick dark grate/vent with broad refractory border and a visible contained hot underlayer. The hot region uses cream → copper/orange, not pure red rectangle fill.

The safe floor and live heat hazard must be distinguishable in grayscale through **grate density + border silhouette**, not color alone.

Runtime presentation contract:

- `HazardDefinition` gains an explicit presentation art reference (name may follow final schema);
- HazardSystem remains the damage owner but renders a tiled art-backed surface when provided;
- collider/rect dimensions remain authoritative;
- art is clipped/tiled to the exact hazard bounds;
- old/no-art hazard definitions retain a clear procedural fallback;
- reduced motion does not remove the danger read.

**Do not bake damage timing/amount into art.**

## Forge packet count

```text
3 floor tiles
4 boundary tiles
6 low props
2 landmark/obstacle skins
1 hazard tile
= 16 Forge world production assets
```

Plus the existing Forge chapter/location card/emblem composition described below.

---

# 3. Forge chapter presentation corrections

## Forge chapter emblem

Retain the existing core direction—furnace hood + contained hot core—but now tie it to the new world family:

- clipped furnace hood silhouette;
- two short refractory side blocks;
- one central feed-route notch;
- contained orange/cream core;
- dark steel outer mass.

It must look like an **intact location identity**, not the broken Warden Down achievement.

## Forge location card

Add a dedicated crop-safe card (roughly 96×64 logical composition target):

- dark plate/grate floor;
- refractory boundary rail;
- furnace throat at one rear side;
- cooling manifold opposite;
- one open navigable central lane;
- small heat-grate cue that does not dominate;
- no monsters/text baked in.

The Junkyard card and Forge card must be distinguishable at thumbnail size by large composition, not only palette.

---

# 4. V4 menu/navigation art authority

The earlier generic navigation set is superseded by these player-facing destinations.

## 4.1 Home / Play Contract

### `ui-nav:play-contract`

Primary CTA glyph: clipped workshop contract/tag plate intersected by a bold forward route notch/arrow. Avoid clipboard-with-tiny-lines. It should imply **mission + go**.

### `ui-home:next-contract-frame`

Reusable decorated card/frame, not stage-specific painting. Broad corner clamps, small route rail and space reserved for chapter/location/objective/reward art. Selection/focus remains UI state, not baked pixels.

## 4.2 Mercenary

### `ui-nav:mercenary`

Original mercenary identity: cat/dog/animal ear silhouette over a simple diagonal tool/weapon harness strap. Do not use military rank chevrons.

Roster/detail surfaces reuse character portraits, ability/passive icons and weapon art rather than creating another character icon family.

## 4.3 Loadout

### `ui-nav:loadout`

Interlocked **weapon receiver silhouette + armour plate** in a divided workshop tray. Both halves must survive 24px; not a generic backpack.

Subsurface glyphs:

- Equipment reuses the equipment-set/armour vocabulary;
- Gunsmith reuses receiver/wrench/component vocabulary.

## 4.4 Career

### `ui-nav:career`

A short vertical **workshop service strip** with three large stamped accomplishment notches and one rising route node. No literal trophy cup. This is goals/history/knowledge, not spendable stats.

Career children:

- Achievements use badge art;
- Compendium uses its own field-guide nav mark;
- mastery/next-goal overview composes real character/stage/achievement art.

## 4.5 Compendium

### `ui-nav:compendium`

Open riveted field-guide plate with one large monster-eye/silhouette print on the visible page. No tiny fake writing. Distinct from generic book icon through scrap-binding tabs and monster mark.

## 4.6 Training / Golden Run

### `ui-nav:training`

Workshop practice target made from one circular scrap plate on a stand, crossed by a short motion route. If Golden Run is retained, use a small gold/cream accent as state/name support; silhouette must still read as **practice**, not main campaign.

Do not keep a standalone Arena navigation icon on Home.

## 4.7 Settings

Keep existing settings icon family; it remains system configuration rather than progression/content.

---

# 5. Career overview art composition

Career next-goal rows do **not** receive bespoke art per generated sentence. They compose authoritative content art:

- next Contract → chapter/location/objective art;
- next boss → boss actor/badge silhouette;
- character unlock → portrait;
- mastery → character portrait + reusable mastery notch/frame;
- achievement target → achievement badge when spoiler-safe;
- Compendium progress → reusable Compendium mark + counts.

This prevents the Career surface from becoming another duplicate icon database.

---

# 6. Active V4 art-catalog identity gate

Before production begins, generate/compare stable ID sets from the **target V4 catalogs**, not only the current RC1 files.

Required equality sets include:

```text
characters -> actor + portrait + passive (+ referenced ability)
enemies -> actor
run upgrades -> upgrade icon
active achievements -> badge
Equipment Sets -> emblem
Equipment pieces -> piece icon
Gun Parts -> part icon
abilities -> active icon
stages/chapters/arenas -> presentation/world references
Compendium -> no duplicate portrait requirement; uses enemy actor by default
```

Retired content such as Well Protected is tracked explicitly as retired and must not make “missing asset” checks fail.

No count-only completeness test is accepted.

---

# 7. Logical art / physical resource production rule

This delta adopts the resource architecture in `alpha-3-implementation-blueprint.md`.

For static UI art:

- one logical stable art ID per semantic asset;
- editable Pixelorama/source + deterministic builder/import retained per logical asset/family;
- standalone reviewed export may be kept for provenance/inspection;
- runtime may consume a deterministic named-frame atlas resource;
- atlas frame position/index is not semantic identity;
- asset packing cannot change game/save IDs.

Large animated actors and world textures may remain dedicated physical resources when that is the simpler/readable contract.

The art producer should never need to add another renderer kind merely because the icon belongs to Equipment rather than Achievements.

---

# 8. Distinguishability review for the new packet

The following pairs are mandatory side-by-side review groups:

### Location/world

- Junkyard base floor vs Forge base floor;
- Junkyard gate vs Forge feed gate;
- tyre pile vs Forge coil rack;
- barrel power stack vs cooling manifold;
- oil stain vs cooled slag pile vs active heat grate;
- hanging press vs furnace throat.

### Chapter/boss

- Forge chapter emblem vs Forge location card vs Forge Warden actor vs Warden Down badge;
- Crusher Down vs Warden Down.

### Navigation

- Play Contract vs Career;
- Mercenary vs Compendium;
- Loadout vs Gunsmith sub-icon;
- Training vs Play Contract.

Each group must pass:

1. black silhouette where applicable;
2. grayscale;
3. 24–32px navigation/icon scale;
4. 390×844 live composition;
5. label-hidden recognition by an independent reviewer.

If a reviewer needs the text label to separate a pair, revise the art.

---

# 9. Production closure condition

This delta is complete only when the final production matrix records:

- the 16 Forge world assets;
- Forge location card/chapter treatment;
- Warden Down replacing Well Protected in active badge production;
- Contract/Mercenary/Loadout/Career/Compendium/Training navigation art;
- active V4 stable-ID equality;
- logical-binding → physical-resource/atlas mapping;
- source/builder/export provenance;
- actual-game review screenshots for Junkyard and Forge at target viewports.

Do not start bulk generation from the older brief without applying this delta.
