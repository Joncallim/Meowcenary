-- Build: XP Mote
-- Build all native .pxo sources:
--   lua docs/art/scripts/validate-builders.lua --write
-- Export all sheets: docs/art/scripts/export-pixelorama.sh

local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  sky   = U.hex("#7dd3fc"),
  pale  = U.hex("#d6f7ff"),
  teal  = U.hex("#2dd4bf"),
  deep  = U.hex("#214756"),
  white = U.hex("#ffffff"),
}

local CX, CY = 8, 8

local function drawDiamond(img, topY, bottomY, fill)
  -- tall seed/diamond shape
  local midY = (topY + bottomY) / 2
  for y = topY, bottomY do
    local dist = math.abs(y - midY) / (bottomY - topY) * 2
    local width = math.max(1, math.floor((1 - dist) * 5 + 0.5))
    for x = CX - width, CX + width do
      U.put(img, x, y, fill)
    end
  end
end

local function drawFrame(img, frame)
  U.clear(img)

  local stretch = 0
  if frame == 2 then
    stretch = -1
  end

  local topY = CY - 6 + stretch
  local bottomY = CY + 6

  -- outline by drawing a slightly larger diamond first
  drawDiamond(img, topY - 1, bottomY + 1, U.OUTLINE)

  -- sky-blue upper facets
  drawDiamond(img, topY, CY - 1, C.sky)

  -- pale cyan upper highlight
  for y = topY, CY - 3 do
    local w = math.max(1, math.floor((1 - math.abs(y - (topY + bottomY) / 2) / (bottomY - topY) * 2) * 4 + 0.5))
    U.put(img, CX, y, C.pale)
  end

  -- teal lower facet
  for y = CY, bottomY do
    local w = math.max(1, math.floor((1 - math.abs(y - (topY + bottomY) / 2) / (bottomY - topY) * 2) * 5 + 0.5))
    for x = CX - w + 1, CX + w - 1 do
      U.put(img, x, y, C.teal)
    end
  end

  -- white core / glint
  if frame == 3 then
    -- bright cross-glint
    U.line(img, CX, topY + 1, CX, bottomY - 1, C.white)
    U.line(img, CX - 2, CY, CX + 2, CY, C.white)
  else
    U.outlinedCircle(img, CX, CY, 1, C.white)
  end
  -- pointed teal tail reinforces upward buoyancy at 16px
  U.put(img, CX, bottomY, C.teal)
  U.put(img, CX, bottomY + 1, C.teal)
end

local spr = U.makePropSprite(16, 16)

-- Ensure we have exactly four frames.
while #spr.frames < 4 do
  spr:newEmptyFrame()
end

spr:newTag(1, 4).name = "idle"

for frame = 1, 4 do
  local cel = U.getCel(spr, "body", frame)
  if cel then
    drawFrame(cel.image, frame)
  end
end

spr:saveAs("assets-src/pickups/xp-mote/source/xp-mote.pxo")
