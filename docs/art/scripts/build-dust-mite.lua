-- Build: Dust Mite
-- Build all native .pxo sources:
--   lua docs/art/scripts/validate-builders.lua --write
-- Export all sheets: docs/art/scripts/export-pixelorama.sh

local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  red   = U.hex("#ef4444"),
  coral = U.hex("#f87171"),
  rust  = U.hex("#b9382f"),
  cream = U.hex("#fff3c4"),
  dark  = U.hex("#3b1515"),
}

local CX, CY = 24, 24

local function drawLegs(img, cx, cy, frame)
  local offsets = { 0, 1, -1, 0 }
  local o = offsets[((frame - 1) % 4) + 1]
  if frame >= 11 then o = 2 end
  if frame >= 13 then o = 3 end

  -- six pin legs, three per side
  local legPairs = {
    { cx - 10, cy - 3, cx - 14, cy - 5 + o },
    { cx - 10, cy + 1, cx - 15, cy + 1 - o },
    { cx - 10, cy + 5, cx - 14, cy + 7 + o },
    { cx + 10, cy - 3, cx + 14, cy - 5 - o },
    { cx + 10, cy + 1, cx + 15, cy + 1 + o },
    { cx + 10, cy + 5, cx + 14, cy + 7 - o },
  }
  for _, leg in ipairs(legPairs) do
    U.outlinedLine(img, leg[1], leg[2], leg[3], leg[4], C.rust, U.OUTLINE, 1)
  end
end

local function drawBodyLayer(spr, frame)
  local cel = U.clearCel(spr, "body", frame)
  if not cel then return end
  local img = cel.image

  local bob = 0
  if frame <= 4 then
    bob = (frame % 2 == 0) and 1 or 0
  elseif frame <= 10 then
    bob = (frame % 2 == 0) and -1 or 1
  elseif frame <= 12 then
    bob = 1
  else
    bob = math.min(frame - 12, 2)
  end

  local cx, cy = CX, CY + bob

  -- low circular rust-fluff body
  U.outlinedCircle(img, cx, cy, 10, C.red)
  -- ragged outline tufts keep it from collapsing into a generic circle
  for _, tuft in ipairs({ {-9,-7}, {-3,-10}, {5,-9}, {9,-5}, {-10,5}, {8,7} }) do
    U.outlinedLine(img, cx + tuft[1] * 0.7, cy + tuft[2] * 0.7,
      cx + tuft[1], cy + tuft[2], C.coral, U.OUTLINE, 1)
  end

  -- three or four large pixel clumps for fluff texture
  U.outlinedCircle(img, cx - 6, cy - 5, 3, C.coral)
  U.outlinedCircle(img, cx + 5, cy - 6, 3, C.coral)
  U.outlinedCircle(img, cx - 4, cy + 6, 3, C.coral)
  U.outlinedCircle(img, cx + 6, cy + 5, 3, C.coral)

  drawLegs(img, cx, cy, frame)
end

local function drawFaceLayer(spr, frame)
  local cel = U.clearCel(spr, "face", frame)
  if not cel then return end
  local img = cel.image

  local bob = 0
  if frame <= 4 then
    bob = (frame % 2 == 0) and 1 or 0
  elseif frame <= 10 then
    bob = (frame % 2 == 0) and -1 or 1
  elseif frame <= 12 then
    bob = 1
  else
    bob = math.min(frame - 12, 2)
  end

  local cx, cy = CX, CY + bob

  -- oversized dark goggle eye
  U.outlinedCircle(img, cx + 3, cy - 1, 5, C.dark)
  U.outlinedCircle(img, cx + 3, cy - 1, 2, C.cream)
  U.put(img, cx + 4, cy - 1, U.OUTLINE)

  -- cream brush cheeks
  U.outlinedCircle(img, cx - 3, cy + 1, 3, C.cream)
  U.outlinedCircle(img, cx + 7, cy + 1, 2, C.cream)

  -- bent wire antennae
  local ant = (frame % 2 == 0) and 1 or -1
  U.outlinedLine(img, cx - 2, cy - 9, cx - 4 + ant, cy - 13, C.rust, U.OUTLINE, 1)
  U.outlinedLine(img, cx + 2, cy - 9, cx + 4 - ant, cy - 13, C.rust, U.OUTLINE, 1)
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

spr:saveAs("assets-src/enemies/dust-mite/source/dust-mite.pxo")
