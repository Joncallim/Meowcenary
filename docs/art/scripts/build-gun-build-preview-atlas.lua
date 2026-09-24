-- Co-registered assembled-weapon preview atlas. Every 96x48 cell uses the
-- same receiver datum (38, 22), bore line (y=19), and grip datum (40, 27).
-- Base families and transparent Part overlays can therefore be composed by
-- data without family-specific artwork branches.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  clear = U.TRANSPARENT,
  ink = U.OUTLINE,
  steel = U.hex("#334155"),
  steelHi = U.hex("#64748b"),
  cream = U.hex("#f7f1d5"),
  enamel = U.hex("#d8d4bd"),
  teal = U.hex("#2dd4bf"),
  cyan = U.hex("#67e8f9"),
  copper = U.hex("#c9864a"),
  ember = U.hex("#f97316"),
  hot = U.hex("#fbbf24"),
}

local W, H, COUNT = 96, 48, 13
local spr = U.makePropSprite(W * COUNT, H)
local image = U.getCel(spr, "body", 1).image
U.clear(image)

local function ox(cell, x) return cell * W + x end
local function rect(cell, x, y, w, h, fill) U.outlinedRect(image, ox(cell, x), y, w, h, fill, C.ink) end
local function fill(cell, x, y, w, h, color) U.fillRect(image, ox(cell, x), y, w, h, color) end
local function line(cell, x1, y1, x2, y2, color, thickness) U.outlinedLine(image, ox(cell, x1), y1, ox(cell, x2), y2, color, C.ink, thickness or 2) end
local function circle(cell, x, y, r, fillColor) U.outlinedCircle(image, ox(cell, x), y, r, fillColor, C.ink) end
local function pixel(cell, x, y, color) U.put(image, ox(cell, x), y, color) end

local function receiverDatum(cell, width, height)
  rect(cell, 30, 15, width, height, C.steel)
  fill(cell, 33, 17, width - 6, 2, C.steelHi)
  rect(cell, 38, 25, 8, 5, C.enamel)
  pixel(cell, 34, 23, C.copper)
end

-- The three bases deliberately share their central datum but have materially
-- different silhouettes at 1x: compact pistol, long SMG, broad shotgun.
local function pistol(cell)
  receiverDatum(cell, 25, 11)
  rect(cell, 53, 17, 20, 6, C.steelHi)
  rect(cell, 71, 18, 6, 4, C.ink)
  line(cell, 42, 29, 38, 42, C.enamel, 5)
  line(cell, 38, 42, 45, 42, C.steel, 3)
  rect(cell, 28, 18, 4, 6, C.teal)
  rect(cell, 44, 12, 8, 3, C.cream)
end

local function smg(cell)
  receiverDatum(cell, 29, 12)
  rect(cell, 57, 17, 25, 6, C.steelHi)
  rect(cell, 80, 18, 7, 4, C.ink)
  line(cell, 42, 29, 40, 42, C.enamel, 5)
  rect(cell, 48, 27, 8, 15, C.steel)
  line(cell, 30, 19, 16, 27, C.steelHi, 3)
  line(cell, 16, 27, 10, 34, C.enamel, 4)
  rect(cell, 54, 12, 9, 3, C.teal)
end

local function shotgun(cell)
  receiverDatum(cell, 32, 14)
  rect(cell, 60, 15, 26, 9, C.steelHi)
  rect(cell, 82, 16, 8, 7, C.ink)
  line(cell, 43, 31, 40, 43, C.enamel, 6)
  line(cell, 30, 19, 11, 30, C.copper, 5)
  line(cell, 11, 30, 7, 38, C.enamel, 6)
  rect(cell, 63, 26, 18, 6, C.copper)
  for x = 66, 77, 4 do fill(cell, x, 27, 2, 4, C.ink) end
end

pistol(0); smg(1); shotgun(2)

-- Transparent overlays. Their colored forms sit on the shared receiver/grip
-- datum and never paint a background, allowing arbitrary valid combinations.
local function receiverCompact(cell)
  rect(cell, 31, 15, 23, 11, C.teal); fill(cell, 34, 17, 16, 2, C.cyan)
  rect(cell, 38, 25, 8, 4, C.copper)
end
local function receiverHeavy(cell)
  rect(cell, 27, 13, 34, 15, C.enamel); rect(cell, 30, 16, 9, 8, C.steel)
  rect(cell, 48, 16, 10, 8, C.steel); pixel(cell, 33, 23, C.copper); pixel(cell, 54, 23, C.copper)
end
local function barrelStandard(cell)
  rect(cell, 57, 17, 24, 6, C.teal); rect(cell, 78, 18, 8, 4, C.ink)
end
local function barrelLong(cell)
  rect(cell, 57, 17, 32, 5, C.enamel); rect(cell, 86, 16, 6, 7, C.ink)
  fill(cell, 64, 18, 15, 1, C.copper)
end
local function optic(cell)
  rect(cell, 42, 8, 14, 8, C.steel); rect(cell, 45, 9, 8, 6, C.teal)
  pixel(cell, 51, 11, C.hot); rect(cell, 40, 15, 18, 3, C.ink)
end
local function stock(cell)
  line(cell, 30, 19, 15, 27, C.steelHi, 4); line(cell, 15, 27, 10, 38, C.enamel, 6)
  rect(cell, 8, 31, 7, 10, C.teal); pixel(cell, 12, 34, C.copper)
end
local function trigger(cell)
  rect(cell, 38, 25, 15, 4, C.enamel); line(cell, 42, 29, 42, 36, C.copper, 2)
  line(cell, 42, 36, 49, 36, C.steel, 2)
end
local function magazine(cell)
  rect(cell, 47, 25, 10, 4, C.ink); line(cell, 51, 29, 54, 42, C.steel, 6)
  rect(cell, 49, 38, 10, 5, C.teal); pixel(cell, 56, 40, C.copper)
end
local function grenade(cell)
  rect(cell, 56, 25, 25, 5, C.enamel); circle(cell, 62, 34, 6, C.steel)
  circle(cell, 62, 34, 2, C.ink); rect(cell, 67, 29, 14, 10, C.teal)
end
local function piercing(cell)
  rect(cell, 57, 16, 28, 7, C.steel); line(cell, 82, 19, 92, 19, C.cream, 2)
  line(cell, 87, 15, 92, 19, C.cream, 1); line(cell, 87, 23, 92, 19, C.cream, 1)
  fill(cell, 64, 18, 13, 2, C.copper)
end

receiverCompact(3); receiverHeavy(4); barrelStandard(5); barrelLong(6); optic(7)
stock(8); trigger(9); magazine(10); grenade(11); piercing(12)

spr:saveAs("assets-src/gunsmith/previews/source/gun-build-preview-atlas.pxo")
