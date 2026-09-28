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
