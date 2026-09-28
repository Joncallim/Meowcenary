-- Dedicated V4 Achievement badges. One physical atlas carries stable named
-- logical frames; the Career and terminal renderers remain content-agnostic.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  ink = U.OUTLINE,
  charcoal = U.hex("#1b2530"),
  steel = U.hex("#475569"),
  steelHi = U.hex("#94a3b8"),
  cream = U.hex("#f4edd0"),
  cyan = U.hex("#67e8f9"),
  teal = U.hex("#2dd4bf"),
  copper = U.hex("#c9864a"),
  orange = U.hex("#f97316"),
  hot = U.hex("#fbbf24"),
}

local SIZE, COUNT = 32, 11
local spr = U.makePropSprite(SIZE * COUNT, SIZE)
local image = U.getCel(spr, "body", 1).image
U.clear(image)

local function ox(cell, x) return cell * SIZE + x end
local function fill(cell, x, y, w, h, color) U.fillRect(image, ox(cell, x), y, w, h, color) end
local function rect(cell, x, y, w, h, color) U.outlinedRect(image, ox(cell, x), y, w, h, color, C.ink) end
local function circle(cell, x, y, radius, color) U.outlinedCircle(image, ox(cell, x), y, radius, color, C.ink) end
local function ellipse(cell, x, y, rx, ry, color) U.outlinedEllipse(image, ox(cell, x), y, rx, ry, color, C.ink) end
local function line(cell, x1, y1, x2, y2, color, thickness)
  U.outlinedLine(image, ox(cell, x1), y1, ox(cell, x2), y2, color, C.ink, thickness or 2)
end
local function pixel(cell, x, y, color) U.put(image, ox(cell, x), y, color) end

local function patch(cell, accent, brokenRight)
  -- A shared workshop-patch vocabulary without an opaque card background.
  line(cell, 4, 6, 4, 25, C.steel, 2); line(cell, 4, 6, 10, 3, C.steelHi, 2)
  line(cell, 10, 3, 23, 3, C.steel, 2); line(cell, 4, 25, 10, 28, C.steel, 2)
  line(cell, 10, 28, 23, 28, C.steelHi, 2)
  line(cell, 23, 3, 28, 8, accent, 2)
  if brokenRight then
    line(cell, 28, 8, 27, 13, C.steel, 2); line(cell, 28, 19, 28, 24, C.steel, 2)
  else
    line(cell, 28, 8, 28, 24, C.steel, 2)
  end
  line(cell, 28, 24, 23, 28, C.steel, 2)
  pixel(cell, 7, 7, C.cream); pixel(cell, 25, 25, C.cream)
end

-- Hidden fallback: sealed riveted locker and crossed latch. No active badge is
-- leaked before reveal.
patch(0, C.cyan, false)
rect(0, 9, 11, 14, 12, C.charcoal); line(0, 10, 12, 22, 22, C.steelHi, 2)
line(0, 22, 12, 10, 22, C.steelHi, 2); rect(0, 14, 8, 5, 5, C.cyan)

-- First Blood: a single hostile eye/target plate with one decisive impact.
patch(1, C.orange, false)
ellipse(1, 15, 16, 8, 5, C.steelHi); circle(1, 15, 16, 2, C.orange)
line(1, 22, 8, 18, 13, C.hot, 2); line(1, 23, 8, 26, 7, C.hot, 1)

-- Scrap Squad: three compact hostile plates, deliberately no numeric glyph.
patch(2, C.orange, false)
for _, point in ipairs({{16,10},{11,19},{21,19}}) do
  ellipse(2, point[1], point[2], 4, 3, C.steelHi); pixel(2, point[1], point[2], C.orange)
end

-- Junkyard Veteran: worn yard crest, stacked defeat notches and repair plate.
patch(3, C.orange, false)
line(3, 9, 9, 16, 7, C.steelHi, 3); line(3, 16, 7, 24, 10, C.steelHi, 3)
line(3, 9, 9, 11, 22, C.steel, 3); line(3, 24, 10, 21, 23, C.steel, 3)
line(3, 11, 22, 16, 26, C.copper, 3); line(3, 16, 26, 21, 23, C.copper, 3)
for x = 13, 21, 4 do line(3, x, 12, x - 2, 16, C.orange, 1) end
rect(3, 16, 17, 6, 5, C.cream)

