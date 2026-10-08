# Mercenary animation review gallery

Open [`index.html`](./index.html) through a local HTTP server. Browsers block
the gallery's `fetch()` calls when the page is opened as `file://`.

From the repository root:

```bash
python3 -m http.server 8000
```

Then visit `http://127.0.0.1:8000/docs/art/evidence/mercenary-sprites-2026-10-08/roster/`.

The page loads `manifest.json` and `source-inventory.json` beside itself. Image
paths in the manifest are relative to this directory in the committed packet:

```text
<actor>/<profile>/<mode>/<frame-image>.png
```

The selectors cover all eight Mercenaries and the requested viewport profiles.
Missing actor/profile captures remain selectable and are identified as
pending. For each registered clip, the gallery shows every captured frame as a
96×96 CSS-pixel crop and at 3× enlargement with nearest-neighbour rendering.
When the manifest provides real RAF video paths, the page links to those
videos as separate evidence.

The evidence uses the real production actor `SpriteView`, Phaser animation
state and renderer. It freezes the authored arena and game loop, driving only
the actor sprite update and renderer. A passed capture status records that the
configured animation frames and events were captured; it is not a visual
approval. The evidence does not establish live-combat behavior, physical
device rendering, accessibility, performance, or deployment readiness.

Source and review boundaries:

- The integration capture uses implementation commit
  `00bf2de9bbc6e2c61d4a5a4a55a3c55cceb0fde2`.
- The Brass Boar V3 candidate source is pinned to review head
  `f4fbfa2f3e8ee7e2cdb4d49704c7701b0cb34e2d`. Its direction is approved; its
  native art and animation are still awaiting review. The V3 candidate is not
  the active runtime sheet.
- The main baseline is `2865e28f46b046b743283b8c1bcf7fc7ef2936a3`; it retains
  the prior Volt Lynx defeat pose, and the #227 CI run is red. This gallery
  does not change runtime assets or screenshot goldens.
- The other seven Mercenaries are existing runtime art. Their presence here
  organizes animation evidence; it does not create new owner acceptance.
- Canonical design links and Figma nodes are listed in the gallery. They mark
  direction references, not final actor acceptance. Tabby and Hound use the
  recorded Epic 13 final actor direction image; no separate Figma node is
  claimed for them.

[`source-inventory.json`](./source-inventory.json) is maintained separately
and records each actor's builder, editable PXO, runtime export, canonical
reference, and hashes. The evidence manifest is the capture record; do not
replace its provenance or treat the gallery as a promoted screenshot golden.

The completed run contains 96 passing playback contexts, 384 clip checks,
768 frame crops and 16 real playback recordings. See [validation.md](validation.md)
for full results, method limitations and unresolved visual-animation concerns.
The looping [roster preview](roster-animation.gif) uses actual phone crops;
its reset after defeat is for review only.
