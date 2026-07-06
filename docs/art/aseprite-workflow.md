# Aseprite Workflow

This document explains how Claude Code should work with Aseprite, the source
tool for Meowcenary's production sprites. It supports the
[Character Design Workflow](./character-design-workflow.md) and the
[Character Asset Standard](./character-asset-standard.md).

## Principles

- **Aseprite is the source tool** for production sprites. Final character art
  lives in `.aseprite` files and is exported to the standard `public/` paths.
- **Claude Code should not pretend to visually judge final quality** without
  exported previews. Judge art from an exported PNG/GIF or contact sheet, or
  hand the judgment to the human.
- **Claude Code may generate Lua scripts** for Aseprite to automate repetitive
  setup (frames, tags, layers, exports).
- **Claude Code may run the Aseprite CLI** when it is installed locally.
- **Claude Code may create placeholder sprites** to prove layout and the export
  pipeline, but final art still needs human review. Mark placeholders clearly so
  they are never mistaken for finished art.
- **Keep generated scripts small and inspectable.** Prefer short, readable Lua a
  human can audit over clever automation.

## Export Command

Export a source file to the standard spritesheet + metadata paths (headless with
`-b`):

```bash
aseprite -b \
  --ignore-layer notes \
  assets-src/characters/scrap-tabby/source/scrap-tabby.aseprite \
  --sheet public/assets/characters/scrap-tabby/scrap-tabby.png \
  --data public/assets/characters/scrap-tabby/scrap-tabby.json \
  --format json-array \
  --sheet-type packed \
  --list-tags
```

- `--format json-array` and `--list-tags` keep the animation tag names in the
  metadata, which the engine keys off (see the Asset Standard).
- `--ignore-layer notes` excludes the non-exported `notes` guide layer. Aseprite
  bakes every *visible* layer into the sheet, so `notes` must be excluded here
  (it must also appear **before** the source file to apply to it). Keep the layer
  hidden in the source too (see the scaffold below) as a second safeguard.
- Do not add `--trim` unless engine trim support is explicitly implemented — it
  breaks the stable-anchor expectation.

## Placeholder / Scaffold Script

A small Lua script can scaffold a standard-compliant source file (48×48, the
required tags, the standard layers) so the pipeline can be proven before final
art exists. Keep it short and inspectable, for example:

```lua
-- scaffold-character.lua — creates a 48x48 placeholder with standard tags/layers.
-- Run: aseprite -b -script docs/art/scripts/scaffold-character.lua
local spr = Sprite(48, 48)
-- required tags: idle(4), run(6), hurt(2), defeat(4) => 16 frames
for i = 2, 16 do spr:newEmptyFrame() end
spr:newTag(1, 4).name  = "idle"
spr:newTag(5, 10).name = "run"
spr:newTag(11, 12).name = "hurt"
spr:newTag(13, 16).name = "defeat"
for _, name in ipairs({ "shadow", "body", "outfit", "face", "weapon", "notes" }) do
  local layer = spr:newLayer()
  layer.name = name
  -- `notes` holds working guides only; keep it hidden so it is never exported.
  if name == "notes" then layer.isVisible = false end
end
spr:saveAs("assets-src/characters/scrap-tabby/source/scrap-tabby.aseprite")
```

## When Aseprite Is Not Available

If the Aseprite CLI is not installed in the session, do not fake an export.
Instead: write or update the `.aseprite`-producing Lua script and the exact
export command, note that a human (or a session with Aseprite installed) must
run them, and leave the standard `public/` paths ready to receive the output.
