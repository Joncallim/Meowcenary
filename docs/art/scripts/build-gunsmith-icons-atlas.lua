-- Dedicated Gunsmith presentation atlas: 12 physical Parts, eight neutral
-- slot glyphs and three reusable behavior-trait emblems.  Stable logical
-- frame identities are declared in visual-art.json; this builder owns pixels.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  outline = U.OUTLINE,
  steel = U.hex("#334155"),
  dark = U.hex("#1e293b"),
  cream = U.hex("#f7f1d5"),
  enamel = U.hex("#d8d4bd"),
  teal = U.hex("#2dd4bf"),
  cyan = U.hex("#67e8f9"),
  copper = U.hex("#c9864a"),
  ember = U.hex("#f97316"),
  hot = U.hex("#fbbf24"),
}

local CELL = 32
local spr = U.makePropSprite(CELL * 23, CELL)
local image = U.getCel(spr, "body", 1).image
U.clear(image)
local function x(cell, offset) return cell * CELL + offset end
local function rect(cell, px, py, w, h, fill) U.outlinedRect(image, x(cell, px), py, w, h, fill, C.outline) end
local function circle(cell, px, py, radius, fill) U.outlinedCircle(image, x(cell, px), py, radius, fill, C.outline) end
local function line(cell, x1, y1, x2, y2, fill, thickness) U.outlinedLine(image, x(cell, x1), y1, x(cell, x2), y2, fill, C.outline, thickness) end
local function put(cell, px, py, fill) U.put(image, x(cell, px), py, fill) end

-- Physical Parts: cream enamel and copper fasteners make these read as owned,
-- dimensional workshop objects rather than empty cyan schematic slots.
local function receiverCompact(c)
  rect(c, 6, 10, 20, 13, C.steel); rect(c, 10, 7, 10, 4, C.dark)
  rect(c, 19, 13, 5, 7, C.enamel); put(c, 8, 13, C.copper); rect(c, 7, 18, 4, 3, C.teal)
end
local function receiverHeavy(c)
  rect(c, 4, 8, 24, 17, C.steel); rect(c, 7, 5, 17, 5, C.dark)
  rect(c, 6, 11, 8, 11, C.enamel); rect(c, 18, 10, 7, 13, C.enamel)
  put(c, 8, 13, C.copper); put(c, 22, 13, C.copper); rect(c, 14, 17, 4, 5, C.teal)
end
local function barrelStandard(c)
  rect(c, 5, 12, 22, 9, C.steel); rect(c, 3, 11, 5, 11, C.enamel)
  rect(c, 22, 10, 5, 13, C.dark); U.fillRect(image, x(c, 23), 13, 3, 5, C.teal)
end
local function barrelLong(c)
  rect(c, 3, 13, 26, 7, C.steel); rect(c, 3, 11, 5, 11, C.dark)
  rect(c, 20, 10, 5, 13, C.enamel); rect(c, 26, 12, 3, 9, C.dark); put(c, 22, 15, C.copper)
end
local function optic(c)
  rect(c, 6, 20, 22, 5, C.dark); rect(c, 10, 8, 13, 13, C.steel)
  rect(c, 12, 10, 9, 9, C.enamel); rect(c, 14, 11, 5, 7, C.teal); put(c, 16, 14, C.hot)
end
local function stock(c)
  rect(c, 5, 10, 20, 8, C.enamel); rect(c, 20, 16, 6, 9, C.dark)
  line(c, 8, 18, 18, 24, C.steel, 2); line(c, 18, 24, 23, 20, C.steel, 2)
  rect(c, 3, 9, 5, 11, C.steel); rect(c, 10, 12, 5, 3, C.teal); put(c, 22, 12, C.copper)
end
local function trigger(c)
  rect(c, 5, 8, 22, 8, C.enamel); rect(c, 8, 15, 15, 4, C.steel)
  line(c, 11, 18, 11, 25, C.steel, 2); line(c, 11, 25, 20, 25, C.steel, 2)
  line(c, 17, 18, 14, 23, C.copper, 1); circle(c, 20, 13, 2, C.teal)
