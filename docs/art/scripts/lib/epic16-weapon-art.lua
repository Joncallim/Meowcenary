local U = dofile("docs/art/scripts/lib/sprite-utils.lua")
local spec = assert(EPIC16_WEAPON_ART, "EPIC16_WEAPON_ART must be set by the asset builder")

local palettes = {
  pistol = { base = U.hex("#c9864a"), light = U.hex("#ffd166"), accent = U.hex("#67e8f9") },
  smg = { base = U.hex("#6b8f71"), light = U.hex("#b7e4c7"), accent = U.hex("#f472b6") },
  shotgun = { base = U.hex("#78849b"), light = U.hex("#d8dee9"), accent = U.hex("#fb923c") },
}
local C = assert(palettes[spec.family], "unknown weapon family")
local spr = U.makePropSprite(spec.width, spec.height)
while #spr.frames < spec.frames do spr:newEmptyFrame() end
if spec.frames > 1 then spr:newTag(1, spec.frames).name = "fly" end

local function drawWeapon(img, held)
  local tier = spec.tier
  local cy = math.floor(spec.height / 2)
  local x = held and 3 or 4
  local barrel = spec.family == "shotgun" and 20 or (spec.family == "smg" and 16 or 13)
  local bodyHeight = spec.family == "smg" and 7 or 6
  U.outlinedRect(img, x, cy - 4, barrel, bodyHeight, C.base)
  U.fillRect(img, x + barrel - 2, cy - 3, spec.family == "shotgun" and 8 or 5, 2, C.light)
  if spec.family == "pistol" then
    U.outlinedRect(img, x + 4, cy + 2, 4, 7, C.base)
  elseif spec.family == "smg" then
    U.outlinedRect(img, x + 6, cy + 2, 4, 6, C.base)
    U.outlinedRect(img, x + 11, cy + 1, 3, 7, C.light)
  else
    U.outlinedLine(img, x + 2, cy + 2, x - 3, cy + 7, C.base, nil, 2)
  end
  for mark = 1, tier do
    U.fillRect(img, x + 2 + (mark - 1) * 4, cy - 2, 2, 2, C.accent)
  end
  if held then U.fillRect(img, 0, cy - 1, 4, 3, C.light) end
end

local function drawProjectile(img, frame)
  local cy = math.floor(spec.height / 2)
  if spec.family == "pistol" then
    U.outlinedEllipse(img, 8, cy, 4, 3, C.base)
  elseif spec.family == "smg" then
    U.outlinedRect(img, 5, cy - 2, 7, 4, C.base)
    U.put(img, frame == 1 and 3 or 2, cy, C.accent)
  else
    U.outlinedCircle(img, 8, cy, 3, C.base)
    U.put(img, 11, cy - 2, C.accent)
    U.put(img, 11, cy + 2, C.accent)
  end
  U.put(img, 9, cy - 1, C.light)
  U.put(img, frame == 1 and 4 or 3, cy, C.accent)
end

for frame = 1, spec.frames do
  local image = U.getCel(spr, "body", frame).image
  U.clear(image)
  if spec.kind == "projectile" then drawProjectile(image, frame)
  else drawWeapon(image, spec.kind == "held") end
end

spr:saveAs(spec.savedAs)
EPIC16_WEAPON_ART = nil
