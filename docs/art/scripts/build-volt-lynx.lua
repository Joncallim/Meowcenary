-- Build: Volt Lynx
-- Selected direction: tall, alert recon lynx with sensor harness and hip cell.
-- Build all native .pxo sources:
--   lua docs/art/scripts/validate-builders.lua --write
-- Export character sheets without the Pixelorama desktop binary:
--   python3 docs/art/scripts/export-character-pxo-fallback.py

local U = dofile("docs/art/scripts/lib/sprite-utils.lua")

-- The cool palette deliberately separates Volt Lynx from Scrap Tabby's warm,
-- compact scavenger read. Cyan is reserved for actual sensor/power hardware.
local C = {
  violet = U.hex("#7c5ce6"),
  violetLight = U.hex("#b9a7ff"),
  navy = U.hex("#202050"),
  navyDeep = U.hex("#121636"),
  silver = U.hex("#e8e6f5"),
  silverShade = U.hex("#aaa7cf"),
  cyan = U.hex("#22d3ee"),
  cyanLight = U.hex("#bff8ff"),
  pink = U.hex("#d98ca8"),
}

local CX, ROOT_Y = 24, 20

local function pose(frame)
  local bob, stride, lean, collapse = 0, 0, 0, 0
  if frame <= 4 then
    -- Light toe-first idle: feet and torso stay pinned; only tail/scanner move.
    bob = 0
  elseif frame <= 10 then
    local run = { [5] = -3, [6] = 0, [7] = 3, [8] = -3, [9] = 0, [10] = 3 }
    stride = run[frame] or 0
    -- The clean stride deliberately has no whole-body bounce.
    bob = 0
    lean = 1
  elseif frame <= 12 then
    -- Hurt folds the narrow frame inward rather than adding a whole-body shake.
    lean = -1
  else
    -- Defeat has to read as a grounded kneel and slide at native phone scale,
    -- not four subtly shifted standing poses. The feet stay anchored while the
    -- torso descends and the final frame settles forward.
    local defeat = {
      [13] = { collapse = 2, lean = -1 },
      [14] = { collapse = 5, lean = -2 },
      [15] = { collapse = 7, lean = -4 },
      [16] = { collapse = 8, lean = -6 },
    }
    collapse = defeat[frame].collapse
    lean = defeat[frame].lean
  end
  return bob, stride, lean, collapse
end

local function drawTuftedEar(img, x, y, direction)
  -- Long ear plus explicit tuft prongs is the primary lynx silhouette at
  -- phone scale. The silver inner strip reads against the near-black outline.
  local sign = direction == "left" and -1 or 1
  U.outlinedLine(img, x, y, x + sign * 3, y - 6, C.violet, U.OUTLINE, 3)
  U.outlinedLine(img, x + sign * 2, y - 4, x + sign * 5, y - 7, C.navy, U.OUTLINE, 2)
  U.outlinedLine(img, x + sign * 1, y - 5, x + sign * 2, y - 6, C.silver, U.OUTLINE, 1)
  U.put(img, x + sign * 5, y - 7, C.violetLight)
end

local function drawTail(img, cx, root, frame, lean)
  local swing = 0
  if frame <= 4 then
    swing = (frame == 2) and -1 or (frame == 4 and 1 or 0)
  elseif frame <= 10 then
    swing = (frame % 2 == 0) and -3 or 2
  elseif frame <= 12 then
    swing = 2
  else
    swing = 1
  end
  U.outlinedLine(img, cx - 4 + lean, root + 9, cx - 11 + lean, root + 13 + swing, C.violet, U.OUTLINE, 3)
  U.line(img, cx - 5 + lean, root + 9, cx - 10 + lean, root + 12 + swing, C.violetLight)
end

local function drawBodyLayer(spr, frame)
  local cel = U.clearCel(spr, "body", frame)
  if not cel then return end
  local img = cel.image
  local bob, stride, lean, collapse = pose(frame)
  local cx, root = CX + lean, ROOT_Y + bob + collapse

  -- Narrow vertical torso, deliberately much slimmer/taller than Tabby.
  U.outlinedEllipse(img, cx, root + 7, 6, 10 - math.floor(collapse / 2), C.violet)
  U.fillEllipse(img, cx - 2, root + 7, 2, 8 - math.floor(collapse / 2), C.violetLight)

  -- Long separate legs and compact paws preserve a stable grounded anchor.
  local rearStep, frontStep = stride, -stride
  if collapse > 0 then rearStep, frontStep = -collapse, collapse end
  U.outlinedEllipse(img, cx - 3 + rearStep, root + 18 - collapse, 2, 6 - math.floor(collapse / 2), C.violet)
  U.outlinedEllipse(img, cx + 3 + frontStep, root + 18 - collapse, 2, 6 - math.floor(collapse / 2), C.violet)
  U.outlinedEllipse(img, cx - 3 + rearStep, root + 23 - collapse, 4, 2, C.silver)
  U.outlinedEllipse(img, cx + 3 + frontStep, root + 23 - collapse, 4, 2, C.silver)

  -- Head is lean with a forward muzzle; cheek ruffs break the old round-cat
  -- read that caused the previous Scrap Tabby collision.
  U.outlinedEllipse(img, cx, root - 8, 7, 6, C.violet)
  U.outlinedEllipse(img, cx + 4, root - 5, 5, 3, C.silver)
  U.outlinedLine(img, cx - 5, root - 4, cx - 9, root - 1, C.silver, U.OUTLINE, 2)
  U.outlinedLine(img, cx - 4, root - 2, cx - 8, root + 1, C.silver, U.OUTLINE, 2)

  drawTuftedEar(img, cx - 4, root - 11, "left")
  drawTuftedEar(img, cx + 4, root - 11, "right")
  drawTail(img, cx, root, frame, lean)

  -- Long arms add the upright recon silhouette without broad shoulder armour.
  local armShift = frame >= 5 and frame <= 10 and -stride or 0
  U.outlinedLine(img, cx - 5, root + 5, cx - 7 + armShift, root + 15 - collapse, C.violet, U.OUTLINE, 3)
  U.outlinedLine(img, cx + 5, root + 5, cx + 7 - armShift, root + 15 - collapse, C.violet, U.OUTLINE, 3)
  U.outlinedCircle(img, cx - 7 + armShift, root + 16 - collapse, 2, C.silver)
  U.outlinedCircle(img, cx + 7 - armShift, root + 16 - collapse, 2, C.silver)
