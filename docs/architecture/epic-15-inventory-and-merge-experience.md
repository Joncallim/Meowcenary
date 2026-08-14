# Epic 15 — Inventory and Merge Experience

**Issue:** #74 · **Branch:** `codex/epic-15-inventory-merge` · **Base:** `main` after Epic 14 / PR #80

> Status: **implemented in a ready pull request; not merged**. This document is
> the architecture contract and delivery record for the branch.

## 1. Outcome

Epic 15 replaces the functional text-row inventory with a visual, tap-first
weapon rack. On the canonical 390×844 portrait canvas a player can:

1. open the rack directly from the HUD or with `I`;
2. see six fixed slots in a two-column, three-row layout;
3. select one weapon and identify compatible partners without knowing the
   merge rules;
4. preview the exact next-tier result and definition-derived stat changes;
5. commit one merge through the existing atomic controller command; and
6. see the upgraded weapon and freed capacity immediately.

Phaser FIT keeps the logical canvas at 390×844 in portrait and landscape
browser windows. The rack uses the fitted canvas scale for physical-size
compensation and the live browser/container orientation for layout: portrait is
2×3, while a wide FIT display uses a compact 3×2 rack and one action row.

## 2. Baseline and constraints

The architecture was checked against merged Epic 14 code.

- `RunState.equipped` remains the only active-rack state.
- `WEAPON_RACK_CAPACITY` remains the six-slot invariant.
- `canMerge`, `mergeResult`, and `replaceMergedWeapons` remain
  authoritative for eligibility and mutation.
- One run-scoped `DataWeaponRegistry` remains shared by run setup, combat,
  acquisition, preview, and merge.
- The existing manual-pause owner remains the only surface allowed to commit a
  merge.
- Epic 14 leaves a blocked seventh weapon physically in the world. There is no
  pending-reward state or replacement command for Epic 15 to invent.
- Phaser continues to own drawing and browser input; the controller owns
  immutable read models and commands.

No save migration, RNG, loot, weapon balance, combat, or acquisition change is
required.

## 3. Frozen decisions

### D1 — One immutable rack snapshot

`InventoryController.snapshot()` returns:

- six ordered slots, including explicit empty slots;
- card-safe weapon identity, rarity, tier, icon ID, and compact stats;
- selection and compatibility state;
- whether any authoritative merge pair exists; and
- an optional exact merge preview.

Views never receive mutable `WeaponDefinition` or `WeaponInstance`
references.

### D2 — Eligibility is queried, never copied

`hasMergeablePair()` is a read-only helper built entirely on `canMerge()`.
The controller uses `canMerge()` for partner highlighting and uses
`weaponByFamilyTier()` for a preview that does not allocate an instance ID.
Only `mergeSelected()` calls `mergeResult()`.

### D3 — Selection cannot imply an invalid commit

The first tap selects one card. A compatible second tap creates a preview. An
incompatible second tap becomes the new first selection instead of leaving a
misleading invalid pair selected. Stale or duplicate instance IDs are
reconciled on every snapshot.

Selection clears after merge, back, resume, direct-open, and destroy.

### D4 — Preview data comes from definitions

Cards and previews derive damage, attacks per second, projectile count, and
pierce from the current `WeaponDefinition`. The preview compares one input
definition to the exact next-tier definition. It does not duplicate weapon
constants in UI code and does not apply or mutate run modifiers.

Every changed stat is rendered in both portrait and compact layouts. Attack
rate uses two-decimal display precision so small but real definition changes
cannot collapse into the same before/after label.

### D5 — Tap-first, keyboard-capable, no drag

- Cards use the existing 44-physical-pixel minimum target rule.
- Pointer/touch uses one `pointerup` command path.
- Number keys 1–6 select rack slots; Enter commits a valid preview.
- `I` opens the rack directly from active play and returns to pause from the
  rack.
- `Esc` keeps the established rack → pause → run back path.

No drag-and-drop, auto-merge, sorting, or mass management is added.

### D6 — HUD entry is a real rack control

The HUD shows `Rack n/6` plus one text state:

- `MERGE READY`;
- `RACK FULL`; or
- `TAP TO INSPECT`.

The control opens the rack directly through `PauseController`; the HUD never
changes run or inventory state itself. Text backs every color change so the
affordance is not color-only.

The HUD listens to the Phaser resize lifecycle and rebuilds from the current
FIT display metrics. This keeps the direct rack affordance at the shared
44-physical-pixel minimum after phone rotation or browser resize.

### D7 — Full-rack behavior stays physical

When the rack is full, the panel says either “merge to free a slot” or that a
reward waits in the world. Epic 14's blocked drop remains the pending object.
Epic 15 does not add replacement, discard, conversion, or a second pending
reward model.

### D8 — UI iconography is code-rendered and asset-ready

Cards expose stable family icon IDs such as `weapon:pistol` and render a
small, consistent geometric glyph in Phaser. This gives the rack an icon now
without claiming final weapon production.

No generated raster weapon art is planted in this PR:

