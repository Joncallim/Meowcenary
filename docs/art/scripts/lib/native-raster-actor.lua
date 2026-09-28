-- Lossless native-grid actor source loader.
--
-- The companion *-native-raster.lua files are auditable run-length encodings
-- of deliberately authored pixels. This helper does not construct silhouettes
-- from circles, rectangles, or other drawing primitives: it restores the exact
-- reviewed raster into an editable Pixelorama project.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")
local M = {}

local function restoreRow(image, row, encoded, palette)
  for startX, endX, colorIndex in encoded:gmatch("(%d+):(%d+):(%d+)") do
    local color = palette[tonumber(colorIndex)]
    assert(color, "native raster references an undefined palette entry")
    for x = tonumber(startX), tonumber(endX) do
      U.put(image, x, row, color)
    end
  end
end

function M.build(spec)
  local source = dofile(spec.raster)
  assert(#source.frames == 16, spec.id .. " native raster must contain 16 frames")
  local palette = {}
  for index, color in ipairs(source.palette) do palette[index] = U.hex(color) end

  local sprite = U.makeSprite("enemy", 48, 48)
  for frame = 1, 16 do
    local body = U.clearCel(sprite, "body", frame).image
    U.clearCel(sprite, "face", frame)
    for row, encoded in pairs(source.frames[frame]) do
      restoreRow(body, row, encoded, palette)
    end

    -- Hidden anchor/readability notes remain editable but never ship.
    local notes = U.clearCel(sprite, "notes", frame).image
    local marker = U.hex("#ff00ff")
    U.put(notes, 23, 40, marker)
    U.put(notes, 24, 40, marker)
    U.put(notes, 25, 40, marker)
  end
  sprite:saveAs(spec.output)
end

return M
