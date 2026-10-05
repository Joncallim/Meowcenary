-- Shared lossless raster renderer for in-run upgrade icons.
-- Source pixels are RGBA8, row-major, encoded as lowercase hexadecimal by
-- build-upgrade-production-art.py and stored in each deterministic Lua builder.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")
local spec = assert(EPIC18_UPGRADE_ICON_ART, "EPIC18_UPGRADE_ICON_ART must be set by the asset builder")

assert(type(spec.rgbaHex) == "string", "upgrade icon builder must provide RGBA8 hex pixels")
assert(#spec.rgbaHex == 48 * 48 * 8, "upgrade icon RGBA8 pixel payload must be exactly 48x48")

local sprite = U.makePropSprite(48, 48)
local image = U.getCel(sprite, "body", 1).image
U.clear(image)

for pixel = 0, 48 * 48 - 1 do
  local offset = pixel * 8 + 1
  local r = assert(tonumber(spec.rgbaHex:sub(offset, offset + 1), 16))
  local g = assert(tonumber(spec.rgbaHex:sub(offset + 2, offset + 3), 16))
  local b = assert(tonumber(spec.rgbaHex:sub(offset + 4, offset + 5), 16))
  local a = assert(tonumber(spec.rgbaHex:sub(offset + 6, offset + 7), 16))
  if a > 0 then
    local x = pixel % 48
    local y = math.floor(pixel / 48)
    U.put(image, x, y, app.pixelColor.rgba(r, g, b, a))
  end
end

sprite:saveAs(spec.savedAs)
EPIC18_UPGRADE_ICON_ART = nil
