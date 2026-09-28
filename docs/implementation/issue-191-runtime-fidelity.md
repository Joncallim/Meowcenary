# Issue 191 — Runtime fidelity evidence

This record is the review evidence for the implementation candidate. It does
not close issue #191: the final side-by-side judgement remains Jonathan's
visual approval.

## Authority and method

- Visual authority: `docs/art/alpha-3-art-production-briefs.md` and the selected
  concept/provenance boards named below.
- Canonical phone review size: 390×844. Foldable/tablet and desktop comparison
  sizes are 1114×720 and 1280×720.
- Actor comparisons use the actual display sizes produced by the game, nearest
  sampling, and the existing #190 responsive camera/layout model.
- A valid result needs all three links in the chain: selected reference,
  editable source, and the runtime capture. Loading or manifest parity alone
  is not visual acceptance.

## Actor classification

| Actor | Before | Native source after remediation | Review authority |
|---|---|---|---|
| Scrap Tabby | 22px-tall / 5-pose geometric approximation | restored native 48×48 pixel master, 16-frame PXO | Epic 13 final actor direction |
| Bolt Hound | 22px-tall / 5-pose geometric approximation | restored native 48×48 pixel master, 16-frame PXO | Epic 13 final actor direction |
| Volt Lynx | 23px-tall / 5-pose geometric approximation | restored native 48×48 pixel master, 16-frame PXO | selected Volt Lynx direction A |
| Brass Boar | 20px-tall / 5-pose geometric approximation | restored native 48×48 pixel master, 16-frame PXO | selected Alpha 3 roster direction B |
| Ember Cougar | 18px-tall / 6-pose geometric approximation | restored native 48×48 pixel master, 16-frame PXO | selected Alpha 3 roster direction B |
| Scrap Weasel | 20px-tall / 6-pose geometric approximation | restored native 48×48 pixel master, 16-frame PXO | selected Alpha 3 roster direction B |
| Rattle Raptor | 20px-tall / 6-pose geometric approximation | restored native 48×48 pixel master, 16-frame PXO | selected Alpha 3 roster direction B |
| Piston Ram | 23px-tall / 5-pose geometric approximation | restored native 48×48 pixel master, 16-frame PXO | selected Alpha 3 roster direction B |
| Dust Mite | geometric approximation | 48×48, 16-frame PXO | Epic 13 / enemy production direction B |
| Junk Rusher | geometric approximation | 48×48, 16-frame PXO | Epic 13 actor direction |
| Trash Brute | geometric approximation | 48×48, 16-frame PXO | Epic 13 actor direction |
| Scrap Sniper | geometric approximation | 48×48, 16-frame PXO | enemy production direction B |
| Scrap Skitter | 313×313 generated import | 48×48, 16-frame PXO | §11 authored silhouette |
| Bastion Beetle | 313×313 generated import | 48×48, 16-frame PXO | §11 authored silhouette |
| Junk Nester | 313×313 generated import | 48×48, 16-frame PXO | §11 authored silhouette |
| Shard Bot | 313×313 generated import | 48×48, 16-frame PXO | §11 authored silhouette |
| Scrap Crusher | geometric approximation at ordinary-enemy display scale | 64×64, 16-frame PXO; 38×38 boss display | enemy production direction B |
| Forge Warden | 309×309 generated import | 64×64, 16-frame PXO | §11 authored silhouette |

The “before” classification is intentionally evidence-based rather than
inferred from filenames: the former character and native enemy builders drew
ellipses/rectangles/lines, while the five expanded sheets contained one
`imagegen-import` layer and were reduced to 24–38 logical pixels at runtime.
Every remediated actor now exports from an editable Pixelorama source. For the
Mercenaries, the richer checked-in native-grid production pixels predating the
regressed tiny reconstructions were used as editable underdrawings, then each
sheet received native-pixel identity polish against its selected brief (Tabby
scarf/guard, Hound harness/bracer, Lynx harness/cell, Boar tusks/plate, Cougar
vents, Weasel coil/tool, Raptor optic/harness, Ram gauge/horns). The resulting
pixels differ from the issue baseline for all eight actors. Their first frames
are 30–46px tall and their 16-frame sheets retain at least 10 distinct alpha
poses. A conformance regression locks both facts.
The builders restore the exact checked-in native raster for audit/source
parity; they do not procedurally reconstruct actor silhouettes from geometric
shapes.

## Side-by-side review set

Selected references:

- `docs/art/concepts/epic-13/final-actor-direction.png`
- `assets-src/characters/alpha-3-roster-concepts/direction-b-selected.png`
- `assets-src/characters/volt-lynx/concepts/volt-lynx-direction-a-selected.png`
- `assets-src/enemies/alpha-3-production-concepts/direction-b-selected.png`