-- Forge Initiate: two matching modules converge into one upgraded core.
patch(4, C.cyan, false)
rect(4, 6, 13, 8, 6, C.steelHi); rect(4, 20, 13, 7, 6, C.steelHi)
line(4, 13, 16, 17, 16, C.cyan, 2); line(4, 21, 16, 17, 16, C.cyan, 2)
circle(4, 17, 16, 3, C.cream); line(4, 17, 11, 17, 7, C.teal, 1)

-- Crusher Down: a compacting jaw/ram plate broken across the centre.
patch(5, C.orange, true)
rect(5, 9, 7, 14, 6, C.steelHi); rect(5, 7, 21, 18, 5, C.steel)
for x = 9, 21, 4 do line(5, x, 13, x + 2, 18, C.cream, 2) end
line(5, 17, 7, 14, 15, C.orange, 2); line(5, 14, 15, 19, 20, C.hot, 2)
line(5, 19, 20, 16, 26, C.orange, 2)

-- Junkyard Champion: open salvage gate and route-completion notch.
patch(6, C.cyan, false)
rect(6, 7, 9, 5, 15, C.steel); rect(6, 21, 9, 5, 15, C.steel)
line(6, 7, 9, 26, 9, C.steelHi, 3); line(6, 12, 21, 16, 25, C.cyan, 2)
line(6, 16, 25, 23, 16, C.cyan, 2); line(6, 16, 12, 16, 21, C.cream, 2)

-- First Victory: contract plate, bold completion notch and restrained spark.
patch(7, C.cyan, false)
rect(7, 8, 9, 14, 15, C.charcoal); line(7, 11, 17, 15, 21, C.teal, 3)
line(7, 15, 21, 22, 12, C.cyan, 3); line(7, 23, 7, 23, 11, C.hot, 1)
line(7, 21, 9, 25, 9, C.hot, 1)

-- Tabby Mastery: notched feline ears inside a workshop mastery crest.
patch(8, C.cyan, false)
line(8, 8, 13, 11, 7, C.steelHi, 3); line(8, 11, 7, 16, 11, C.steelHi, 3)
line(8, 16, 11, 22, 7, C.steelHi, 3); line(8, 22, 7, 25, 14, C.steelHi, 3)
ellipse(8, 16, 18, 9, 8, C.steel); pixel(8, 13, 17, C.cyan); pixel(8, 20, 17, C.cyan)
line(8, 15, 21, 17, 21, C.cream, 1)

-- Scrap Tycoon: a riveted storage bin filled with broad salvage pieces.
patch(9, C.orange, false)
rect(9, 7, 16, 19, 10, C.steel); rect(9, 9, 10, 6, 6, C.copper)
rect(9, 15, 8, 6, 8, C.steelHi); rect(9, 20, 12, 5, 5, C.orange)
pixel(9, 10, 20, C.cream); pixel(9, 23, 20, C.cream)

-- Warden Down: tall split furnace face, falling tool arm and diagonal core
-- fracture. Its vertical silhouette is intentionally unlike Crusher's jaw.
patch(10, C.orange, true)
line(10, 10, 7, 15, 5, C.steelHi, 3); line(10, 15, 5, 22, 8, C.steelHi, 3)
line(10, 10, 7, 11, 24, C.steel, 3); line(10, 22, 8, 21, 25, C.steel, 3)
rect(10, 14, 10, 6, 14, C.charcoal); line(10, 18, 9, 15, 15, C.cream, 2)
line(10, 15, 15, 19, 19, C.hot, 2); line(10, 19, 19, 16, 25, C.orange, 2)
line(10, 23, 16, 27, 20, C.copper, 2); line(10, 27, 20, 25, 26, C.copper, 2)

spr:saveAs("assets-src/achievements/source/achievement-icons-atlas.pxo")
