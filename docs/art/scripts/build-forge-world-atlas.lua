-- Deterministic native-scale Forge/Foundry world packet.
--
-- The atlas is deliberately assembled from 32 px and 64 px named frames in
-- a 256x256 Pixelorama source.  The runtime exporter crops the named frames;
-- the source remains editable and the builder remains the reproducible
-- production authority.  These are authored pixel primitives, not generated
-- board pixels.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local W, H = 256, 256
local spr = U.makePropSprite(W, H)
local img = U.getCel(spr, "body", 1).image
local C = {
  clear = U.TRANSPARENT,
  ink = U.hex("#0b1014"),
  charcoal = U.hex("#1b2329"),
  plate = U.hex("#2b3439"),
  steel = U.hex("#59656c"),
  steelHi = U.hex("#8b9697"),
  cream = U.hex("#d8cdb0"),
  copper = U.hex("#a65a36"),
  orange = U.hex("#d9853d"),
  hot = U.hex("#e8a348"),
  teal = U.hex("#5b7f7b"),
  liquid = U.hex("#111b1c"),
}

U.clear(img)

local function rect(x, y, w, h, color) U.fillRect(img, x, y, w, h, color) end
local function line(x1, y1, x2, y2, color) U.line(img, x1, y1, x2, y2, color) end
local function put(x, y, color) U.put(img, x, y, color) end
local function outlinedRect(x, y, w, h, fill, outline) U.outlinedRect(img, x, y, w, h, fill, outline) end
local function outlinedEllipse(cx, cy, rx, ry, fill, outline) U.outlinedEllipse(img, cx, cy, rx, ry, fill, outline) end
local function fillEllipse(cx, cy, rx, ry, fill) U.fillEllipse(img, cx, cy, rx, ry, fill) end

local function fasteners(x, y)
  put(x + 3, y + 3, C.steelHi); put(x + 28, y + 3, C.steel)
  put(x + 3, y + 28, C.steel); put(x + 28, y + 28, C.steelHi)
end

local function floorBase(x, y)
  rect(x, y, 32, 32, C.charcoal)
  line(x, y + 14, x + 31, y + 14, C.plate)
  line(x + 15, y, x + 15, y + 13, C.plate)
  line(x + 22, y + 15, x + 22, y + 31, C.plate)
  fasteners(x, y)
end

local function floorGratePatch(x, y)
  floorBase(x, y)
  rect(x, y + 11, 32, 10, C.ink)
  rect(x, y + 11, 32, 2, C.copper)
  rect(x, y + 20, 32, 2, C.copper)
  for xx = x + 3, x + 29, 5 do rect(xx, y + 14, 2, 5, C.plate) end
  line(x + 1, y + 23, x + 30, y + 23, C.steel)
end

local function floorHeatScar(x, y)
  floorBase(x, y)
  -- A historical heat ring is deliberately quiet: it is not a live hazard.
  line(x + 4, y + 25, x + 7, y + 19, C.copper)
  line(x + 7, y + 19, x + 13, y + 15, C.copper)
  line(x + 13, y + 15, x + 20, y + 14, C.copper)
  line(x + 20, y + 14, x + 27, y + 18, C.copper)
  line(x + 27, y + 18, x + 29, y + 24, C.copper)
  line(x + 9, y + 26, x + 19, y + 23, C.steelHi)
  line(x + 19, y + 23, x + 24, y + 26, C.steelHi)
end

local function boundaryStraight(x, y)
  -- The lower inner edge is the readable, engineered collision edge.
  outlinedRect(x + 1, y + 2, 30, 8, C.plate, C.ink)
  rect(x + 2, y + 4, 28, 2, C.steel)
  rect(x + 2, y + 8, 28, 2, C.cream)
  line(x + 4, y + 12, x + 27, y + 12, C.ink)
  put(x + 8, y + 5, C.copper); put(x + 23, y + 5, C.copper)
end

local function boundaryCorner(x, y)
  rect(x, y, 32, 32, C.clear)
  outlinedRect(x + 1, y + 2, 30, 8, C.plate, C.ink)
  outlinedRect(x + 1, y + 2, 8, 29, C.plate, C.ink)
  rect(x + 2, y + 8, 7, 2, C.cream)
  rect(x + 8, y + 4, 22, 2, C.steel)
  rect(x + 4, y + 11, 2, 16, C.steel)
  put(x + 5, y + 6, C.copper)
