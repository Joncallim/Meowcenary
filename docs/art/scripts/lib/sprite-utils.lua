-- Meowcenary pixel builder utilities.
-- Shared helper code for the seven Epic 13 Pixelorama source builders.
-- The builders run through validate-builders.lua, which supplies the small
-- drawing API below and writes native Pixelorama .pxo projects.

local M = {}

-- -----------------------------------------------------------------------------
-- Colors
-- -----------------------------------------------------------------------------

function M.hex(h)
  local r = tonumber(h:sub(2, 3), 16)
  local g = tonumber(h:sub(4, 5), 16)
  local b = tonumber(h:sub(6, 7), 16)
  return app.pixelColor.rgba(r, g, b, 255)
end

M.TRANSPARENT = app.pixelColor.rgba(0, 0, 0, 0)
M.OUTLINE     = app.pixelColor.rgba(10, 15, 20, 255) -- #0a0f14

-- -----------------------------------------------------------------------------
-- Low-level pixel access
-- -----------------------------------------------------------------------------

function M.put(img, x, y, c)
  x = math.floor(x + 0.5)
  y = math.floor(y + 0.5)
  if x >= 0 and x < img.width and y >= 0 and y < img.height then
    img:drawPixel(x, y, c)
  end
end

function M.clear(img)
  img:clear(Rectangle(0, 0, img.width, img.height), M.TRANSPARENT)
end

-- -----------------------------------------------------------------------------
-- Primitives (fill only)
-- -----------------------------------------------------------------------------

function M.fillRect(img, x, y, w, h, c)
  for yy = y, y + h - 1 do
    for xx = x, x + w - 1 do
      M.put(img, xx, yy, c)
    end
  end
end

function M.fillCircle(img, cx, cy, r, c)
  local r2 = r * r
  for yy = cy - r, cy + r do
    for xx = cx - r, cx + r do
      local dx = xx - cx
      local dy = yy - cy
      if dx * dx + dy * dy <= r2 + 0.5 then
        M.put(img, xx, yy, c)
      end
    end
  end
end

function M.fillEllipse(img, cx, cy, rx, ry, c)
  for yy = cy - ry, cy + ry do
    for xx = cx - rx, cx + rx do
      local dx = xx - cx
      local dy = yy - cy
      if rx == 0 or ry == 0 then
        -- degenerate safety
      elseif (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.05 then
        M.put(img, xx, yy, c)
      end
    end
  end
end

function M.line(img, x1, y1, x2, y2, c)
  -- Several animation poses deliberately calculate subpixel offsets. Pixel
  -- art still needs integer endpoints, and Bresenham termination requires the
  -- stepped coordinates to be able to equal the target coordinates.
  x1 = math.floor(x1 + 0.5)
  y1 = math.floor(y1 + 0.5)
  x2 = math.floor(x2 + 0.5)
  y2 = math.floor(y2 + 0.5)
  local dx = math.abs(x2 - x1)
  local dy = math.abs(y2 - y1)
  local sx = (x1 < x2) and 1 or -1
  local sy = (y1 < y2) and 1 or -1
  local err = dx - dy
  while true do
    M.put(img, x1, y1, c)
    if x1 == x2 and y1 == y2 then break end
    local e2 = 2 * err
    if e2 > -dy then
      err = err - dy
      x1 = x1 + sx
    end
    if e2 < dx then
      err = err + dx
      y1 = y1 + sy
    end
  end
end

-- -----------------------------------------------------------------------------
-- Outlined primitives (1 pixel outline)
-- -----------------------------------------------------------------------------

function M.outlinedRect(img, x, y, w, h, fill, outline)
  outline = outline or M.OUTLINE
  M.fillRect(img, x - 1, y - 1, w + 2, h + 2, outline)
  M.fillRect(img, x, y, w, h, fill)
end

function M.outlinedCircle(img, cx, cy, r, fill, outline)
  outline = outline or M.OUTLINE
  M.fillCircle(img, cx, cy, r + 1, outline)
  M.fillCircle(img, cx, cy, r, fill)
end

function M.outlinedEllipse(img, cx, cy, rx, ry, fill, outline)
  outline = outline or M.OUTLINE
  M.fillEllipse(img, cx, cy, rx + 1, ry + 1, outline)
  M.fillEllipse(img, cx, cy, rx, ry, fill)
end

function M.outlinedLine(img, x1, y1, x2, y2, fill, outline, thickness)
  outline = outline or M.OUTLINE
  thickness = thickness or 2
  local half = math.floor(thickness / 2)
  for oy = -half, half do
    for ox = -half, half do
      M.line(img, x1 + ox, y1 + oy, x2 + ox, y2 + oy, outline)
    end
  end
  M.line(img, x1, y1, x2, y2, fill)
end

-- -----------------------------------------------------------------------------
-- Sprite scaffolding
-- -----------------------------------------------------------------------------

-- Create a sprite with the standard Epic 13 frame/tag/layer structure.
-- kind: "character" | "enemy" | "prop"
-- Returns the sprite and a table mapping layer names to Layer objects.
function M.makeSprite(kind, width, height)
  local spr = Sprite(width, height)
  spr.layers[1].name = "body"

  -- 16 frames total (placeholders get 16 too for consistent scaffolding)
  for i = 2, 16 do
    spr:newEmptyFrame()
  end

  local layers = {}
  local layerOrder = {}

  if kind == "character" then
    layerOrder = { "face", "outfit", "weapon", "shadow", "notes" }
  elseif kind == "enemy" then
    layerOrder = { "face", "notes" }
  else -- prop
    layerOrder = { "notes" }
  end

  for _, name in ipairs(layerOrder) do
    local layer = spr:newLayer()
    layer.name = name
    if name == "notes" then
      layer.isVisible = false
    end
  end

  for _, layer in ipairs(spr.layers) do
    layers[layer.name] = layer
  end

  -- Standard tags for 16-frame actors.
  spr:newTag(1, 4).name   = "idle"
  spr:newTag(5, 10).name  = "run"
  spr:newTag(11, 12).name = "hurt"
  spr:newTag(13, 16).name = "defeat"

  return spr, layers
end

-- Make a 16×16 prop sprite with no standard tags; caller adds custom tags.
function M.makePropSprite(width, height)
  local spr = Sprite(width, height)
  spr.layers[1].name = "body"
  local notes = spr:newLayer()
  notes.name = "notes"
  notes.isVisible = false
  return spr
end

-- -----------------------------------------------------------------------------
-- Cel access
-- -----------------------------------------------------------------------------

function M.getCel(spr, layerName, frameNumber)
  local layer = nil
  for _, candidate in ipairs(spr.layers) do
    if candidate.name == layerName then
      layer = candidate
      break
    end
  end
  if not layer then return nil end

  -- Transparent layers in a new empty frame have no cel. Likewise, newLayer()
  -- creates the layer but does not populate its frame intersections. Every
  -- builder draws through this helper, so create the missing cel explicitly.
  local cel = layer:cel(frameNumber)
  if not cel then
    cel = spr:newCel(layer, frameNumber)
  end
  return cel
end

function M.clearCel(spr, layerName, frameNumber)
  local cel = M.getCel(spr, layerName, frameNumber)
  if cel then
    M.clear(cel.image)
  end
  return cel
end

-- -----------------------------------------------------------------------------
-- File paths
-- -----------------------------------------------------------------------------

function M.repoRoot()
  -- Scripts are run from the repo root per Epic 13 instructions.
  return app.fs.currentPath
end

return M
