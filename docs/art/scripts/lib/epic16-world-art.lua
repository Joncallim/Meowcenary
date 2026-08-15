local U = dofile("docs/art/scripts/lib/sprite-utils.lua")
local spec = assert(EPIC16_WORLD_ART, "EPIC16_WORLD_ART must be set by the asset builder")
local spr = U.makePropSprite(spec.width, spec.height)
local img = U.getCel(spr, "body", 1).image
local C = {
  asphalt = U.hex("#222b31"), asphalt2 = U.hex("#29343a"),
  steel = U.hex("#586875"), steel2 = U.hex("#7b8b94"),
  rust = U.hex("#9a4f32"), rust2 = U.hex("#c66b3d"),
  dark = U.hex("#12191d"), rubber = U.hex("#181c20"),
  oil = U.hex("#25303b"), yellow = U.hex("#eab93f"), cyan = U.hex("#3cb9c7"),
}
U.clear(img)

local function floorTile()
  U.fillRect(img, 0, 0, spec.width, spec.height, spec.variant == "base" and C.asphalt or C.asphalt2)
  for n = 0, 3 do
    local x = (n * 9 + (spec.variant == "patch-b" and 4 or 1)) % spec.width
    local y = (n * 7 + (spec.variant == "patch-a" and 11 or 5)) % spec.height
    U.put(img, x, y, C.steel)
  end
  if spec.variant ~= "base" then U.line(img, 6, 25, 13, 21, C.dark) end
end

local function boundary()
  U.fillRect(img, 0, 0, 32, 32, C.asphalt)
  if spec.variant == "gate" then
    U.outlinedRect(img, 1, 3, 7, 27, C.rust)
    U.outlinedRect(img, 24, 3, 7, 27, C.rust)
    U.line(img, 8, 6, 24, 6, C.yellow)
  else
    U.outlinedRect(img, 0, 5, 32, 22, C.steel)
    U.fillRect(img, 1, 9, 30, 3, C.rust)
    if spec.variant == "corner" then U.outlinedRect(img, 4, 4, 12, 24, C.steel2) end
    if spec.variant == "patch" then U.fillRect(img, 18, 13, 9, 8, C.rust2) end
  end
end

local function prop()
  if spec.variant == "oil-stain" then
    U.fillEllipse(img, 16, 18, 12, 7, C.oil)
    U.put(img, 11, 16, C.cyan)
  elseif spec.variant == "warning-sign" then
    U.outlinedLine(img, 16, 8, 16, 29, C.steel2, nil, 2)
    U.outlinedRect(img, 7, 4, 18, 12, C.yellow)
    U.line(img, 9, 14, 23, 6, C.rust)
  elseif spec.variant == "tyre-pile" then
    U.outlinedEllipse(img, 11, 20, 8, 5, C.rubber)
    U.outlinedEllipse(img, 20, 15, 8, 5, C.rubber)
    U.fillEllipse(img, 20, 15, 3, 2, C.asphalt)
  elseif spec.variant == "crate" then
    U.outlinedRect(img, 5, 7, 22, 21, C.rust)
    U.line(img, 7, 9, 25, 26, C.steel2)
    U.line(img, 25, 9, 7, 26, C.steel2)
  elseif spec.variant == "engine-block" then
    U.outlinedRect(img, 4, 10, 24, 16, C.steel)
    U.outlinedCircle(img, 10, 16, 3, C.dark)
    U.outlinedCircle(img, 22, 16, 3, C.dark)
  else
    U.outlinedRect(img, 6, 14, 20, 12, C.rust2)
    U.line(img, 4, 13, 27, 8, C.steel2)
    U.outlinedCircle(img, 21, 23, 4, C.rubber)
  end
end

local function landmark()
  if spec.variant == "hanging-press" then
    U.outlinedRect(img, 8, 7, 48, 48, C.steel)
    U.outlinedRect(img, 17, 17, 30, 9, C.rust)
    U.outlinedRect(img, 25, 26, 14, 22, C.steel2)
    U.fillRect(img, 29, 31, 6, 10, C.yellow)
  else
    U.outlinedCircle(img, 20, 39, 13, C.rust)
    U.outlinedCircle(img, 43, 39, 13, C.rust2)
    U.outlinedRect(img, 20, 9, 24, 24, C.steel)
    U.fillRect(img, 29, 15, 6, 12, C.cyan)
  end
end

if spec.role == "floor" then floorTile()
elseif spec.role == "boundary" then boundary()
elseif spec.role == "prop" then prop()
else landmark() end

spr:saveAs(spec.savedAs)
EPIC16_WORLD_ART = nil