end

local function boundaryPatch(x, y)
  boundaryStraight(x, y)
  outlinedRect(x + 15, y + 1, 11, 10, C.cream, C.ink)
  rect(x + 17, y + 3, 7, 5, C.plate)
  put(x + 16, y + 2, C.copper); put(x + 25, y + 9, C.copper)
end

local function boundaryGate(x, y)
  rect(x, y, 32, 32, C.clear)
  outlinedRect(x + 1, y + 2, 6, 29, C.plate, C.ink)
  outlinedRect(x + 25, y + 2, 6, 29, C.plate, C.ink)
  rect(x + 1, y + 2, 30, 5, C.cream)
  rect(x + 9, y + 5, 14, 3, C.steel)
  rect(x + 10, y + 10, 12, 2, C.copper)
  line(x + 10, y + 13, x + 22, y + 13, C.ink)
  put(x + 4, y + 10, C.orange); put(x + 27, y + 10, C.orange)
end

local function propCoilRack(x, y)
  rect(x, y, 32, 32, C.clear)
  outlinedRect(x + 4, y + 18, 24, 8, C.steel, C.ink)
  rect(x + 6, y + 26, 3, 4, C.ink); rect(x + 23, y + 26, 3, 4, C.ink)
  outlinedEllipse(x + 11, y + 14, 6, 6, C.copper, C.ink)
  outlinedEllipse(x + 22, y + 14, 6, 6, C.copper, C.ink)
  fillEllipse(x + 11, y + 14, 2, 3, C.ink); fillEllipse(x + 22, y + 14, 2, 3, C.ink)
  line(x + 5, y + 20, x + 27, y + 20, C.cream)
end

local function propIngotPallet(x, y)
  rect(x, y, 32, 32, C.clear)
  rect(x + 4, y + 23, 24, 4, C.steel)
  line(x + 5, y + 27, x + 26, y + 27, C.ink)
  outlinedRect(x + 5, y + 16, 10, 6, C.cream, C.ink)
  outlinedRect(x + 16, y + 16, 11, 6, C.cream, C.ink)
  outlinedRect(x + 9, y + 10, 11, 6, C.steelHi, C.ink)
  rect(x + 7, y + 18, 6, 2, C.copper); rect(x + 18, y + 18, 6, 2, C.copper)
end

local function propQuenchDrum(x, y)
  rect(x, y, 32, 32, C.clear)
  outlinedEllipse(x + 15, y + 20, 11, 7, C.steel, C.ink)
  rect(x + 5, y + 14, 20, 7, C.steel)
  outlinedEllipse(x + 15, y + 14, 10, 4, C.liquid, C.ink)
  line(x + 7, y + 23, x + 23, y + 23, C.cream)
  line(x + 24, y + 12, x + 29, y + 7, C.copper)
  line(x + 29, y + 7, x + 27, y + 4, C.copper)
  put(x + 27, y + 4, C.steelHi)
end

local function propToolCart(x, y)
  rect(x, y, 32, 32, C.clear)
  outlinedRect(x + 4, y + 14, 23, 8, C.steel, C.ink)
  rect(x + 6, y + 16, 19, 3, C.cream)
  line(x + 9, y + 13, x + 9, y + 7, C.copper)
  line(x + 15, y + 13, x + 17, y + 6, C.steelHi)
  line(x + 21, y + 13, x + 24, y + 8, C.copper)
  outlinedEllipse(x + 9, y + 25, 3, 3, C.ink, C.ink)
  outlinedEllipse(x + 23, y + 25, 3, 3, C.ink, C.ink)
  line(x + 26, y + 15, x + 30, y + 12, C.steelHi)
end

local function propSlagPile(x, y)
  rect(x, y, 32, 32, C.clear)
  outlinedEllipse(x + 16, y + 21, 13, 7, C.ink, C.ink)
  fillEllipse(x + 9, y + 19, 5, 4, C.charcoal)
  fillEllipse(x + 17, y + 16, 6, 5, C.plate)
  fillEllipse(x + 24, y + 20, 5, 4, C.charcoal)
  put(x + 12, y + 17, C.steel); put(x + 20, y + 20, C.steel)