end
local function magazine(c)
  rect(c, 9, 5, 14, 6, C.dark); line(c, 10, 10, 13, 27, C.steel, 5)
  line(c, 13, 27, 21, 25, C.steel, 5); rect(c, 11, 20, 9, 3, C.teal)
  rect(c, 10, 25, 12, 3, C.enamel); put(c, 12, 27, C.copper)
end
local function grenade(c)
  rect(c, 5, 8, 22, 7, C.enamel); rect(c, 9, 14, 18, 10, C.steel)
  circle(c, 10, 19, 5, C.dark); circle(c, 10, 19, 2, C.outline)
  U.fillRect(image, x(c, 16), 17, 8, 2, C.copper); rect(c, 22, 15, 5, 8, C.teal)
end
local function piercingBarrel(c)
  rect(c, 5, 11, 20, 11, C.steel); rect(c, 20, 9, 7, 15, C.enamel)
  line(c, 4, 16, 19, 16, C.dark, 3); line(c, 23, 16, 29, 16, C.cream, 2)
  line(c, 25, 13, 30, 16, C.cream, 1); line(c, 25, 19, 30, 16, C.cream, 1)
end
local function fireCore(c, mastered)
  circle(c, 16, 16, mastered and 11 or 9, C.dark)
  if mastered then circle(c, 16, 16, 8, C.steel) end
  circle(c, 16, 16, mastered and 5 or 4, C.ember)
  line(c, 16, 19, 13, 15, C.hot, 1); line(c, 13, 15, 17, 10, C.hot, 1); line(c, 17, 10, 20, 16, C.hot, 1)
  if mastered then
    rect(c, 4, 12, 4, 8, C.teal); rect(c, 24, 12, 4, 8, C.teal)
    rect(c, 12, 3, 8, 4, C.copper); rect(c, 12, 25, 8, 4, C.copper)
  end
end

receiverCompact(0); receiverHeavy(1); barrelStandard(2); barrelLong(3)
optic(4); stock(5); trigger(6); magazine(7); grenade(8); piercingBarrel(9)
fireCore(10, false); fireCore(11, true)

-- Neutral slot glyphs: a consistent hollow cyan schematic language.
local function corners(c)
  local color = C.teal
  line(c, 4, 8, 4, 4, color, 1); line(c, 4, 4, 8, 4, color, 1)
  line(c, 24, 4, 28, 4, color, 1); line(c, 28, 4, 28, 8, color, 1)
  line(c, 4, 24, 4, 28, color, 1); line(c, 4, 28, 8, 28, color, 1)
  line(c, 24, 28, 28, 28, color, 1); line(c, 28, 24, 28, 28, color, 1)
