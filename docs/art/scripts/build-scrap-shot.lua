-- Build: Scrap Shot
-- Build all native .pxo sources:
--   lua docs/art/scripts/validate-builders.lua --write
-- Export all sheets: docs/art/scripts/export-pixelorama.sh

local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  cyan   = U.hex("#8bd3ff"),
  cream  = U.hex("#fff3c4"),
  steel  = U.hex("#64748b"),
  navy   = U.hex("#17303b"),
}

local CX, CY = 8, 8

local function drawFrame(img, frame)
  U.clear(img)

  -- hexagonal filed-metal slug body
  U.outlinedEllipse(img, CX, CY, 5, 4, C.steel)
  U.fillRect(img, CX - 3, CY - 2, 7, 4, C.steel)

  -- cream nose pointing right
  U.outlinedEllipse(img, CX + 3, CY, 2, 2, C.cream)
  U.fillRect(img, CX + 3, CY - 1, 2, 2, C.cream)

  -- dark rear recess
  U.fillRect(img, CX - 4, CY - 1, 2, 2, C.navy)

  -- bright angled cyan energy seam
  local seamBright = (frame == 2) and C.cyan or U.hex("#5ca8d6")
  U.line(img, CX - 1, CY - 1, CX + 1, CY - 1, seamBright)
  U.line(img, CX - 1, CY, CX + 1, CY, seamBright)
  U.line(img, CX - 1, CY + 1, CX + 1, CY + 1, seamBright)
  U.put(img, CX + 1, CY - 2, C.cyan)
  U.put(img, CX + 2, CY + 2, C.cyan)

  -- tiny rear spark on frame 2
  if frame == 2 then
    U.put(img, CX - 5, CY - 1, C.cyan)
    U.put(img, CX - 6, CY, C.cream)
  else
    U.put(img, CX - 5, CY, C.cyan)
  end
end

local spr = U.makePropSprite(16, 16)

-- Ensure we have exactly two frames.
while #spr.frames < 2 do
  spr:newEmptyFrame()
end

spr:newTag(1, 2).name = "fly"

for frame = 1, 2 do
  local cel = U.getCel(spr, "body", frame)
  if cel then
    drawFrame(cel.image, frame)
  end
end

spr:saveAs("assets-src/projectiles/scrap-shot/source/scrap-shot.pxo")
