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
| Scrap Tabby | geometric approximation | 48×48, 16-frame PXO | Epic 13 final actor direction |
| Bolt Hound | geometric approximation | 48×48, 16-frame PXO | Epic 13 final actor direction |
| Volt Lynx | geometric approximation | 48×48, 16-frame PXO | selected Volt Lynx direction A |
| Brass Boar | geometric approximation | 48×48, 16-frame PXO | selected Alpha 3 roster direction B |
| Ember Cougar | geometric approximation | 48×48, 16-frame PXO | selected Alpha 3 roster direction B |
| Scrap Weasel | geometric approximation | 48×48, 16-frame PXO | selected Alpha 3 roster direction B |
| Rattle Raptor | geometric approximation | 48×48, 16-frame PXO | selected Alpha 3 roster direction B |
| Piston Ram | geometric approximation | 48×48, 16-frame PXO | selected Alpha 3 roster direction B |
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
Every remediated actor now exports from an editable Pixelorama source. The
builders restore the exact checked-in native raster for audit/source parity;
they do not procedurally reconstruct actor silhouettes from geometric shapes.

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
- `browser-tests/visual-fidelity.pw.ts-snapshots/gameplay-*.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/boss-gameplay-desktop-1280x720-linux.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/compendium-desktop-1280x720-linux.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/compendium-middle-desktop-1280x720-linux.png`
- `browser-tests/visual-fidelity.pw.ts-snapshots/compendium-lower-desktop-1280x720-linux.png`

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
| [Alpha 3 roster direction B](../../assets-src/characters/alpha-3-roster-concepts/direction-b-selected.png) | [Mercenary identity integration, phone](../../browser-tests/visual-fidelity.pw.ts-snapshots/mercenary-phone-390x844-linux.png), [roster 5–8](../../browser-tests/visual-fidelity.pw.ts-snapshots/mercenary-lower-phone-390x844-linux.png), and [Scrap Tabby in live gameplay](../../browser-tests/visual-fidelity.pw.ts-snapshots/gameplay-desktop-1280x720-linux.png) |
| [Enemy production direction B](../../assets-src/enemies/alpha-3-production-concepts/direction-b-selected.png) | [Compendium roster 1–4](../../browser-tests/visual-fidelity.pw.ts-snapshots/compendium-desktop-1280x720-linux.png), [roster 4–7](../../browser-tests/visual-fidelity.pw.ts-snapshots/compendium-middle-desktop-1280x720-linux.png), [roster 7–10](../../browser-tests/visual-fidelity.pw.ts-snapshots/compendium-lower-desktop-1280x720-linux.png), and [Crusher gameplay](../../browser-tests/visual-fidelity.pw.ts-snapshots/boss-gameplay-desktop-1280x720-linux.png) |
| [Visual identity production board](../art/concepts/epic-16/visual-identity-production-board.png) | [Home, phone](../../browser-tests/visual-fidelity.pw.ts-snapshots/home-phone-390x844-linux.png), [Equipment, phone](../../browser-tests/visual-fidelity.pw.ts-snapshots/loadout-equipment-phone-390x844-linux.png), and [Achievements, phone](../../browser-tests/visual-fidelity.pw.ts-snapshots/achievements-phone-390x844-linux.png) |

The visual-test controller is compiled only into the dedicated screenshot
build and uses a fixed boot/run seed. The ordinary production build contains
no mutable browser seam. Boss gameplay allows only 32 changed pixels for a
possible clock-glyph boundary, which is smaller than the boss silhouette.
Ordinary gameplay permits one bounded 384-pixel player-facing/held-weapon
delta after contact; exact actor pixels are independently locked by the
Compendium captures and PXO/runtime parity tests.

## Production fallback contract

Required release actors are fail-closed. Missing bindings, texture resources,
idle/run clips, or registered animations surface a diagnostic construction
error. Primitive actor geometry is available only through the explicit
development/test opt-in used by art-less harnesses; it is not an automatic
production recovery path.

## Deliberate non-goals

- No campaign, combat, progression, save, or responsive geometry changed.
- No new actor or speculative future UI family was added.
- Selected and rejected provenance remains intact.
- Product-owner visual approval is intentionally outstanding; this candidate
  must not close #191 without that recorded approval.
