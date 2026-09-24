-- Build: Scrap Crusher
-- Low asymmetric compactor boss. The 48px canvas is retained to preserve the
-- stable resource/binding contract; mass comes from a near-full-width jaw.

local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  hazard = U.hex("#d94336"),
  redDark = U.hex("#8f2926"),
  steel = U.hex("#344653"),
  steelLight = U.hex("#667681"),
  cream = U.hex("#ead9aa"),
  copper = U.hex("#b96f3c"),
  cyan = U.hex("#55cbd2"),
}

local function drawTreads(img, frame, fallen)
  local y = fallen and 39 or 38
  U.outlinedRect(img, 9, y - 2, 30, 4, C.steel)
  local tick = frame % 3
  for x = 12 + tick, 36, 6 do U.fillRect(img, x, y - 1, 3, 2, C.steelLight) end
end

local function drawBodyLayer(spr, frame)
  local img = U.clearCel(spr, "body", frame).image
  local fallen = frame >= 13
  drawTreads(img, frame, fallen)

  if fallen then
    local settle = frame - 12
    -- Defeat reads as the ram sagging open while the motor tears loose.
    U.outlinedRect(img, 7, 25 + settle, 29 - settle, 6, C.hazard)
    U.outlinedRect(img, 10 + settle, 33 + math.min(settle, 2), 27, 5, C.cream)
    U.outlinedCircle(img, 37 + math.min(settle, 2), 29 + settle, 5, C.copper)
    U.outlinedLine(img, 8, 27 + settle, 5 + settle, 34, C.steelLight, U.OUTLINE, 2)
    return
  end

  local jawShift = frame == 11 and 2 or frame == 12 and 1 or 0
  local idleFlex = frame <= 4 and ((frame % 2 == 0) and 1 or 0) or 0
  local drive = frame >= 5 and frame <= 10 and ((frame % 2 == 0) and 1 or 0) or 0

  -- One obvious side piston braces the huge jaw assembly.
  U.outlinedRect(img, 5 + drive, 23, 9, 8, C.steelLight)
  U.outlinedLine(img, 8 + drive, 27, 17 + jawShift, 27, C.copper, U.OUTLINE, 3)
  U.outlinedRect(img, 4 + drive, 25, 4, 4, C.cream)

  -- Upper and lower compactor jaws dominate the horizontal silhouette.
  U.outlinedRect(img, 14 + jawShift, 18 + idleFlex, 27 - jawShift, 8, C.hazard)
  U.fillRect(img, 18 + jawShift, 23 + idleFlex, 19, 2, C.cream)
  U.outlinedRect(img, 12, 30 - idleFlex, 30, 7, C.redDark)
  U.fillRect(img, 16, 30 - idleFlex, 22, 2, C.cream)
  for x = 17, 35, 6 do
    U.fillRect(img, x, 25 + idleFlex, 3, 2, U.OUTLINE)
    U.fillRect(img, x + 2, 28 - idleFlex, 3, 2, U.OUTLINE)
  end

  -- Exposed off-center motor keeps the boss asymmetric.
  U.outlinedCircle(img, 37, 18 + idleFlex, 6, C.copper)
  U.outlinedCircle(img, 37, 18 + idleFlex, 3, C.steel)
  U.outlinedLine(img, 37, 15 + idleFlex, 37, 21 + idleFlex, C.cream, U.OUTLINE, 1)
end

local function drawFaceLayer(spr, frame)
  local img = U.clearCel(spr, "face", frame).image
  if frame >= 13 then
    local settle = frame - 12
    U.outlinedRect(img, 28 - settle, 30 + settle, 5, 3, C.steel)
    U.fillRect(img, 29 - settle, 31 + settle, 2, 1, C.cyan)
    return
  end
  local idleFlex = frame <= 4 and ((frame % 2 == 0) and 1 or 0) or 0
  -- A tiny recessed sensor, never an angry face or generic boss crown.
  U.outlinedRect(img, 28, 20 + idleFlex, 6, 4, C.steel)
  U.fillRect(img, 30, 21 + idleFlex, 2, 2, C.cyan)
end

local function drawNotesLayer(spr, frame)
  local img = U.clearCel(spr, "notes", frame).image
  local marker = U.hex("#ff00ff")
  U.put(img, 24, 39, marker)
  U.put(img, 23, 39, marker)
  U.put(img, 25, 39, marker)
end

local spr = U.makeSprite("enemy", 48, 48)
for frame = 1, 16 do
  drawBodyLayer(spr, frame)
  drawFaceLayer(spr, frame)
  drawNotesLayer(spr, frame)
end
spr:saveAs("assets-src/enemies/boss-crusher/source/boss-crusher.pxo")
