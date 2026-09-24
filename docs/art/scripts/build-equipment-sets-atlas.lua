-- Dedicated non-Commando Equipment art. Seven 5-icon rows share one atlas:
-- Set emblem, Helmet, Armour, Gloves, Boots. Stable meaning remains in the
-- logical frame keys rather than atlas position.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

local O = U.OUTLINE
local P = {
  scavenger = { base = U.hex("#6b7045"), dark = U.hex("#343a2c"), light = U.hex("#d8c793"), accent = U.hex("#c9864a") },
  juggernaut = { base = U.hex("#526071"), dark = U.hex("#273241"), light = U.hex("#c9d1d6"), accent = U.hex("#96704b") },
  pyro = { base = U.hex("#4b3b38"), dark = U.hex("#241f22"), light = U.hex("#e4d9bd"), accent = U.hex("#df713c") },
  recon = { base = U.hex("#40536b"), dark = U.hex("#1e293b"), light = U.hex("#cbd8dc"), accent = U.hex("#52b7b0") },
  medic = { base = U.hex("#60817d"), dark = U.hex("#293c3b"), light = U.hex("#e7dfc7"), accent = U.hex("#49c3b1") },
  technician = { base = U.hex("#465766"), dark = U.hex("#202d38"), light = U.hex("#c9d0c7"), accent = U.hex("#32c8d5") },
  demolition = { base = U.hex("#66514a"), dark = U.hex("#302a2b"), light = U.hex("#d8cdb4"), accent = U.hex("#e58a3b") },
}
local ORDER = { "scavenger", "juggernaut", "pyro", "recon", "medic", "technician", "demolition" }
local spr = U.makePropSprite(160, 224)
local image = U.getCel(spr, "body", 1).image
U.clear(image)

local function r(x, y, w, h, fill) U.outlinedRect(image, x, y, w, h, fill, O) end
local function c(x, y, radius, fill) U.outlinedCircle(image, x, y, radius, fill, O) end
local function e(x, y, rx, ry, fill) U.outlinedEllipse(image, x, y, rx, ry, fill, O) end
local function line(x1, y1, x2, y2, fill, thickness) U.outlinedLine(image, x1, y1, x2, y2, fill, O, thickness or 2) end
local function px(x, y, fill) U.put(image, x, y, fill) end
local function fill(x, y, w, h, color) U.fillRect(image, x, y, w, h, color) end

local function emblem(set, x, y, q)
  if set == "scavenger" then
    line(x + 8, y + 9, x + 8, y + 22, q.light, 2); line(x + 8, y + 22, x + 17, y + 26, q.light, 2)
    line(x + 17, y + 26, x + 25, y + 17, q.base, 2); c(x + 20, y + 10, 3, q.accent)
  elseif set == "juggernaut" then
    r(x + 7, y + 7, 18, 18, q.base); r(x + 11, y + 11, 10, 10, q.dark)
    for _, point in ipairs({{9,9},{23,9},{9,23},{23,23}}) do px(x + point[1], y + point[2], q.light) end
  elseif set == "pyro" then
    r(x + 7, y + 7, 18, 19, q.base); c(x + 16, y + 21, 4, q.accent)
    for vent = 0, 2 do fill(x + 10 + vent * 5, y + 9, 2, 8, q.light) end
  elseif set == "recon" then
    line(x + 5, y + 16, x + 27, y + 16, q.light, 1)
    line(x + 16, y + 7, x + 25, y + 16, q.base, 2); line(x + 25, y + 16, x + 16, y + 25, q.base, 2)
    line(x + 16, y + 25, x + 7, y + 16, q.base, 2); line(x + 7, y + 16, x + 16, y + 7, q.base, 2); c(x + 16, y + 16, 3, q.accent)
  elseif set == "medic" then
    c(x + 16, y + 17, 4, q.accent); line(x + 7, y + 12, x + 13, y + 17, q.light, 3)
    line(x + 25, y + 12, x + 19, y + 17, q.light, 3); line(x + 9, y + 23, x + 14, y + 19, q.base, 2); line(x + 23, y + 23, x + 18, y + 19, q.base, 2)
  elseif set == "technician" then
    c(x + 16, y + 16, 4, q.accent)
    for _, point in ipairs({{16,6},{24,10},{26,19},{20,26},{11,26},{6,20},{7,11}}) do c(x + point[1], y + point[2], 2, q.base) end
  else
    r(x + 8, y + 10, 16, 14, q.base); r(x + 11, y + 13, 10, 8, q.dark)
    line(x + 5, y + 10, x + 10, y + 15, q.accent, 2); line(x + 27, y + 10, x + 22, y + 15, q.accent, 2)
  end
end

