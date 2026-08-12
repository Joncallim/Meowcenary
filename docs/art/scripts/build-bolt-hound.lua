-- Build: Bolt Hound
-- Build all native .pxo sources:
--   lua docs/art/scripts/validate-builders.lua --write
-- Export all sheets: docs/art/scripts/export-pixelorama.sh

local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  steel = U.hex("#38bdf8"),
  pale  = U.hex("#d6f7ff"),
  lime  = U.hex("#a3e635"),
  navy  = U.hex("#17303b"),
  rust  = U.hex("#b45309"),
  dark  = U.hex("#0b1f2a"),
}

local CX, CY = 24, 24

local function drawEarSwept(img, x, y)
  -- Long ear swept back.
  U.outlinedLine(img, x, y, x - 8, y - 2, C.steel, U.OUTLINE, 3)
  U.line(img, x - 1, y - 1, x - 6, y - 2, C.pale)
end

local function drawEarUpright(img, x, y)
  -- Shorter upright ear.
  U.outlinedLine(img, x, y, x + 2, y - 6, C.steel, U.OUTLINE, 3)
  U.line(img, x + 1, y - 1, x + 2, y - 4, C.pale)
end

local function drawTail(img, cx, cy, frame)
  local flick = 0
  if frame <= 4 then
    flick = (frame % 2 == 0) and 1 or -1
  elseif frame <= 10 then
    flick = (frame % 2 == 0) and 2 or -2
  elseif frame <= 12 then
    flick = 3
  else
    flick = -1
  end
  local tx = cx - 12
  local ty = cy - 3 + flick
  U.outlinedLine(img, cx - 6, cy + 1, tx, ty, C.steel, U.OUTLINE, 3)
  U.line(img, cx - 7, cy + 1, tx + 1, ty, C.pale)
end

local function drawBodyLayer(spr, frame)
  local cel = U.clearCel(spr, "body", frame)
  if not cel then return end
  local img = cel.image

  local bob = 0
  if frame <= 4 then
    bob = (frame == 2) and -1 or 0
  elseif frame <= 10 then
    bob = (frame % 2 == 0) and 1 or -1
  elseif frame <= 12 then
    bob = 1
  else
    bob = math.min(frame - 12, 2)
  end

  local cx, cy = CX, CY + bob

  -- long low torso
  U.outlinedEllipse(img, cx, cy + 2, 12, 6, C.steel)
  -- dark saddle/back plate gives the hound a long lightning-bolt silhouette
  U.outlinedRect(img, cx - 6, cy - 3, 10, 5, C.navy)

  -- head
  U.outlinedEllipse(img, cx + 6, cy - 5, 7, 5, C.steel)
  U.fillRect(img, cx + 7, cy - 2, 6, 3, C.pale)

  -- ears
  drawEarSwept(img, cx + 3, cy - 9)
  drawEarUpright(img, cx + 10, cy - 8)

  -- legs (small ellipses, animated)
  local legA, legB = 0, 0
  if frame >= 5 and frame <= 10 then
    local phase = { [5]=-3, [6]=0, [7]=3, [8]=-3, [9]=0, [10]=3 }
    legA = phase[frame] or 0
    legB = -legA
  elseif frame >= 13 then
    legA = 2
    legB = 4
  end
  U.outlinedEllipse(img, cx - 5 + legA, cy + 8, 3, 5, C.steel)
  U.outlinedEllipse(img, cx + 5 + legB, cy + 8, 3, 5, C.steel)
  U.outlinedEllipse(img, cx - 8 + legB, cy + 7, 2, 4, C.steel)
  U.outlinedEllipse(img, cx + 8 + legA, cy + 7, 2, 4, C.steel)

  drawTail(img, cx, cy, frame)
end

local function drawFaceLayer(spr, frame)
  local cel = U.clearCel(spr, "face", frame)
  if not cel then return end
  local img = cel.image

  local bob = 0
  if frame <= 4 then
    bob = (frame == 2) and -1 or 0
  elseif frame <= 10 then
    bob = (frame % 2 == 0) and 1 or -1
  elseif frame <= 12 then
    bob = 1
  else
    bob = math.min(frame - 12, 2)
  end

  local cx, cy = CX, CY + bob

  -- eye
  U.outlinedCircle(img, cx + 7, cy - 6, 2, C.pale)
  U.put(img, cx + 8, cy - 6, U.OUTLINE)

  -- nose
  U.put(img, cx + 12, cy - 4, U.OUTLINE)
  U.line(img, cx + 8, cy - 2, cx + 11, cy - 2, C.dark)
end

local function drawOutfitLayer(spr, frame)
  local cel = U.clearCel(spr, "outfit", frame)
  if not cel then return end
  local img = cel.image

  local bob = 0
  if frame <= 4 then
    bob = (frame == 2) and -1 or 0
  elseif frame <= 10 then
    bob = (frame % 2 == 0) and 1 or -1
  elseif frame <= 12 then
    bob = 1
  else
    bob = math.min(frame - 12, 2)
  end

  local cx, cy = CX, CY + bob

  -- racing harness straps
  U.line(img, cx - 4, cy - 1, cx + 6, cy + 2, C.navy)
  U.line(img, cx - 3, cy + 3, cx + 5, cy, C.navy)
  -- harness clip
  U.outlinedRect(img, cx, cy, 3, 3, C.rust)

  -- cyan foreleg bracer (front right leg)
  local legA = 0
  if frame >= 5 and frame <= 10 then
    local phase = { [5]=-3, [6]=0, [7]=3, [8]=-3, [9]=0, [10]=3 }
    legA = phase[frame] or 0
  end
  U.outlinedRect(img, cx + 6 + legA, cy + 6, 4, 3, C.pale)

  -- lime timing light on shoulder
  U.outlinedCircle(img, cx - 4, cy - 2, 2, C.lime)
  U.put(img, cx - 4, cy - 3, C.pale)
end

local function drawNotesLayer(spr, frame)
  local cel = U.clearCel(spr, "notes", frame)
  if not cel then return end
  local img = cel.image
  local c = U.hex("#00ff00")
  U.put(img, CX, CY, c)
  U.put(img, CX - 1, CY, c)
  U.put(img, CX + 1, CY, c)
  U.put(img, CX, CY - 1, c)
  U.put(img, CX, CY + 1, c)
end

local function drawFrame(spr, frame)
  drawBodyLayer(spr, frame)
  drawFaceLayer(spr, frame)
  drawOutfitLayer(spr, frame)
  drawNotesLayer(spr, frame)
end

local spr, layers = U.makeSprite("character", 48, 48)
layers.weapon.isVisible = false
layers.shadow.isVisible = false

for frame = 1, 16 do
  drawFrame(spr, frame)
end

spr:saveAs("assets-src/characters/bolt-hound/source/bolt-hound.pxo")
