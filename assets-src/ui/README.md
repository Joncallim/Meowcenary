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
`concepts/navigation-secondary-selected.png` instead. The distinct Change
Contract operation uses `concepts/navigation-change-contract-selected.png`.
Their SHA-256 hashes are
`717e2f3d11c716ba1fab482668abf3b263fcf0afa698d01a0d8a5d56e3cd6691` and
`b9f3d0a21165372c424458ea308cb16c7dd438b81997e1d643a5ca4db756703f`;
the Change Contract source hash is
`3aa29128e8197cd4655266bb1f08eac8633403c73beddda94c9e77311951b6fb`.

The generated-source prompts requested a transparent, text-free, chunky
junkyard-workshop family with cream, cyan, brass and slate materials. The
primary 3x2 board covers Play Contract, Mercenary, Loadout, Career, Training
and Settings. The secondary 2x2 board covers Equipment, Gunsmith,
Achievements and Compendium. The single Change Contract image shows two route
plates exchanging places, rather than reusing Play Contract's forward arrow.
`build-navigation-concept-atlas.py`
deterministically crops the approved tiles into the editable PXO and runtime
atlas; no generated experiment is loaded directly by the game.

## Chapter menu backdrops

The selected generated masters are
`concepts/menu-backdrop-junkyard-selected.png` (SHA-256
`608bf29683d87cd11883aea08060c87bbac261bb79f312338af4b21096dbd1d0`)
and `concepts/menu-backdrop-forge-selected.png` (SHA-256
`625c7535279006a4c4c15a8bf9ca2ec2cd18b7865ddac62a5b20748ab10ac79e`).
Both were generated with the primary navigation board as the Meowcenary
rendering reference and the approved Forge board as the material reference.
The Junkyard prompt requested a layered reclaimed workshop shelter opening
onto an organised salvage yard with a quiet crop-safe centre, cool dusk light,
warm practical glints, and no characters, UI, text or implied hazards. The
Forge prompt requested an ordered working foundry with a furnace throat,
cooling manifold, coils, grates and contained heat, explicitly avoiding a
generic lava level and retaining the same quiet crop-safe centre.

`build-menu-backdrops.py` preserves both masters in the editable
`backdrops/source/menu-*.pxo` projects and emits compact linear-filtered PNG
runtime images. Arena data owns the backdrop identity, so adding a future
location does not require a content-ID branch in MenuScene.
