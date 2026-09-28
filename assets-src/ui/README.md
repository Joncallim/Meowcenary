# Reusable UI visual system

This family is the approved Alpha 3 workshop UI vocabulary from
`docs/art/alpha-3-art-production-briefs.md` §§16–19. It is intentionally
small, flat, and pixel-readable at the canonical 390×844 viewport.

`source/ui-atlas.json` is the editable deterministic source. The builder in
`docs/art/scripts/build-ui-atlas.mjs` emits the runtime PNG/JSON atlas. The
palette is restricted to near-black `#0a0f14`, workshop slate, cream, cyan,
gold, and danger red; no concept-board pixels are used.

Frame IDs are semantic and renderer-agnostic (`nav-icon:*`, `ui-chrome:*`,
`stat-icon:*`, `action-icon:*`, `hud-icon:*`, `settings-icon:*`,
`chapter-icon:*`, `objective-icon:*`, `arena-card:*`).

## Large navigation illustrations

The compact procedural atlas still owns chrome, state, action, stat, settings,
chapter and objective glyphs. Large player-facing menu destinations use the
selected production boards in `concepts/navigation-primary-selected.png` and
`concepts/navigation-secondary-selected.png` instead. Their SHA-256 hashes are
`717e2f3d11c716ba1fab482668abf3b263fcf0afa698d01a0d8a5d56e3cd6691` and
`b9f3d0a21165372c424458ea308cb16c7dd438b81997e1d643a5ca4db756703f`.

The generated-source prompts requested a transparent, text-free, chunky
junkyard-workshop family with cream, cyan, brass and slate materials. The
primary 3x2 board covers Play Contract, Mercenary, Loadout, Career, Training
and Settings. The secondary 2x2 board covers Equipment, Gunsmith,
Achievements and Compendium. `build-navigation-concept-atlas.py`
deterministically crops the approved tiles into the editable PXO and runtime
atlas; no generated experiment is loaded directly by the game.