end
local function slotReceiver(c) corners(c); line(c, 7, 13, 25, 13, C.cyan, 1); line(c, 7, 20, 25, 20, C.cyan, 1); line(c, 7, 13, 7, 20, C.cyan, 1); line(c, 25, 13, 25, 20, C.cyan, 1); line(c, 4, 16, 7, 16, C.cyan, 1); line(c, 25, 16, 28, 16, C.cyan, 1) end
local function slotBarrel(c) corners(c); line(c, 7, 14, 26, 14, C.cyan, 1); line(c, 7, 19, 26, 19, C.cyan, 1); line(c, 7, 14, 7, 19, C.cyan, 1); line(c, 26, 14, 26, 19, C.cyan, 1); line(c, 4, 12, 4, 21, C.cyan, 1); line(c, 4, 12, 7, 14, C.cyan, 1); line(c, 4, 21, 7, 19, C.cyan, 1) end
local function slotOptic(c) corners(c); line(c, 9, 20, 24, 20, C.cyan, 1); line(c, 11, 20, 13, 10, C.cyan, 1); line(c, 13, 10, 21, 10, C.cyan, 1); line(c, 21, 10, 24, 20, C.cyan, 1) end
local function slotStock(c) corners(c); line(c, 7, 11, 23, 11, C.cyan, 1); line(c, 23, 11, 23, 22, C.cyan, 1); line(c, 23, 22, 18, 22, C.cyan, 1); line(c, 18, 22, 8, 17, C.cyan, 1); line(c, 8, 17, 7, 11, C.cyan, 1) end
local function slotTrigger(c) corners(c); line(c, 7, 11, 24, 11, C.cyan, 1); line(c, 24, 11, 24, 15, C.cyan, 1); line(c, 11, 15, 21, 15, C.cyan, 1); line(c, 11, 15, 11, 24, C.cyan, 1); line(c, 11, 24, 19, 24, C.cyan, 1); line(c, 18, 16, 14, 22, C.cyan, 1) end
local function slotMagazine(c) corners(c); line(c, 11, 7, 22, 7, C.cyan, 1); line(c, 22, 7, 20, 25, C.cyan, 1); line(c, 20, 25, 9, 22, C.cyan, 1); line(c, 9, 22, 11, 7, C.cyan, 1) end
local function slotUnderbarrel(c) corners(c); line(c, 7, 11, 25, 11, C.cyan, 1); line(c, 10, 14, 24, 14, C.cyan, 1); line(c, 24, 14, 24, 21, C.cyan, 1); line(c, 24, 21, 10, 21, C.cyan, 1); line(c, 10, 21, 10, 14, C.cyan, 1); for px = 12, 22, 3 do line(c, px, 21, px, 24, C.cyan, 1) end end
local function slotTrait(c) corners(c); line(c, 10, 8, 22, 8, C.cyan, 1); line(c, 22, 8, 25, 12, C.cyan, 1); line(c, 25, 12, 25, 22, C.cyan, 1); line(c, 25, 22, 21, 25, C.cyan, 1); line(c, 21, 25, 11, 25, C.cyan, 1); line(c, 11, 25, 7, 21, C.cyan, 1); line(c, 7, 21, 7, 12, C.cyan, 1); line(c, 7, 12, 10, 8, C.cyan, 1); rect(c, 13, 13, 6, 7, C.dark) end

slotReceiver(12); slotBarrel(13); slotOptic(14); slotStock(15)
slotTrigger(16); slotMagazine(17); slotUnderbarrel(18); slotTrait(19)

-- Reusable trait emblems are flat badges, never substitutes for Part cores.
local function badge(c)
  circle(c, 16, 16, 12, C.dark)
  line(c, 9, 6, 23, 6, C.enamel, 2); line(c, 26, 9, 26, 23, C.enamel, 2)
  line(c, 23, 26, 9, 26, C.enamel, 2); line(c, 6, 23, 6, 9, C.enamel, 2)
  put(c, 8, 8, C.copper); put(c, 24, 8, C.copper); put(c, 8, 24, C.copper); put(c, 24, 24, C.copper)
end
local function traitFire(c) badge(c); line(c, 16, 22, 11, 17, C.ember, 2); line(c, 11, 17, 16, 9, C.hot, 2); line(c, 16, 9, 21, 17, C.ember, 2); line(c, 21, 17, 16, 22, C.hot, 2) end
local function traitExplosive(c) badge(c); circle(c, 16, 16, 4, C.hot); for _, point in ipairs({{16,8},{24,16},{16,24},{8,16}}) do line(c, 16, 16, point[1], point[2], C.ember, 2) end end
local function traitPiercing(c) badge(c); line(c, 15, 7, 15, 25, C.cyan, 2); line(c, 15, 7, 11, 12, C.cream, 2); line(c, 15, 7, 19, 12, C.cream, 2); line(c, 8, 16, 12, 16, C.steel, 2); line(c, 18, 16, 24, 16, C.teal, 1) end

traitFire(20); traitExplosive(21); traitPiercing(22)
spr:saveAs("assets-src/gunsmith/icons/source/gunsmith-icons-atlas.pxo")