local function helmet(set, x, y, q)
  if set == "scavenger" then
    line(x + 8, y + 12, x + 23, y + 8, q.base, 4); r(x + 7, y + 12, 18, 10, q.base); r(x + 22, y + 8, 5, 5, q.accent); line(x + 10, y + 20, x + 18, y + 24, q.light, 2)
  elseif set == "juggernaut" then
    r(x + 5, y + 7, 22, 17, q.base); r(x + 8, y + 19, 16, 6, q.dark); fill(x + 11, y + 15, 10, 2, q.light)
  elseif set == "pyro" then
    e(x + 16, y + 15, 10, 9, q.base); r(x + 7, y + 15, 18, 8, q.dark); fill(x + 10, y + 17, 9, 2, q.light); r(x + 23, y + 11, 4, 10, q.accent)
  elseif set == "recon" then
    line(x + 7, y + 14, x + 23, y + 10, q.base, 3); r(x + 11, y + 13, 14, 6, q.dark); c(x + 23, y + 14, 3, q.accent); line(x + 9, y + 19, x + 6, y + 24, q.light, 1)
  elseif set == "medic" then
    e(x + 16, y + 15, 10, 9, q.base); r(x + 7, y + 17, 18, 7, q.light); c(x + 16, y + 10, 2, q.accent); line(x + 12, y + 8, x + 16, y + 10, q.light, 2); line(x + 20, y + 8, x + 16, y + 10, q.light, 2)
  elseif set == "technician" then
    r(x + 7, y + 11, 18, 11, q.base); r(x + 9, y + 8, 15, 6, q.light); c(x + 12, y + 12, 3, q.accent); line(x + 24, y + 13, x + 28, y + 21, q.accent, 1)
  else
    e(x + 16, y + 14, 11, 9, q.base); r(x + 6, y + 8, 20, 7, q.light); r(x + 8, y + 20, 6, 5, q.dark); r(x + 18, y + 20, 6, 5, q.dark); fill(x + 10, y + 10, 12, 2, q.accent)
  end
end

local function armour(set, x, y, q)
  if set == "scavenger" then
    r(x + 7, y + 7, 18, 19, q.base); r(x + 4, y + 14, 7, 11, q.light); line(x + 9, y + 8, x + 23, y + 24, q.accent, 2); r(x + 20, y + 16, 7, 8, q.dark)
  elseif set == "juggernaut" then
    r(x + 3, y + 7, 26, 20, q.base); r(x + 7, y + 10, 18, 14, q.dark); r(x + 11, y + 12, 10, 9, q.light)
  elseif set == "pyro" then
    r(x + 6, y + 8, 20, 18, q.base); r(x + 9, y + 10, 14, 5, q.light); r(x + 11, y + 16, 10, 7, q.dark); c(x + 16, y + 19, 3, q.accent); line(x + 8, y + 11, x + 5, y + 25, q.accent, 2)
  elseif set == "recon" then
    line(x + 8, y + 8, x + 23, y + 25, q.base, 3); line(x + 24, y + 8, x + 9, y + 25, q.base, 3); r(x + 7, y + 13, 7, 7, q.light); r(x + 19, y + 13, 7, 7, q.light)
  elseif set == "medic" then
    e(x + 16, y + 17, 10, 10, q.base); r(x + 7, y + 10, 18, 6, q.light); r(x + 20, y + 16, 7, 9, q.dark); c(x + 23, y + 19, 2, q.accent); fill(x + 10, y + 18, 7, 3, q.light)
  elseif set == "technician" then
    r(x + 7, y + 9, 18, 17, q.base); c(x + 16, y + 17, 4, q.accent); line(x + 8, y + 12, x + 16, y + 17, q.light, 2); line(x + 24, y + 12, x + 16, y + 17, q.light, 2); r(x + 21, y + 20, 6, 6, q.dark)
  else
    r(x + 5, y + 8, 22, 19, q.base); r(x + 8, y + 9, 16, 11, q.light); r(x + 10, y + 12, 12, 7, q.dark); fill(x + 8, y + 22, 16, 4, q.accent)
  end
end

