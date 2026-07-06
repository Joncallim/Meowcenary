# Character Asset Standard

This is the exact first-pass standard for character assets. Every character
follows it so filenames, frame layouts, and animation tags never drift. It is
the source of truth referenced by the
[Character Design Workflow](./character-design-workflow.md) and the
[Aseprite Workflow](./aseprite-workflow.md).

`<character-id>` is the kebab-case id from the character sheet (e.g.
`scrap-tabby`). The same id is used in every path and filename below and as the
character's data `id` in Epic 6's `characters.json`.

## Files and Locations

| Artifact | Path |
| --- | --- |
| Source (`.aseprite`) | `assets-src/characters/<character-id>/source/<character-id>.aseprite` |
| Exported spritesheet | `public/assets/characters/<character-id>/<character-id>.png` |
| Exported metadata | `public/assets/characters/<character-id>/<character-id>.json` |
| Preview GIF / PNG contact sheet | `assets-src/characters/<character-id>/preview/` |

- `assets-src/` holds editable sources and previews; it is not shipped to the
  game directly.
- `public/assets/` holds engine-loaded exports; Vite serves `public/` at the web
  root, so the runtime path is `/assets/characters/<character-id>/...`.

## Frame and Anchor

- **Frame size:** 48×48.
- **Anchor expectation:** the feet / body center stays stable across all frames,
  so the character does not jitter or drift when animations change.

## Direction

- **Initial direction support:** right-facing only.
- Left-facing is produced by mirroring in the engine, not by drawing a second
  set of frames.

## Required Animation Tags

Use these exact tag names and frame counts:

| Tag | Frames |
| --- | --- |
| `idle` | 4 |
| `run` | 6 |
| `hurt` | 2 |
| `defeat` | 4 |

## Optional Later Tags

Add these only when gameplay needs them:

- `celebrate`
- `upgrade`
- `special`

## Layer Conventions

Order and name layers consistently:

- `body`
- `face`
- `outfit`
- `weapon`
- `shadow`
- `notes` (non-exported working notes / guides)

## Export Requirements

- Include the spritesheet PNG.
- Include the JSON metadata.
- Preserve the animation tag names exactly (the engine keys off them).
- Do **not** trim frames unless engine trim support is explicitly implemented —
  trimming breaks the stable-anchor expectation.

## Review Checklist

- Reads at phone scale.
- Silhouette is distinct from other characters and enemies.
- Weapon is readable.
- Animation does not slide unintentionally (anchor stays put).
- Palette is consistent and high-contrast.
- No copied reference-game design (see [`originality.md`](./originality.md)).
