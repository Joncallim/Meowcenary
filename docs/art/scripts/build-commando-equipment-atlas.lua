-- Dedicated Commando Equipment set atlas.  Five 32px cells share one
-- resource, but their stable logical identities live in visual-art.json.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local C = {
  outline = U.OUTLINE,
  steel = U.hex("#334155"),
  darkSteel = U.hex("#1e293b"),
  enamel = U.hex("#d8d4bd"),
  cream = U.hex("#f7f1d5"),
  teal = U.hex("#2dd4bf"),
  copper = U.hex("#c9864a"),
}
local spr = U.makePropSprite(160, 32)
local image = U.getCel(spr, "body", 1).image
U.clear(image)

local function r(x, y, w, h, fill)
  U.outlinedRect(image, x, y, w, h, fill, C.outline)
end
local function p(x, y, color) U.put(image, x, y, color) end

-- `equipment-set-emblem:commando`: disciplined three-plate handling badge.
local function emblem(x)
  r(x + 5, 13, 6, 11, C.steel)
  r(x + 13, 8, 6, 16, C.enamel)
  r(x + 21, 13, 6, 11, C.steel)
  U.fillRect(image, x + 15, 10, 2, 12, C.teal)
  U.fillRect(image, x + 7, 16, 2, 2, C.copper)
  U.fillRect(image, x + 23, 16, 2, 2, C.copper)
end

-- Low squared cap, short brow and offset radio/tab; no tactical insignia.
local function helmet(x)
  r(x + 7, 10, 18, 10, C.steel)
  r(x + 9, 7, 14, 4, C.enamel)
  r(x + 5, 18, 21, 4, C.darkSteel)
  r(x + 23, 11, 4, 8, C.copper)
  U.fillRect(image, x + 10, 15, 10, 2, C.teal)
  p(x + 25, 10, C.cream)
end

-- Tidy, even-riveted three-panel vest with a central handling stripe.
local function armour(x)
  r(x + 6, 8, 20, 17, C.steel)
  r(x + 8, 10, 5, 12, C.enamel)
  r(x + 19, 10, 5, 12, C.enamel)
  r(x + 14, 9, 4, 15, C.darkSteel)
  U.fillRect(image, x + 15, 11, 2, 10, C.teal)
  p(x + 9, 12, C.copper); p(x + 9, 20, C.copper)
  p(x + 22, 12, C.copper); p(x + 22, 20, C.copper)
end

-- Close work gloves: compact paired fists and unmistakable knuckle plates.
local function gloves(x)
  r(x + 5, 15, 9, 9, C.steel)
  r(x + 18, 15, 9, 9, C.steel)
  r(x + 7, 12, 5, 5, C.enamel)
  r(x + 20, 12, 5, 5, C.enamel)
  U.fillRect(image, x + 7, 19, 5, 2, C.teal)
  U.fillRect(image, x + 20, 19, 5, 2, C.teal)
  p(x + 8, 14, C.copper); p(x + 11, 14, C.copper)
  p(x + 21, 14, C.copper); p(x + 24, 14, C.copper)
end

-- Squared ankle boots with reinforced toe caps and straight straps.
local function boots(x)
  r(x + 6, 10, 8, 14, C.steel)
  r(x + 18, 10, 8, 14, C.steel)
  r(x + 4, 21, 11, 5, C.darkSteel)
  r(x + 17, 21, 11, 5, C.darkSteel)
  U.fillRect(image, x + 7, 15, 6, 2, C.teal)
  U.fillRect(image, x + 19, 15, 6, 2, C.teal)
  U.fillRect(image, x + 5, 23, 3, 2, C.enamel)
  U.fillRect(image, x + 18, 23, 3, 2, C.enamel)
end

emblem(0); helmet(32); armour(64); gloves(96); boots(128)
spr:saveAs("assets-src/equipment/commando/source/commando-equipment-atlas.pxo")