local function gloves(set, x, y, q)
  local left, right = x + 5, x + 19
  if set == "scavenger" then
    r(left, y + 14, 9, 10, q.base); r(right, y + 12, 8, 12, q.light); line(x + 24, y + 13, x + 28, y + 9, q.accent, 2); r(x + 7, y + 19, 5, 3, q.dark)
  elseif set == "juggernaut" then
    r(x + 3, y + 12, 12, 13, q.base); r(x + 18, y + 12, 12, 13, q.base); r(x + 5, y + 14, 8, 6, q.light); r(x + 20, y + 14, 8, 6, q.light)
  elseif set == "pyro" then
    r(left, y + 9, 9, 16, q.base); r(right, y + 9, 9, 16, q.base); r(x + 7, y + 11, 5, 7, q.light); r(x + 21, y + 11, 5, 7, q.light); fill(x + 6, y + 21, 7, 3, q.accent); fill(x + 20, y + 21, 7, 3, q.accent)
  elseif set == "recon" then
    r(left, y + 15, 9, 8, q.base); r(right, y + 15, 9, 8, q.base); r(x + 8, y + 12, 5, 5, q.light); r(x + 20, y + 12, 5, 5, q.light); c(x + 11, y + 19, 2, q.accent); line(x + 25, y + 17, x + 28, y + 13, q.light, 1)
  elseif set == "medic" then
    e(x + 9, y + 18, 5, 7, q.base); e(x + 23, y + 18, 5, 7, q.base); line(x + 5, y + 17, x + 13, y + 20, q.light, 2); line(x + 19, y + 17, x + 27, y + 20, q.light, 2); r(x + 20, y + 11, 7, 5, q.accent)
  elseif set == "technician" then
    r(left, y + 13, 9, 11, q.base); r(right, y + 13, 9, 11, q.base); r(x + 8, y + 10, 5, 6, q.light); r(x + 20, y + 10, 5, 6, q.light); c(x + 10, y + 19, 2, q.accent); line(x + 24, y + 18, x + 29, y + 15, q.accent, 2)
  else
    r(x + 4, y + 11, 11, 14, q.base); r(x + 18, y + 11, 11, 14, q.base); r(x + 6, y + 12, 7, 7, q.light); r(x + 20, y + 12, 7, 7, q.light); fill(x + 6, y + 21, 7, 3, q.accent); fill(x + 20, y + 21, 7, 3, q.accent)
  end
end

local function boots(set, x, y, q)
  if set == "scavenger" then
    r(x + 6, y + 12, 8, 13, q.base); r(x + 18, y + 8, 8, 17, q.light); r(x + 4, y + 22, 11, 5, q.dark); r(x + 17, y + 22, 11, 5, q.dark); line(x + 19, y + 12, x + 25, y + 17, q.accent, 1)
  elseif set == "juggernaut" then
    r(x + 4, y + 9, 11, 18, q.base); r(x + 18, y + 9, 11, 18, q.base); r(x + 2, y + 22, 14, 6, q.dark); r(x + 17, y + 22, 14, 6, q.dark); fill(x + 7, y + 12, 5, 7, q.light); fill(x + 21, y + 12, 5, 7, q.light)
  elseif set == "pyro" then
    r(x + 6, y + 8, 9, 18, q.base); r(x + 18, y + 8, 9, 18, q.base); r(x + 5, y + 22, 11, 6, q.dark); r(x + 17, y + 22, 11, 6, q.dark); fill(x + 7, y + 16, 7, 4, q.accent); fill(x + 19, y + 16, 7, 4, q.accent)
  elseif set == "recon" then
    line(x + 9, y + 9, x + 12, y + 24, q.base, 4); line(x + 23, y + 9, x + 20, y + 24, q.base, 4); line(x + 12, y + 24, x + 5, y + 27, q.dark, 3); line(x + 20, y + 24, x + 27, y + 27, q.dark, 3); fill(x + 9, y + 14, 5, 3, q.accent); fill(x + 19, y + 14, 5, 3, q.accent)
  elseif set == "medic" then
    e(x + 10, y + 17, 6, 10, q.base); e(x + 22, y + 17, 6, 10, q.base); r(x + 4, y + 22, 12, 5, q.dark); r(x + 17, y + 22, 12, 5, q.dark); line(x + 6, y + 15, x + 14, y + 17, q.light, 2); line(x + 18, y + 15, x + 26, y + 17, q.light, 2)
  elseif set == "technician" then
    r(x + 6, y + 9, 9, 17, q.base); r(x + 18, y + 9, 9, 17, q.base); r(x + 4, y + 21, 12, 7, q.dark); r(x + 17, y + 21, 12, 7, q.dark); fill(x + 6, y + 24, 8, 2, q.accent); fill(x + 19, y + 24, 8, 2, q.accent); line(x + 14, y + 12, x + 17, y + 18, q.accent, 1)
  else
    r(x + 4, y + 9, 12, 18, q.base); r(x + 17, y + 9, 12, 18, q.base); r(x + 2, y + 21, 15, 7, q.dark); r(x + 16, y + 21, 15, 7, q.dark); fill(x + 6, y + 11, 8, 5, q.light); fill(x + 19, y + 11, 8, 5, q.light); fill(x + 3, y + 24, 13, 2, q.accent); fill(x + 17, y + 24, 13, 2, q.accent)
  end
end

for row, set in ipairs(ORDER) do
  local y, q = (row - 1) * 32, P[set]
  emblem(set, 0, y, q)
  helmet(set, 32, y, q)
  armour(set, 64, y, q)
  gloves(set, 96, y, q)
  boots(set, 128, y, q)
end

spr:saveAs("assets-src/equipment/sets/source/equipment-sets-atlas.pxo")