end

local function propHeatBeacon(x, y)
  rect(x, y, 32, 32, C.clear)
  outlinedRect(x + 13, y + 10, 7, 18, C.steel, C.ink)
  rect(x + 15, y + 28, 4, 2, C.ink)
  outlinedRect(x + 9, y + 4, 15, 9, C.plate, C.ink)
  rect(x + 12, y + 6, 9, 5, C.orange)
  rect(x + 14, y + 7, 5, 3, C.hot)
  line(x + 11, y + 5, x + 22, y + 5, C.cream)
  line(x + 16, y + 14, x + 16, y + 24, C.copper)
end

local function landmarkFurnace(x, y)
  rect(x, y, 64, 64, C.clear)
  outlinedRect(x + 7, y + 27, 49, 27, C.plate, C.ink)
  rect(x + 11, y + 31, 41, 20, C.cream)
  outlinedRect(x + 18, y + 35, 25, 17, C.ink, C.ink)
  rect(x + 21, y + 39, 19, 9, C.copper)
  rect(x + 25, y + 41, 11, 5, C.orange)
  -- asymmetric hood and exhaust, unlike the tall articulated boss.
  outlinedRect(x + 15, y + 16, 31, 12, C.plate, C.ink)
  rect(x + 19, y + 19, 24, 5, C.steel)
  outlinedRect(x + 42, y + 9, 12, 19, C.steel, C.ink)
  rect(x + 46, y + 4, 5, 8, C.ink)
  line(x + 51, y + 44, x + 60, y + 36, C.copper)
  outlinedEllipse(x + 59, y + 35, 4, 4, C.copper, C.ink)
  put(x + 12, y + 57, C.copper); put(x + 49, y + 57, C.copper)
end

local function landmarkCoolingManifold(x, y)
  rect(x, y, 64, 64, C.clear)
  outlinedRect(x + 7, y + 37, 51, 16, C.plate, C.ink)
  for xx = x + 13, x + 52, 5 do line(xx, y + 40, xx, y + 50, C.ink) end
  outlinedEllipse(x + 20, y + 27, 12, 16, C.steel, C.ink)
  outlinedEllipse(x + 45, y + 27, 12, 16, C.steel, C.ink)
  fillEllipse(x + 20, y + 27, 6, 10, C.ink); fillEllipse(x + 45, y + 27, 6, 10, C.ink)
  line(x + 12, y + 15, x + 26, y + 8, C.copper)
  line(x + 26, y + 8, x + 41, y + 13, C.copper)
  line(x + 41, y + 13, x + 53, y + 7, C.copper)
  outlinedRect(x + 51, y + 5, 8, 8, C.teal, C.ink)
  put(x + 54, y + 8, C.cream)
end

local function hazardHeatGrate(x, y)
  rect(x, y, 32, 32, C.ink)
  rect(x + 1, y + 1, 30, 30, C.cream)
  rect(x + 4, y + 4, 24, 24, C.copper)
  rect(x + 6, y + 6, 20, 20, C.hot)
  for xx = x + 7, x + 24, 4 do rect(xx, y + 6, 2, 20, C.ink) end
  for yy = y + 8, y + 24, 5 do rect(x + 6, yy, 20, 2, C.ink) end
  line(x + 3, y + 3, x + 28, y + 3, C.steelHi)
end

-- Four 64x64 atlas cells per row. 32 px frames are centered in their cell;
-- the two landmarks retain their full native 64 px bounds.
floorBase(16, 16)
floorGratePatch(80, 16)
floorHeatScar(144, 16)
boundaryStraight(208, 16)
boundaryCorner(16, 80)
boundaryPatch(80, 80)
boundaryGate(144, 80)
propCoilRack(208, 80)
propIngotPallet(16, 144)
propQuenchDrum(80, 144)
propToolCart(144, 144)
propSlagPile(208, 144)
propHeatBeacon(16, 208)
landmarkFurnace(64, 192)
landmarkCoolingManifold(192, 192)
hazardHeatGrate(144, 208)

spr:saveAs("assets-src/world/forge/source/forge-world-atlas.pxo")
