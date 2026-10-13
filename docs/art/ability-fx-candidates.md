# Ability FX: unapproved native-source candidates

This source-only #241 proof contains **eight unapproved candidates**. The first
three families passed an independent source review and coordinator inspection
before expansion; that checkpoint authorized more candidate authoring, not
production acceptance. Their three PXO files and sixteen individual PNG frames
remain byte-identical to the externally preserved first-three freeze.
No production art, recipe, catalog, ability, scene, persistence,
runtime resource, icon or Mercenary sprite is changed. Source parity and bounds
tests do not establish aesthetic or player acceptance.

## Direct native authoring

`assets-src/ability-effects/source.json` is the complete editable native-grid
construction data: explicit pixel polygons, stepped lines, rectangles, palette,
frame order, cosmetic timing and semantic references. The generic builder never
branches on an ability ID. Existing ability IDs/cues remain data references and
are checked against current definitions. It stores no gameplay radius, effect
power, cooldown, actual duration, target, hit or receipt authority.
Source slugs follow the consumer's effect-ID segment grammar, with single
hyphens separating nonempty lowercase alphanumeric segments and a 41-character
limit. Independent review caught trailing and repeated hyphens being accepted
by the authoring validator; negative regressions now reject both before export.

These pixels were authored directly at 128×128. No generated raster, severe
downsampling, tracing or bitmap reconstruction was used. Native construction
produces editable Pixelorama v7 / Pixelorama 1.2 projects using the repository's
existing ZIP/RGBA cel schema. Every project has four visible, unlocked normal
layers (`silhouette`, `material`, `light-edge`, `flecks`) plus an empty hidden
`notes` layer. Every native frame has five aligned 128×128 RGBA cels, centered
registration and explicit activation/sustained tags. Native Pixelorama desktop
opening/editing has not been manually verified in this environment.

The source construction data and PXO are reviewed together. Editing a PXO without
reconciling the construction data intentionally fails deterministic parity;
there is no claim that the builder reverse-engineers native user edits.

The package uses 48 native frames: four activation frames per ability plus four
sustained frames for Shield Flicker, Overclock, Adrenaline and Precision Mark.
Each cosmetic frame is 100 ms, and each
sequence declares frame zero as its reduced-motion still. Frame zero contains
the primary meaning immediately; there is no wind-up authoring contract. The
healing jaw/repair accents, outward pressure and scrap pieces, and separate
protective plates keep the center transparent. No damage field, enemy bite
target, lock-on mark or exact mechanical circle is rasterized into this art.

| Ability | Candidate source identity |
| --- | --- |
| Giga Chomp | Tooth racks and repair cheek plates around a clear center |
| Scrap Burst | Outward pressure cuffs and loose scrap fragments |
| Shield Flicker | Separate protective armor plates and shield crest |
| Overclock | Drive gears, feed bars and movement accents |
| Adrenaline | Feathered speed vanes and wing/heel emblem |
| Heat Vent | Interior heat tongues and embers |
| Scavenge Pulse | Inward-facing magnets and collection-direction accents |
| Precision Mark | Actor-attached penetration fins and notched plates |

Collection accents are authored symbols, not live pickup paths. Self-stat cues
contain no numerical gains, plus signs or pierce counts. Signed and scoped
modifiers, including future existing-mechanic abilities, remain renderer-owned.

One untrimmed 1024×1024 candidate atlas holds these 48 frames. Frame rectangles
are 128×128, unrotated and untrimmed, with explicit center pivots. Each physical
page has its own Phaser atlas JSON with only that page's frames and actual image
name and dimensions; `atlas.json` is the aggregate index. These fields close a
candidate-export contract gap exposed by the pure-plan integration tests.
The source validator enforces no more than
128 frames and therefore no more than two such pages for the full
package. This does not register or load a runtime resource. Candidate recipe
JSON mirrors only the frozen pure sequence shape and remains unapproved.

## Reproduce and inspect

Use repository Pillow **12.1.1**. From the worktree root:

```sh
python3 docs/art/scripts/build-ability-fx-candidates.py --check
python3 docs/art/scripts/build-ability-fx-candidates.test.py
```

The source package and builder use deterministic file contents and ZIP member
timestamps. `--check` regenerates in memory, checks exact output inventory and
bytes, and does not repair anything. `--write` requires a fresh, absent
`assets-src/ability-effects/candidates/` directory; all source/render validation
precedes publication. It never overwrites existing candidates, follows output
symlinks, accepts output-path overrides or writes under `public/`. Explicitly
preserve an earlier candidate outside this directory before a revision.

Publication is a sequence of exclusive fresh-file writes, not an atomic package
transaction. I/O failure may leave an incomplete new directory; it reports
failure and `--check` rejects missing, extra or changed outputs. No cleanup
deletes another writer's files. Bounded source reads reject final-component
symlinks/devices and oversized files. No network or paid generation is involved.

The focused tests independently unpack native PXO cels, check Pixelorama schema,
visible/hidden layers, frame durations/tags, exact RGBA composition against PNGs,
atlas crops, alpha/interior/frame bounds, static-frame selection and deterministic
output. A 96-frame fixture exercises both physical pages and checks page-specific
frame partitions, pivots, image metadata and crops. Its duplicated shapes are
test stress data, not additional candidate art. A synthetic existing-mechanic ID
also verifies that source admission does not depend on an ability-ID switch.
Malformed source, out-of-scope output and drift tests retain fail-closed
behavior. The initial missing-builder RED and final focused evidence live outside
the worktree in the issue evidence directory.

## Preview interpretation

In `assets-src/ability-effects/candidates/`:

- `all-eight-biomes.png`: frame-zero source compositor over existing Junkyard
  and Forge floor imagery, with unchanged current Mercenary sprites.
- `all-eight-reduced-static.png`: explicitly selected reduced-motion source
  stills over both biomes, including sustained stills where present.
- `all-eight-biomes.gif`: an eight-frame, 100 ms/frame looping source audition.
  Instant activation sequences repeat for inspection; persistent sources visit
  activation then sustained frames. This loop is not gameplay timing.
- `native-contact.png`: all editable frames at exact integer 2× nearest scale.
- `*.pxo`: editable native projects; `frames/`: exact composed PNG exports.
- `atlas-0.png`, `atlas-0.json`, `atlas.json`, `recipes.json`: unapproved
  integration candidates.
- `provenance.json`: source/builder hashes and every generated output hash.

The compositor reads current mechanical radius or self-style radius, current
actor display width and `GAMEPLAY_ZOOM` from existing source to demonstrate
nominal image footprint. The 1760×1950 biome boards have 440-pixel-wide panels;
Scavenge Pulse retains its current 400-pixel footprint without shrinking to fit.
It does not duplicate those values into art definitions.
The exact mechanical boundary is intentionally absent from the art and preview;
the owning renderer must retain its independent precision overlay.

This is **not a captured game frame**, accepted one-second recognition result,
crowded-combat proof, sustained-end test, reduced-motion runtime test, device
evidence or owner approval. Tiled floor comparison omits real arena clutter,
camera/UI context, semantic markers and actual outcome receipts. Giga Chomp still
requires actual signed healing (+0 included) from its mechanical owner. Area
effects remain instant; protection visibility must end with authoritative state.
Integration, all-eight acceptance, physical-device review, merge and deployment
remain outside this source-candidate freeze.
