# Character Design Workflow

This document defines how a Meowcenary character goes from an idea to a
repo-ready asset. It keeps concepts, naming, frame layouts, and file paths
consistent across sessions. It builds on the
[Visual Style Guide](./style-guide.md), the
[Character Asset Standard](./character-asset-standard.md), and the
[Pixelorama Workflow](./pixelorama-workflow.md), and it produces the data described
by Epic 6 (Characters, issue #7).

Follow the steps in order. Do not skip the brief.

## 1. Character Brief

Write a short brief before any art. Capture:

- **Role** — what this character is for (e.g. aggressive close-range, safe
  ranged, support).
- **Personality** — one or two lines of character voice.
- **Gameplay fantasy** — what the player should feel playing them.
- **Starting weapon** — references a weapon `id` from `src/data/weapons.json`.
- **Passive idea** — a plain-language passive; it becomes a `Modifier` bundle or
  a named event handler in Epic 6.
- **Silhouette notes** — the distinct shape that makes them readable in a crowd.
- **Palette notes** — the limited, high-contrast palette (see the Style Guide).

## 2. Claude/Opus Concept Pass

- Generate 3–5 distinct character concepts from the brief.
- Choose one (record why, briefly).
- Convert the chosen concept into a concise **character sheet**: id
  (kebab-case), name, role, silhouette, palette, starting weapon, passive,
  and animation intent.

The character sheet is the hand-off artifact for production. Keep it short and
concrete.

## 3. Pixelorama Production Pass

- Create the `.pxo` source file at the path defined in the
  [Character Asset Standard](./character-asset-standard.md).
- Use the standard frame size (48×48) and the required animation tags.
- Export a PNG spritesheet and JSON metadata to the standard `public/` paths.

See [`pixelorama-workflow.md`](./pixelorama-workflow.md) for tooling, builder scripts,
and CLI commands.

## 4. Codex/GPT-5.5 Integration Pass

- Add or update the character entry in the character data (Epic 6's
  `characters.json`).
- Add or extend data validation if the entry needs it.
- Wire asset loading **only when gameplay needs it** — do not preload art the
  running game does not yet use.

## 5. Review Pass

- Check readability at game scale (shrink it to phone size).
- Check originality against [`originality.md`](./originality.md).
- Check animation frame tags match the standard (idle/run/hurt/defeat).
- Check filenames and exported paths match the asset standard exactly.

## 6. Playtest Pass

- Confirm the sprite reads clearly during movement and combat.
- Confirm hurt and defeat states are obvious.
- Record art tuning follow-ups separately from gameplay defects.

## Agent Responsibilities

- **Claude/Opus** — character taste, concepts, naming, visual consistency, and
  critique. Owns the brief, the concept pass, and the character sheet.
- **Claude Code** — repo docs, Pixelorama project builders, export commands, file
  organisation, and review. Can produce placeholder sprites to prove the
  pipeline, but does not claim final visual quality without exported previews.
- **Codex/GPT-5.5** — TypeScript integration, validation, asset loading, and
  tests.
- **AI visual review / Pixelorama** — final art judgment and polish against
  exported previews at the real game viewport; a human review is optional.