- final weapon/icon/world sprites belong to Epic 16;
- weapon-specific merge effects and tier identity belong to Epic 17; and
- adding either here would create assets before their catalogue, loading,
  originality, and animation contracts are frozen.

Epic 16 may replace these glyphs behind the same read-model icon IDs without
changing merge state or commands.

## 4. Layout and visual states

The surface reuses the established dark industrial palette, square/modest
geometry, cream text, teal actions, and gold merge emphasis.

### Portrait, 390×844

- header and rack count;
- short context instruction;
- two columns × three rows;
- preview/confirmation panel;
- one primary merge action; and
- one subordinate Back action.

### Landscape and desktop

- the logical 390×844 canvas remains authoritative;
- FIT scales and pillarboxes the canvas without clipping or horizontal scroll;
- live container orientation selects a compact three-column, two-row rack and
  side-by-side actions on wide displays;
- `physicalToLogical()` preserves readable text and 44-pixel touch targets;
- the pause surface rebuilds from current FIT and container dimensions on
  Phaser resize events, including phone rotation;
- the reading and command order is identical to portrait.

Each occupied card always communicates state in text:

- `MERGE` before selection;
- `PICK 1` / `PICK 2` for selected cards;
- `MATCH` for compatible partners; or
- `NO MATCH` for incompatible cards.

The merge confirmation names the result and says `1 SLOT FREED`; no
decorative animation is required for correctness.

## 5. File ownership

| File | Responsibility |
| --- | --- |
| `src/gameplay/merge.ts` | authoritative read-only pair query |
| `src/ui/inventory.ts` | immutable rack/read-model/preview and merge command |
| `src/ui/pause.ts` | manual-pause modal lifecycle and routing |
| `src/ui/weaponRackView.ts` | responsive rack rendering and input mapping |
| `src/ui/weaponRackLayout.ts` | pure FIT/container-aware rack geometry |
| `src/ui/hud.ts` | merge-ready read model and direct rack affordance |
| `src/ui/modal.ts` | disabled action presentation |
| `src/scenes/GameScene.ts` | thin command wiring for HUD and `I` |

Production files intentionally outside the change:

- loot, drops, rewards, and rack admission;
- weapon firing and balance data;
- save schema;
- actor-art catalog and raster assets;
- audio map and combat-feedback systems.

## 6. Architecture pass

The repository-wide boundary pass found no blocking architectural defect.

- `engine/` and `gameplay/` remain Phaser-free.
- `GameScene` remains a coordinator; the only addition is a small input
  delegation method.
- no second rack, registry, pause owner, merge rule, or event bus was created;
- preview is allocation-free and cannot burn `weapon-N` IDs;
- merge still assigns the rack once and emits `weapon:merged` once;
- full-rack no-loss behavior remains owned by Epic 14; and
- the patch adds no dependency, persistence, RNG, or network surface.

The main residual product proof is visual/manual rather than architectural:
first-time-player discoverability must still be judged in a real 390×844 run.

## 7. Automated acceptance

- snapshots expose exactly six slots and immutable nested read models;
- merge-ready is true iff `canMerge` finds a pair;
- first selection marks compatible and incompatible cards explicitly;
- incompatible taps never create an enabled commit pair;
- a valid pair previews the exact next-tier definition without allocating;
- preview deltas match weapon definitions;
- stale rack changes clear invalid selection and preview;
- one commit performs one replacement and emits one merge event;
- HUD merge-ready changes only with authoritative rack state;
- manual-pause and level-up ownership remain intact; and
- full suite, shuffled suite, lint, build, and diff checks pass.

## 8. Manual acceptance

Verify on 390×844 portrait and a desktop/landscape FIT viewport:

1. collect the guaranteed duplicate starter weapon;
2. observe `MERGE READY` on the HUD;
3. tap the HUD rack control and confirm the run pauses into the rack;
4. identify all six slots and the matching pair without instructions;
5. select a card and confirm only the valid partner says `MATCH`;
6. inspect the exact T2 result and definition-derived deltas;
7. merge and confirm the rack drops from 2/6 to 1/6 with `1 SLOT FREED`;
8. repeat with number keys and Enter;
9. verify `Esc` returns to pause without stealing a level-up pause; and
10. fill the rack and confirm no UI suggests a blocked world reward was lost.

## 9. Delivery record

- [x] live Issue #74 and merged Epic 14 baseline reviewed;
- [x] repository architecture boundaries reviewed;
- [x] immutable rack/preview contract implemented;
- [x] responsive rack, direct HUD entry, and keyboard path implemented;
- [x] code-rendered temporary iconography implemented;
- [x] final Epic 16/17 art scope preserved;
- [x] automated gates recorded: lint, production build, 86 files / 1,306 tests,
  and three shuffled full-suite seeds all pass;
- [x] browser viewport evidence recorded at 390x844 and FIT-scaled 844x390 with
  live open-panel rotation rebuilding between 2x3 and compact 3x2 layouts;
- [ ] reviewer approval and merge — deliberately outside this task.