end

local function drawFaceLayer(spr, frame)
  local cel = U.clearCel(spr, "face", frame)
  if not cel then return end
  local img = cel.image
  local bob, _, lean, collapse = pose(frame)
  local cx, root = CX + lean, ROOT_Y + bob + collapse
  local eyeY = root - 9 + (frame >= 11 and frame <= 12 and 1 or 0)

  -- One forward sensor eye and a smaller far eye give alert precision.
  U.outlinedCircle(img, cx + 3, eyeY, 2, C.cyanLight)
  U.put(img, cx + 4, eyeY, C.cyan)
  U.put(img, cx + 5, eyeY, U.OUTLINE)
  U.outlinedCircle(img, cx - 3, eyeY, 1, C.cyan)
  U.put(img, cx - 3, eyeY, U.OUTLINE)
  U.put(img, cx + 8, root - 5, C.pink)
  U.line(img, cx + 4, root - 2, cx + 7, root - 2, U.OUTLINE)

  -- Tiny ear-mounted scanner: hardware, not an electric aura.
  U.outlinedRect(img, cx + 7, root - 12, 3, 4, C.cyan)
  U.put(img, cx + 8, root - 11, C.cyanLight)
end

local function drawOutfitLayer(spr, frame)
  local cel = U.clearCel(spr, "outfit", frame)
  if not cel then return end
  local img = cel.image
  local bob, stride, lean, collapse = pose(frame)
  local cx, root = CX + lean, ROOT_Y + bob + collapse

  -- Compact sensor harness: narrow chest plate plus two crossing straps.
  U.outlinedRect(img, cx - 4, root + 2, 8, 7 - math.floor(collapse / 2), C.navy)
  U.line(img, cx - 5, root + 1, cx + 4, root + 8 - collapse, C.silverShade)
  U.line(img, cx + 4, root + 1, cx - 4, root + 8 - collapse, C.silverShade)
  U.outlinedCircle(img, cx, root + 4, 2, C.cyan)
  U.put(img, cx, root + 3, C.cyanLight)

  -- A single powered hip cell stays a physical, readable module in motion.
  local hipSwing = frame >= 5 and frame <= 10 and math.floor(-stride / 2) or 0
  U.outlinedRect(img, cx + 5 + hipSwing, root + 10 - collapse, 4, 7, C.navyDeep)
  U.fillRect(img, cx + 6 + hipSwing, root + 11 - collapse, 2, 4, C.cyan)
  U.put(img, cx + 6 + hipSwing, root + 11 - collapse, C.cyanLight)
  U.put(img, cx + 7 + hipSwing, root + 16 - collapse, C.silverShade)

  U.line(img, cx - 4, root + 9 - collapse, cx + 4, root + 9 - collapse, C.navyDeep)
  U.outlinedRect(img, cx - 1, root + 8 - collapse, 3, 2, C.silverShade)
end

local function drawNotesLayer(spr, frame)
  local cel = U.clearCel(spr, "notes", frame)
  if not cel then return end
  local img = cel.image
  local guide = U.hex("#ff00ff")
  U.put(img, CX, ROOT_Y, guide)
  U.put(img, CX - 1, ROOT_Y, guide)
  U.put(img, CX + 1, ROOT_Y, guide)
  U.put(img, CX, ROOT_Y - 1, guide)
  U.put(img, CX, ROOT_Y + 1, guide)
end

local function drawFrame(spr, frame)
  drawBodyLayer(spr, frame)
  drawFaceLayer(spr, frame)
  drawOutfitLayer(spr, frame)
  drawNotesLayer(spr, frame)
end

local spr, layers = U.makeSprite("character", 48, 48)
layers.weapon.isVisible = false
layers.shadow.isVisible = false

for frame = 1, 16 do
  drawFrame(spr, frame)
end

spr:saveAs("assets-src/characters/volt-lynx/source/volt-lynx.pxo")