Runtime captures and committed screenshot baselines:

- `browser-tests/visual-fidelity.pw.ts-snapshots/home-*.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/mercenary-*.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/mercenary-lower-*.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/contract-selection-*.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/loadout-equipment-*.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/achievements-*.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/settings-*.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/gameplay-*.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/mercenary-gameplay-*-desktop-1280x720-linux.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/ordinary-gameplay-actor-*.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/boss-gameplay-desktop-1280x720-linux.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/boss-gameplay-actor-desktop-1280x720-linux.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/compendium-desktop-1280x720-linux.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/compendium-middle-desktop-1280x720-linux.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/compendium-lower-desktop-1280x720-linux.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/pause-modal-desktop-1280x720-linux.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/weapon-rack-desktop-1280x720-linux.png`

The browser baselines intentionally cover a phone, a foldable-sized viewport,
and desktop. The gameplay pair catches actor/world scale, nearest sampling,
HUD/action treatment, and the responsive viewport together; the menu set
catches brand hierarchy, reusable chrome, focus, navigation, scrolling, and
content art integration.

### Side-by-side approval evidence

These pairs put the selected authority next to the shipped browser output. The
runtime columns are intentionally shown at their captured viewport size rather
than enlarged actor-source scale.

| Approved reference | Runtime output |
|---|---|
| [Alpha 3 roster direction B](../../assets-src/characters/alpha-3-roster-concepts/direction-b-selected.png) | [Mercenary identity integration, phone](../../browser-tests/visual-fidelity.pw.ts-snapshots/mercenary-phone-390x844-linux.png), [roster 5–8](../../browser-tests/visual-fidelity.pw.ts-snapshots/mercenary-lower-phone-390x844-linux.png), plus exact live-gameplay crops `mercenary-gameplay-*-desktop-1280x720-linux.png` for all eight actors |
| [Enemy production direction B](../../assets-src/enemies/alpha-3-production-concepts/direction-b-selected.png) | [Compendium roster 1–4](../../browser-tests/visual-fidelity.pw.ts-snapshots/compendium-desktop-1280x720-linux.png), [roster 4–7](../../browser-tests/visual-fidelity.pw.ts-snapshots/compendium-middle-desktop-1280x720-linux.png), [roster 7–10](../../browser-tests/visual-fidelity.pw.ts-snapshots/compendium-lower-desktop-1280x720-linux.png), and [Crusher gameplay](../../browser-tests/visual-fidelity.pw.ts-snapshots/boss-gameplay-desktop-1280x720-linux.png) |
| Art brief §§16–19: bespoke lockup, crop-safe workshop backdrop, semantic navigation/state/HUD glyphs, shared modal/card chrome | [Home, phone](../../browser-tests/visual-fidelity.pw.ts-snapshots/home-phone-390x844-linux.png), [Home, desktop](../../browser-tests/visual-fidelity.pw.ts-snapshots/home-desktop-1280x720-linux.png), [Settings, phone](../../browser-tests/visual-fidelity.pw.ts-snapshots/settings-phone-390x844-linux.png), [Equipment, phone](../../browser-tests/visual-fidelity.pw.ts-snapshots/loadout-equipment-phone-390x844-linux.png), [Achievements, phone](../../browser-tests/visual-fidelity.pw.ts-snapshots/achievements-phone-390x844-linux.png), [Pause modal](../../browser-tests/visual-fidelity.pw.ts-snapshots/pause-modal-desktop-1280x720-linux.png), and [Weapon Rack](../../browser-tests/visual-fidelity.pw.ts-snapshots/weapon-rack-desktop-1280x720-linux.png) |

The visual-test controller is compiled only into the dedicated screenshot
build and uses a fixed boot/run seed. The ordinary production build contains
no mutable browser seam. Full-scene gameplay comparisons carry a bounded
tolerance for incidental player/held-weapon contact timing. Separate strict
96×96 actor-centred captures pose the real production actor view at a stable
world point, so an actor disappearance, scale change, or sprite drift cannot
hide inside that composition allowance. Compendium captures and PXO/runtime
parity independently lock the complete roster.

## Production fallback contract

Required release actors are fail-closed. Missing bindings, texture resources,
idle/run clips, or registered animations surface a diagnostic construction
error. Primitive actor geometry is available only through the explicit
development/test opt-in used by art-less harnesses; it is not an automatic
production recovery path. Data-authored elite enemies retain their own combat
identity while validation, resource closure, and runtime presentation all
resolve the authoritative base-enemy actor binding.

## Deliberate non-goals

- No campaign, combat, progression, save, or responsive geometry changed.
- No new actor or speculative future UI family was added.
- Selected and rejected provenance remains intact.
- Product-owner visual approval is intentionally outstanding; this candidate
  must not close #191 without that recorded approval.
