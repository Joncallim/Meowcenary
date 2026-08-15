local U = dofile("docs/art/scripts/lib/sprite-utils.lua")
local spec = assert(EPIC16_PICKUP_ART, "EPIC16_PICKUP_ART must be set by the asset builder")
local spr = U.makePropSprite(20, 20)
while #spr.frames < 4 do spr:newEmptyFrame() end
spr:newTag(1, 4).name = "idle"

local C = {
  outline = U.OUTLINE,
  steel = U.hex("#94a3b8"), dark = U.hex("#334155"),
  rust = U.hex("#c56a3a"), gold = U.hex("#fbbf24"),
  cyan = U.hex("#67e8f9"), pink = U.hex("#f472b6"), cream = U.hex("#fff3c4"),
}

local function drawScrap(img, frame)
  U.outlinedCircle(img, 7, 11, 4, C.steel)
  U.fillCircle(img, 7, 11, 1, C.dark)
  U.outlinedRect(img, 10, 7, 6, 7, C.rust)
  U.put(img, 13, frame % 2 == 0 and 8 or 9, C.cream)
end

local function drawChest(img, frame)
  U.outlinedRect(img, 3, 7, 14, 10, C.rust)
  U.outlinedRect(img, 4, 4, 12, 5, C.dark)
  U.fillRect(img, 9, 9, 3, 4, C.gold)
  if frame == 3 then U.put(img, 10, 3, C.pink) end
end

local function drawWeapon(img, frame)
  U.outlinedRect(img, 3, 5, 14, 12, C.dark)
  U.fillRect(img, 5, 7, 10, 8, C.steel)
  U.outlinedLine(img, 6, 11, 13, 8, C.gold, nil, 2)
  U.put(img, 14, frame % 2 == 0 and 7 or 8, C.cyan)
end

for frame = 1, 4 do
  local image = U.getCel(spr, "body", frame).image
  U.clear(image)
  if spec.kind == "scrap" then drawScrap(image, frame)
  elseif spec.kind == "chest" then drawChest(image, frame)
  else drawWeapon(image, frame) end
end
spr:saveAs(spec.savedAs)
EPIC16_PICKUP_ART = nil
