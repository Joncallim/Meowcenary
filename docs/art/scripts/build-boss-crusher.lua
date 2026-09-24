-- Build: Scrap Crusher
-- Low asymmetric compactor boss on the authoritative 64px boss canvas.

local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  hazard = U.hex("#d94336"), redDark = U.hex("#8f2926"),
  steel = U.hex("#344653"), steelLight = U.hex("#667681"),
  cream = U.hex("#ead9aa"), copper = U.hex("#b96f3c"), cyan = U.hex("#55cbd2"),
}

local function drawTreads(img, frame, fallen)
  local y = fallen and 51 or 49
  U.outlinedRect(img, 12, y - 3, 40, 6, C.steel)
  local tick = frame % 3
  for x = 16 + tick, 48, 7 do U.fillRect(img, x, y - 1, 4, 3, C.steelLight) end
end

local function drawBodyLayer(spr, frame)
  local img = U.clearCel(spr, "body", frame).image
  local fallen = frame >= 13
  drawTreads(img, frame, fallen)

  if fallen then
    local settle = frame - 12
    U.outlinedRect(img, 10, 33 + settle, 38 - settle, 8, C.hazard)
    U.outlinedRect(img, 14 + settle, 43 + math.min(settle, 2), 36, 7, C.cream)
    U.outlinedCircle(img, 50 + math.min(settle, 2), 38 + settle, 7, C.copper)
    U.outlinedLine(img, 11, 36 + settle, 7 + settle, 45, C.steelLight, U.OUTLINE, 3)
    return
  end

  local jawShift = frame == 11 and 3 or frame == 12 and 1 or 0
  local idleFlex = frame <= 4 and ((frame % 2 == 0) and 1 or 0) or 0
  local drive = frame >= 5 and frame <= 10 and ((frame % 2 == 0) and 2 or 0) or 0

  -- One obvious side piston braces the huge jaw assembly.
  U.outlinedRect(img, 7 + drive, 30, 12, 11, C.steelLight)
  U.outlinedLine(img, 11 + drive, 35, 23 + jawShift, 35, C.copper, U.OUTLINE, 4)
  U.outlinedRect(img, 5 + drive, 33, 5, 5, C.cream)

  -- Upper and lower compactor jaws dominate the horizontal silhouette.
  U.outlinedRect(img, 19 + jawShift, 23 + idleFlex, 36 - jawShift, 10, C.hazard)
  U.fillRect(img, 24 + jawShift, 30 + idleFlex, 25, 3, C.cream)
  U.outlinedRect(img, 16, 39 - idleFlex, 40, 9, C.redDark)
  U.fillRect(img, 22, 39 - idleFlex, 28, 3, C.cream)
  for x = 23, 47, 8 do
    U.fillRect(img, x, 33 + idleFlex, 4, 3, U.OUTLINE)
    U.fillRect(img, x + 2, 36 - idleFlex, 4, 3, U.OUTLINE)
  end

  -- Exposed off-center motor keeps the boss asymmetric.
  U.outlinedCircle(img, 50, 23 + idleFlex, 8, C.copper)
  U.outlinedCircle(img, 50, 23 + idleFlex, 4, C.steel)
  U.outlinedLine(img, 50, 19 + idleFlex, 50, 27 + idleFlex, C.cream, U.OUTLINE, 2)
end

local function drawFaceLayer(spr, frame)
  local img = U.clearCel(spr, "face", frame).image
  if frame >= 13 then
    local settle = frame - 12
    U.outlinedRect(img, 37 - settle, 40 + settle, 7, 4, C.steel)
    U.fillRect(img, 39 - settle, 41 + settle, 3, 2, C.cyan)
    return
  end
  local idleFlex = frame <= 4 and ((frame % 2 == 0) and 1 or 0) or 0
  -- A tiny recessed sensor, never an angry face or generic boss crown.
  U.outlinedRect(img, 37, 26 + idleFlex, 8, 5, C.steel)
  U.fillRect(img, 40, 27 + idleFlex, 3, 2, C.cyan)
end

local function drawNotesLayer(spr, frame)
  local img = U.clearCel(spr, "notes", frame).image
  local marker = U.hex("#ff00ff")
  U.put(img, 32, 51, marker)
  U.put(img, 31, 51, marker)
  U.put(img, 33, 51, marker)
end

local spr = U.makeSprite("enemy", 64, 64)
for frame = 1, 16 do
  drawBodyLayer(spr, frame)
  drawFaceLayer(spr, frame)
  drawNotesLayer(spr, frame)
end
spr:saveAs("assets-src/enemies/boss-crusher/source/boss-crusher.pxo")
