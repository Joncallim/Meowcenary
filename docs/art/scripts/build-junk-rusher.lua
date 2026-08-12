-- Build: Junk Rusher
-- Build all native .pxo sources:
--   lua docs/art/scripts/validate-builders.lua --write
-- Export all sheets: docs/art/scripts/export-pixelorama.sh

local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  orange = U.hex("#f97316"),
  rust   = U.hex("#9a3412"),
  cream  = U.hex("#fff3c4"),
  steel  = U.hex("#64748b"),
  light  = U.hex("#cbd5e1"),
}

local CX, CY = 24, 24

local function drawBodyLayer(spr, frame)
  local cel = U.clearCel(spr, "body", frame)
  if not cel then return end
  local img = cel.image

  local compress = 0
  if frame <= 4 then
    compress = (frame % 2 == 0) and 1 or 0
  elseif frame <= 10 then
    -- alternating compressed wind-up / extended dash
    compress = (frame % 2 == 0) and 3 or -1
  elseif frame <= 12 then
    compress = 2
  else
    compress = math.min(2 + (frame - 12), 5)
  end

  local cx, cy = CX, CY + math.floor(compress * 0.3)

  -- low triangular ram-beetle body
  -- main orange crushed-can shell (ellipse)
  U.outlinedEllipse(img, cx, cy, 11, 7, C.orange)
  -- riveted shell seams clarify the crushed-can construction
  U.line(img, cx - 5, cy - 5, cx - 3, cy + 5, C.rust)
  U.line(img, cx + 1, cy - 6, cx + 2, cy + 5, C.rust)
  U.put(img, cx - 6, cy - 1, C.cream)

  -- triangular wedge bumper on the right (front)
  for y = cy - 5, cy + 5 do
    local width = math.floor((y - (cy - 5)) * 0.6) + 2
    U.outlinedRect(img, cx + 6, y, width, 1, C.steel)
  end
  U.line(img, cx + 7, cy - 3, cx + 12, cy, C.light)

  -- tiny front stabilizers
  U.outlinedLine(img, cx + 6, cy + 6, cx + 8, cy + 10, C.steel, U.OUTLINE, 2)
  U.outlinedLine(img, cx + 4, cy + 6, cx + 5, cy + 10, C.steel, U.OUTLINE, 2)

  -- rear coil legs
  local coil = compress
  U.outlinedLine(img, cx - 9, cy + 3, cx - 13, cy + 7 - coil, C.rust, U.OUTLINE, 3)
  U.outlinedLine(img, cx - 9, cy - 1, cx - 13, cy + 2 - coil, C.rust, U.OUTLINE, 3)

  -- scrap-ribbon tail
  local tx = cx - 14
  local ty = cy - 3 + (frame % 3)
  U.outlinedLine(img, cx - 10, cy - 4, tx, ty, C.rust, U.OUTLINE, 2)
end

local function drawFaceLayer(spr, frame)
  local cel = U.clearCel(spr, "face", frame)
  if not cel then return end
  local img = cel.image

  local compress = 0
  if frame <= 4 then
    compress = (frame % 2 == 0) and 1 or 0
  elseif frame <= 10 then
    compress = (frame % 2 == 0) and 3 or -1
  elseif frame <= 12 then
    compress = 2
  else
    compress = math.min(2 + (frame - 12), 5)
  end

  local cx, cy = CX, CY + compress * 0.3

  -- cream readiness lamp on the wedge forehead
  U.outlinedCircle(img, cx + 8, cy - 2, 2, C.cream)
end

local function drawNotesLayer(spr, frame)
  local cel = U.clearCel(spr, "notes", frame)
  if not cel then return end
  local img = cel.image
  local c = U.hex("#ff00ff")
  U.put(img, CX, CY, c)
  U.put(img, CX - 1, CY, c)
  U.put(img, CX + 1, CY, c)
  U.put(img, CX, CY - 1, c)
  U.put(img, CX, CY + 1, c)
end

local function drawFrame(spr, frame)
  drawBodyLayer(spr, frame)
  drawFaceLayer(spr, frame)
  drawNotesLayer(spr, frame)
end

local spr = U.makeSprite("enemy", 48, 48)

for frame = 1, 16 do
  drawFrame(spr, frame)
end

spr:saveAs("assets-src/enemies/junk-rusher/source/junk-rusher.pxo")
