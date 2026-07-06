# Visual Style Guide

This guide defines Meowcenary's visual style in plain language so every agent
and artist makes the same choices. Read it before designing a character, enemy,
weapon, or UI element. It pairs with [`originality.md`](./originality.md),
which is the final word on what we must not copy.

## Overall Style

- Cute, readable, chunky 2D art with a pixel-inspired feel, built for the
  browser.
- Friendly and characterful, not gritty or realistic.
- Bold shapes over fine detail. If a detail does not survive at small scale, cut
  it.

## Camera and Readability

- Top-down or three-quarter "survivor" view.
- The game must read clearly on a phone-sized screen first (target canvas is
  390×844; see `src/engine/config.ts`).
- Player, enemies, projectiles, and pickups must be instantly distinguishable
  during busy combat. Readability beats decoration every time.

## Core Motifs

- Junkyard, workshop, and improvised gear.
- Scrappy animal mercenaries built from scavenged parts.
- Bright, high-contrast combat readability so danger is always obvious.

These motifs are Meowcenary's own vocabulary. Describe art in these terms rather
than referencing another game.

## Originality Guardrails

Do not copy the character designs, enemy silhouettes, UI, icons, animations,
weapon art, or names of Gun Hero, Archero, Vampire Survivors, or any other
reference game. References inform the product loop only, never the expression.
See [`originality.md`](./originality.md) for the full rule.

## Palette Rule

- Use a limited, high-contrast palette per character/enemy.
- Give every sprite a clear outline (dark or high-contrast) so it separates from
  the background and from other actors.
- Avoid muddy, low-contrast sprites. If two actors could blur together in a
  crowd, raise the contrast.

## Animation Rule

- Animation supports gameplay readability first, personality second.
- Movement, hurt, and defeat states must be legible at a glance. A player should
  read "that enemy is charging" or "I got hit" without studying the screen.
- Prefer a few strong, clear frames over many subtle ones.

## Scale Rule

- Sprites must still read at small phone scale, not just zoomed in.
- Test the silhouette shrunk down: if the shape becomes ambiguous, simplify it.
- Keep the most important reading cue (the silhouette and the weapon) the
  highest-contrast part of the sprite.

## Naming Rule

- Asset IDs use kebab-case, e.g. `scrap-tabby`, `bolt-hound`, `tin-raccoon`.
- The same ID is used for the character's data `id`, its source folder, and its
  exported asset filenames. One ID, one spelling, everywhere.
- No spaces, capitals, or version suffixes in asset IDs.
