-- Build: Trash Brute
-- Build all native .pxo sources:
--   lua docs/art/scripts/validate-builders.lua --write
-- Export all sheets: docs/art/scripts/export-pixelorama.sh

local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  purple = U.hex("#a855f7"),
  violet = U.hex("#6d28d9"),
  cream  = U.hex("#fff3c4"),
  steel  = U.hex("#64748b"),
  rust   = U.hex("#b45309"),
  magenta = U.hex("#d946ef"),
}

local CX, CY = 24, 24

local function drawBodyLayer(spr, frame)
  local cel = U.clearCel(spr, "body", frame)
  if not cel then return end
  local img = cel.image

  local rock = 0
  if frame <= 4 then
    rock = (frame % 2 == 0) and 1 or 0
  elseif frame <= 10 then
    rock = (frame % 2 == 0) and -1 or 1
  elseif frame <= 12 then
    rock = 2
  else
    rock = 0
  end

  local defeatStage = (frame >= 13) and (frame - 12) or 0
  local cx = CX + rock
  local cy = CY + math.min(defeatStage, 3)
  local bodyHeight = (defeatStage > 0) and math.max(10, 18 - defeatStage * 2) or 18
  local bodyTop = cy - math.floor(bodyHeight / 2)

  -- near-square compactor body
  U.outlinedRect(img, cx - 10, bodyTop, 20, bodyHeight, C.purple)
  -- stepped shoulder blocks create the broad compactor silhouette
  U.outlinedRect(img, cx - 13, bodyTop + 3, 5, 7, C.violet)
  U.outlinedRect(img, cx + 8, bodyTop + 3, 5, 7, C.violet)

  -- chest plate detail
  U.fillRect(img, cx - 6, cy - 3, 12, math.max(4, bodyHeight - 10), C.violet)
  U.line(img, cx - 5, cy + 2, cx + 5, cy + 2, C.magenta)

  -- tiny planted feet
  U.outlinedRect(img, cx - 6, bodyTop + bodyHeight, 4, 3, C.steel)
  U.outlinedRect(img, cx + 2, bodyTop + bodyHeight, 4, 3, C.steel)

  -- bent exhaust pipe on back
  U.outlinedLine(img, cx - 10, bodyTop + 4, cx - 14, bodyTop + (frame % 2), C.steel, U.OUTLINE, 2)

  -- scrap sack tied on back
  U.outlinedCircle(img, cx - 11, cy + 3, 3, C.rust)

  -- bin-lid forearms (wide points)
  local armSwing = 0
  if frame <= 10 then
    armSwing = (frame % 2 == 0) and 2 or -2
  elseif frame <= 12 then
    armSwing = 3
  else
    armSwing = 0
  end
  U.outlinedRect(img, cx - 13, cy - 2 + armSwing, 4, math.min(8, bodyHeight), C.steel)
  U.outlinedRect(img, cx + 9, cy - 2 - armSwing, 4, math.min(8, bodyHeight), C.steel)
end

local function drawFaceLayer(spr, frame)
  local cel = U.clearCel(spr, "face", frame)
  if not cel then return end
  local img = cel.image

  local rock = 0
  if frame <= 4 then
    rock = (frame % 2 == 0) and 1 or 0
  elseif frame <= 10 then
    rock = (frame % 2 == 0) and -1 or 1
  elseif frame <= 12 then
    rock = 2
  end

  local defeatStage = (frame >= 13) and (frame - 12) or 0
  local cx, cy = CX + rock, CY + math.min(defeatStage, 3)

  -- narrow cream face slit
  U.fillRect(img, cx - 4, cy - 2, 8, 2, C.cream)
  -- grumpy line
  U.line(img, cx - 3, cy - 1, cx + 3, cy - 1, U.OUTLINE)
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

spr:saveAs("assets-src/enemies/trash-brute/source/trash-brute.pxo")
