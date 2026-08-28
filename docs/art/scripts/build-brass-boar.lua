-- Build: Brass Boar (placeholder art)
-- Build all native .pxo sources:
--   lua docs/art/scripts/validate-builders.lua --write
-- Export all sheets: docs/art/scripts/export-pixelorama.sh

local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  amber = U.hex("#b45309"),
  cream = U.hex("#fde68a"),
  burnt = U.hex("#7c2d12"),
  teal = U.hex("#78716c"),
  denim = U.hex("#292524"),
  steel = U.hex("#d6d3d1"),
  white = U.hex("#ffffff"),
}

local CX, CY = 24, 24

local function drawEar(img, x, y, dir, notch)
  -- Simple triangular ear pointing up/out.
  local sign = (dir == "left") and -1 or 1
  U.outlinedLine(img, x, y, x + sign * 4, y - 7, C.amber, U.OUTLINE, 3)
  U.outlinedLine(img, x, y, x + sign * 1, y - 7, C.cream, U.OUTLINE, 1)
  if notch then
    -- small notch on the outer tip
    U.put(img, x + sign * 4, y - 7, U.TRANSPARENT)
    U.put(img, x + sign * 3, y - 6, C.amber)
  end
end

local function drawTail(img, bx, by, frame)
  local flick = 0
  if frame <= 4 then
    flick = math.sin((frame - 1) * 1.5) * 1.5
  elseif frame <= 10 then
    flick = (frame % 2 == 0) and 2 or -1
  elseif frame <= 12 then
    flick = 3
  else
    flick = 0
  end
  local tx = bx - 5
  local ty = by + 2 + flick
  U.outlinedLine(img, bx, by, tx, ty, C.amber, U.OUTLINE, 3)
  U.line(img, bx - 1, by + 1, tx + 1, ty - 1, C.burnt)
end

local function drawBodyLayer(spr, frame)
  local cel = U.clearCel(spr, "body", frame)
  if not cel then return end
  local img = cel.image

  local bob = 0
  if frame <= 4 then
    bob = (frame == 2 or frame == 4) and 1 or 0
  elseif frame <= 10 then
    bob = (frame % 2 == 0) and -1 or 0
  elseif frame <= 12 then
    bob = 1
  else
    bob = math.min(frame - 12, 3)
  end

  local cx, cy = CX, CY + bob

  -- torso
  U.outlinedEllipse(img, cx, cy + 5, 9, 8, C.amber)

  -- legs
  local legOffset = 0
  if frame >= 5 and frame <= 10 then
    local runPhase = { [5]=-2, [6]=0, [7]=2, [8]=-2, [9]=0, [10]=2 }
    legOffset = runPhase[frame] or 0
  end
  U.outlinedEllipse(img, cx - 4 + legOffset, cy + 12, 3, 4, C.amber)
  U.outlinedEllipse(img, cx + 4 - legOffset, cy + 12, 3, 4, C.amber)

  -- head
  U.outlinedCircle(img, cx, cy - 7, 8, C.amber)
  -- broad cream muzzle breaks the round head at phone scale
  U.outlinedEllipse(img, cx + 3, cy - 4, 5, 3, C.cream)

  -- ears
  drawEar(img, cx - 5, cy - 12, "left", false)
  drawEar(img, cx + 5, cy - 12, "right", true)

  -- tail
  drawTail(img, cx - 6, cy + 2, frame)
  -- two bold tabby bars survive the 28px runtime reduction
  U.line(img, cx - 4, cy - 11, cx - 2, cy - 8, C.burnt)
  U.line(img, cx, cy - 12, cx, cy - 9, C.burnt)
end

local function drawFaceLayer(spr, frame)
  local cel = U.clearCel(spr, "face", frame)
  if not cel then return end
  local img = cel.image

  local bob = 0
  if frame <= 4 then
    bob = (frame == 2 or frame == 4) and 1 or 0
  elseif frame <= 10 then
    bob = (frame % 2 == 0) and -1 or 0
  elseif frame <= 12 then
    bob = 1
  else
    bob = math.min(frame - 12, 3)
  end

  local cx, cy = CX, CY + bob

  -- eyes
  local eyeY = cy - 8
  if frame >= 11 and frame <= 12 then eyeY = eyeY + 1 end
  U.outlinedCircle(img, cx - 3, eyeY, 2, C.white)
  U.outlinedCircle(img, cx + 3, eyeY, 2, C.white)
  U.put(img, cx - 2, eyeY, U.OUTLINE)
  U.put(img, cx + 4, eyeY, U.OUTLINE)

  -- nose
  U.outlinedCircle(img, cx + 5, cy - 5, 1, C.burnt)

  -- mouth (small line)
  U.line(img, cx + 3, cy - 3, cx + 5, cy - 3, U.OUTLINE)
end

local function drawOutfitLayer(spr, frame)
  local cel = U.clearCel(spr, "outfit", frame)
  if not cel then return end
  local img = cel.image

  local bob = 0
  if frame <= 4 then
    bob = (frame == 2 or frame == 4) and 1 or 0
  elseif frame <= 10 then
    bob = (frame % 2 == 0) and -1 or 0
  elseif frame <= 12 then
    bob = 1
  else
    bob = math.min(frame - 12, 3)
  end

  local cx, cy = CX, CY + bob

  -- neckerchief
  U.outlinedRect(img, cx - 5, cy - 2, 10, 4, C.teal)
  -- scarf tail
  local tailTipY = cy + 2
  if frame >= 5 and frame <= 10 then
    tailTipY = tailTipY + ((frame % 2 == 0) and 2 or 0)
  end
  U.outlinedLine(img, cx, cy, cx - 6, tailTipY, C.teal, U.OUTLINE, 2)

  -- tin-lid shoulder guard (left side)
  U.outlinedCircle(img, cx - 8, cy - 1, 5, C.steel)
  -- rivet
  U.put(img, cx - 8, cy - 1, C.burnt)

  -- dark work overalls (lower torso)
  U.outlinedEllipse(img, cx, cy + 8, 7, 5, C.denim)

  -- utility belt
  U.fillRect(img, cx - 6, cy + 4, 12, 2, C.burnt)
  U.put(img, cx - 2, cy + 4, C.cream)
  U.put(img, cx + 2, cy + 4, C.cream)
  -- shoulder-ring highlight makes the asymmetrical scrap armor read instantly
  U.outlinedCircle(img, cx - 8, cy - 1, 2, C.denim)
  U.put(img, cx - 8, cy - 2, C.white)
end

local function drawNotesLayer(spr, frame)
  local cel = U.clearCel(spr, "notes", frame)
  if not cel then return end
  local img = cel.image
  -- Hidden guide: body center cross.
  U.put(img, CX, CY, U.hex("#ff00ff"))
  U.put(img, CX - 1, CY, U.hex("#ff00ff"))
  U.put(img, CX + 1, CY, U.hex("#ff00ff"))
  U.put(img, CX, CY - 1, U.hex("#ff00ff"))
  U.put(img, CX, CY + 1, U.hex("#ff00ff"))
end

local function drawFrame(spr, frame)
  drawBodyLayer(spr, frame)
  drawFaceLayer(spr, frame)
  drawOutfitLayer(spr, frame)
  drawNotesLayer(spr, frame)
end

local spr, layers = U.makeSprite("character", 48, 48)

-- Ensure weapon and shadow layers are empty/hidden per production rule.
layers.weapon.isVisible = false
layers.shadow.isVisible = false

for frame = 1, 16 do
  drawFrame(spr, frame)
end

spr:saveAs("assets-src/characters/brass-boar/source/brass-boar.pxo")
