-- Build: Scrap Sniper
-- Tall non-humanoid tripod with a lateral sighting stalk and rear counterweight.

local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  steel = U.hex("#9fb5bd"),
  pale = U.hex("#dce9e8"),
  ice = U.hex("#5bb4c7"),
  dark = U.hex("#26343e"),
  battery = U.hex("#53636d"),
  red = U.hex("#ef4444"),
}

local function drawTripod(img, frame, fallen)
  if fallen then
    local settle = frame - 12
    local y = 31 + math.min(settle, 3)
    U.outlinedLine(img, 13, y + 5, 35, y + 2, C.steel, U.OUTLINE, 1)
    U.outlinedLine(img, 20, y, 10 + settle, 40, C.dark, U.OUTLINE, 1)
    U.outlinedLine(img, 27, y, 38 - settle, 40, C.dark, U.OUTLINE, 1)
    U.outlinedLine(img, 24, y + 1, 25 + settle, 41, C.ice, U.OUTLINE, 1)
    return
  end

  local stride = 0
  if frame >= 5 and frame <= 10 then stride = ({ -2, 0, 2, -1, 1, 0 })[frame - 4] end
  -- Three planted legs leave large, unmistakable negative spaces.
  U.outlinedLine(img, 21, 24, 12 + stride, 40, C.dark, U.OUTLINE, 1)
  U.outlinedLine(img, 24, 25, 24 - stride, 41, C.ice, U.OUTLINE, 1)
  U.outlinedLine(img, 27, 24, 36 + stride, 40, C.dark, U.OUTLINE, 1)
  U.fillRect(img, 10 + stride, 40, 5, 2, C.pale)
  U.fillRect(img, 22 - stride, 41, 5, 2, C.pale)
  U.fillRect(img, 34 + stride, 40, 5, 2, C.pale)
end

local function drawBodyLayer(spr, frame)
  local img = U.clearCel(spr, "body", frame).image
  local fallen = frame >= 13
  drawTripod(img, frame, fallen)

  if fallen then
    local settle = frame - 12
    local y = 30 + math.min(settle, 3)
    U.outlinedRect(img, 19 + settle, y - 3, 10, 7, C.steel)
    U.outlinedRect(img, 11 + settle, y - 2, 7, 5, C.battery)
    U.outlinedLine(img, 23 + settle, y - 3, 38 - settle, y - 5 + settle, C.pale, U.OUTLINE, 2)
    return
  end

  local recoil = frame == 11 and -2 or frame == 12 and -1 or 0
  local idleTick = frame <= 4 and ((frame % 2 == 0) and 1 or 0) or 0
  -- Tiny hub and rear battery/counterweight; the machine is mostly legs and stalk.
  U.outlinedRect(img, 19, 17 + idleTick, 10, 9, C.steel)
  U.fillRect(img, 21, 19 + idleTick, 6, 3, C.ice)
  U.outlinedRect(img, 12, 19 + idleTick, 7, 6, C.battery)
  U.outlinedLine(img, 15, 19 + idleTick, 12, 16 + idleTick, C.ice, U.OUTLINE, 1)

  -- Lateral optical stalk, deliberately not a firearm barrel.
  U.outlinedLine(img, 23 + recoil, 16 + idleTick, 38 + recoil, 13 + idleTick, C.pale, U.OUTLINE, 2)
  U.outlinedRect(img, 34 + recoil, 11 + idleTick, 6, 5, C.dark)
  U.fillRect(img, 27 + recoil, 14 + idleTick, 4, 2, C.ice)
end

local function drawFaceLayer(spr, frame)
  local img = U.clearCel(spr, "face", frame).image
  if frame >= 13 then
    local settle = frame - 12
    U.outlinedCircle(img, 34 - settle, 27 + settle * 2, 2, C.red)
    return
  end
  local recoil = frame == 11 and -2 or frame == 12 and -1 or 0
  local idleTick = frame <= 4 and ((frame % 2 == 0) and 1 or 0) or 0
  -- Exactly one danger-red optic is the face/readability accent.
  U.outlinedCircle(img, 38 + recoil, 13 + idleTick, 2, C.red)
  U.put(img, 39 + recoil, 13 + idleTick, C.pale)
end

local function drawNotesLayer(spr, frame)
  local img = U.clearCel(spr, "notes", frame).image
  local marker = U.hex("#ff00ff")
  U.put(img, 24, 41, marker)
  U.put(img, 23, 41, marker)
  U.put(img, 25, 41, marker)
end

local spr = U.makeSprite("enemy", 48, 48)
for frame = 1, 16 do
  drawBodyLayer(spr, frame)
  drawFaceLayer(spr, frame)
  drawNotesLayer(spr, frame)
end
spr:saveAs("assets-src/enemies/scrap-sniper/source/scrap-sniper.pxo")
