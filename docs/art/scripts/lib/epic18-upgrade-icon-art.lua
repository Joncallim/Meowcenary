-- Epic 18 (D8): shared drawing library for run-upgrade card placeholder
-- icons. Simple, readable motifs at phone scale — one shape per category so
-- a player can recognize a card's role at a glance before final art lands;
-- an accent-color variant per card gives basic within-category
-- distinguishability without hand-authoring 18 unique illustrations.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")
local spec = assert(EPIC18_UPGRADE_ICON_ART, "EPIC18_UPGRADE_ICON_ART must be set by the asset builder")

local BG_COLORS = {
  offense = U.hex("#7f1d1d"), defense = U.hex("#1e3a5f"), mobility = U.hex("#14532d"),
  utility = U.hex("#164e63"), economy = U.hex("#78350f"), synergy = U.hex("#581c87"),
}
local GLYPH_COLORS = {
  offense = U.hex("#ef4444"), defense = U.hex("#60a5fa"), mobility = U.hex("#4ade80"),
  utility = U.hex("#22d3ee"), economy = U.hex("#fbbf24"), synergy = U.hex("#c084fc"),
}
-- Per-card accent variant (index within its category, 1-based) so adjacent
-- cards in one category still read as distinct placeholders. There must be at
-- least as many accents as the largest category holds (synergy ships 8), or
-- variants wrap and two cards render pixel-identical — which the visual-art
-- validator cannot catch, since it only checks dimensions and metadata.
local ACCENT_VARIANTS = {
  U.hex("#fff3c4"), U.hex("#f472b6"), U.hex("#67e8f9"), U.hex("#a3e635"),
  U.hex("#fb923c"), U.hex("#c4b5fd"), U.hex("#f87171"), U.hex("#34d399"),
}

local bg = assert(BG_COLORS[spec.category], "unknown upgrade category: " .. tostring(spec.category))
local glyph = GLYPH_COLORS[spec.category]
local accent = ACCENT_VARIANTS[((spec.variant - 1) % #ACCENT_VARIANTS) + 1]

local spr = U.makePropSprite(48, 48)

local function drawOffense(img)
  -- Upward chevron: reads as "attack/power."
  for row = 0, 9 do
    local half = 10 - row
    U.fillRect(img, 24 - half, 14 + row * 2, half * 2, 3, glyph)
  end
  U.fillRect(img, 22, 32, 4, 4, accent)
end

local function drawDefense(img)
  -- Shield: rounded-top rectangle tapering to a point.
  U.outlinedRect(img, 16, 12, 16, 16, glyph)
  for row = 0, 7 do
    local inset = row
    U.fillRect(img, 16 + inset, 28 + row, 16 - inset * 2, 1, glyph)
  end
  U.fillRect(img, 22, 18, 4, 8, accent)
end

local function drawMobility(img)
  -- Forward chevron / paw-print stand-in: motion, not combat.
  U.fillCircle(img, 18, 20, 4, glyph)
  U.fillCircle(img, 30, 20, 4, glyph)
  U.fillCircle(img, 24, 28, 5, glyph)
  U.fillCircle(img, 24, 16, 3, accent)
end

local function drawUtility(img)
  -- Gear cross: a plus with corner notches.
  U.fillRect(img, 20, 12, 8, 24, glyph)
  U.fillRect(img, 12, 20, 24, 8, glyph)
  U.fillCircle(img, 24, 24, 4, accent)
end

local function drawEconomy(img)
  -- Coin: outlined circle with an accent pip.
  U.outlinedCircle(img, 24, 24, 12, glyph)
  U.fillCircle(img, 24, 24, 4, accent)
end

local function drawSynergy(img)
  -- Four-point star: two overlapping diamonds.
  local function diamond(cx, cy, r, c)
    for dy = -r, r do
      local half = r - math.abs(dy)
      U.fillRect(img, cx - half, cy + dy, half * 2 + 1, 1, c)
    end
  end
  diamond(24, 24, 11, glyph)
  diamond(24, 24, 5, accent)
end

local drawers = {
  offense = drawOffense, defense = drawDefense, mobility = drawMobility,
  utility = drawUtility, economy = drawEconomy, synergy = drawSynergy,
}

-- Variant tally along the bottom inset: a second, shape-based distinguishing
-- dimension so two cards in one category stay distinct even if the accent
-- palette ever wraps again. Row y=39..40 is clear of every category glyph.
local function drawVariantPips(img)
  local pips = math.min(spec.variant, 9)
  for index = 0, pips - 1 do
    U.fillRect(img, 6 + index * 4, 39, 3, 2, accent)
  end
end

local image = U.getCel(spr, "body", 1).image
U.clear(image)
U.fillRect(image, 4, 4, 40, 40, bg)
drawers[spec.category](image)
drawVariantPips(image)

spr:saveAs(spec.savedAs)
EPIC18_UPGRADE_ICON_ART = nil
