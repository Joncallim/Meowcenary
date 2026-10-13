-- Lossless authored Mercenary raster loader. The checked-in raster is the
-- production candidate; visual authority remains the canonical reference and
-- recorded owner approval. This builder only restores those pixels into an
-- editable Pixelorama project and never reconstructs a silhouette.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")
local M = {}
local function restoreRow(image, row, encoded, palette)
  for startX, endX, index in encoded:gmatch("(%d+):(%d+):(%d+)") do
    local color = palette[tonumber(index)]
    assert(color, "native raster references an undefined palette entry")
    for x = tonumber(startX), tonumber(endX) do U.put(image, x, row, color) end
  end
end
function M.build(spec)
  local source = dofile(spec.raster)
  assert(#source.frames == 16, spec.id .. " native raster must contain 16 frames")
  local palette = {}
  for index, color in ipairs(source.palette) do palette[index] = U.hex(color) end
  local sprite, layers = U.makeSprite("character", 48, 48)
  layers.weapon.isVisible = false; layers.shadow.isVisible = false
  for frame = 1, 16 do
    local body = U.clearCel(sprite, "body", frame).image
    for row, encoded in pairs(source.frames[frame]) do restoreRow(body, row, encoded, palette) end
    U.clearCel(sprite, "face", frame); U.clearCel(sprite, "outfit", frame)
    local notes = U.clearCel(sprite, "notes", frame).image
    local marker = U.hex("#ff00ff")
    U.put(notes, 23, 24, marker); U.put(notes, 24, 24, marker); U.put(notes, 25, 24, marker)
  end
  sprite:saveAs(spec.output)
end
return M
