-- Build: Scrap Crusher (boss archetype placeholder art)
-- Build all native .pxo sources:
--   lua docs/art/scripts/validate-builders.lua --write
-- Export all sheets: docs/art/scripts/export-pixelorama.sh
--
-- NOTE: placeholder art derived from the Dust Mite builder with a boss
-- palette (dark body, gold trim). Real Scrap Crusher art replaces this sheet;
-- the sprite contract (48x48, 16 frames, idle/run/hurt/defeat clips) stays.

local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  red   = U.hex("#dc2626"),
  rust  = U.hex("#7f1d1d"),
  dark  = U.hex("#1e293b"),
  gold  = U.hex("#fbbf24"),
  cream = U.hex("#fff3c4"),
}

local CX, CY = 24, 24

local function drawLegs(img, cx, cy, frame)
  local offsets = { 0, 1, -1, 0 }
  local o = offsets[((frame - 1) % 4) + 1]
  if frame >= 11 then o = 2 end
  if frame >= 13 then o = 3 end

  -- heavier, shorter legs (slow heavy tread)
  local legPairs = {
    { cx - 10, cy - 2, cx - 13, cy - 4 + o },
    { cx - 10, cy + 2, cx - 14, cy + 2 - o },
    { cx - 10, cy + 6, cx - 13, cy + 7 + o },
    { cx + 10, cy - 2, cx + 13, cy - 4 - o },
    { cx + 10, cy + 2, cx + 14, cy + 2 + o },
    { cx + 10, cy + 6, cx + 13, cy + 7 - o },
  }
  for _, leg in ipairs(legPairs) do
    U.outlinedLine(img, leg[1], leg[2], leg[3], leg[4], C.rust, U.OUTLINE, 2)
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

  -- wide armored body with gold plating seams
  U.outlinedCircle(img, cx, cy, 12, C.red)
  U.outlinedCircle(img, cx - 3, cy - 3, 6, C.dark)
  U.outlinedCircle(img, cx + 3, cy + 2, 6, C.dark)
  U.outlinedLine(img, cx - 10, cy - 4, cx + 10, cy - 4, C.gold, U.OUTLINE, 1)
  U.outlinedLine(img, cx - 9, cy + 6, cx + 9, cy + 6, C.gold, U.OUTLINE, 1)

  -- heavy rivet clumps
  U.outlinedCircle(img, cx - 8, cy + 1, 2, C.gold)
  U.outlinedCircle(img, cx + 8, cy + 1, 2, C.gold)
  U.outlinedCircle(img, cx, cy - 8, 2, C.gold)

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

  -- twin angry eyes (boss glare)
  U.outlinedCircle(img, cx - 1, cy - 3, 4, U.OUTLINE)
  U.outlinedCircle(img, cx - 1, cy - 3, 2, C.gold)
  U.put(img, cx, cy - 3, U.OUTLINE)
  U.outlinedCircle(img, cx + 7, cy - 3, 4, U.OUTLINE)
  U.outlinedCircle(img, cx + 7, cy - 3, 2, C.gold)
  U.put(img, cx + 8, cy - 3, U.OUTLINE)

  -- cream jaw plates
  U.outlinedCircle(img, cx + 3, cy + 4, 4, C.cream)

  -- twin heavy horns
  U.outlinedLine(img, cx - 4, cy - 11, cx - 7, cy - 15, C.cream, U.OUTLINE, 2)
  U.outlinedLine(img, cx + 8, cy - 11, cx + 11, cy - 15, C.cream, U.OUTLINE, 2)
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

spr:saveAs("assets-src/enemies/boss-crusher/source/boss-crusher.pxo")
