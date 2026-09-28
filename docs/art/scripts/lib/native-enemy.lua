-- Hand-authored native-grid enemy masters.  The masks are deliberately pixel
-- clusters rather than generated/imported images: each actor owns a distinct
-- silhouette and the small animation offsets only move authored clusters.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")
local M = {}

local masks = {
  ["scrap-skitter"] = {
    body = {"", "", "      xx      ", "    xxxxx     ", "  xxaaaaaxx   ", " xxaaaaaaaaxx ", "xxxxxxxxxxxxxx", "  xxaaaaaaa xx", "    xxxxx     ", "xx  x     x  xx", " x  x     x  x "},
    face = {"", "", "", "", "      oo      ", "     ooo      ", "", "", "", "", ""},
    palette = { x="#223338", a="#a6d64f", o="#f2e4b2" }, accent="#d7e35b"
  },
  ["bastion-beetle"] = {
    body = {"", "    xxxxx     ", "  xxxxxxxxx   ", " xxxxxxxxxxxx ", "xxxxxxxxxxxxxx", "xxxxbbbbxxxxxx", "xxxxbbbbxxxxxx", " xxxxxxxxxxxx ", "  xxxxxxxxxx  ", "    xxxx      ", "  xx    xx    "},
    face = {"", "", "", "", "", "   oooooo     ", "   oooooo     "},
    palette = { x="#164b55", b="#d7c99a", o="#f1e5b0" }, accent="#a65d3a"
  },
  ["junk-nester"] = {
    body = {"      xx      ", "   a  xx  a   ", "   xxxxxxxx   ", "  xxxxxxxxxx  ", " xxccccxxxxxx ", "xxxxxxxxxxxxxx", "xxxxxx  xxxxxx", "xxxxx    xxxxx", "xxxx      xxxx", "  xx      xx  ", "  xx      xx  "},
    face = {"", "", "", "", "", "      oo      ", "     oooo     "},
    palette = { x="#68713e", c="#b06b38", a="#c4d16a", o="#f0dca2" }, accent="#d0a04b"
  },
  ["shard-bot"] = {
    body = {"", "      xx      ", "     xaxx     ", "    xxxxxa    ", "   xxbbbbxx   ", " xxxxxxxxxxxx ", "xxxxxx  xxxxxx", "  xxxxxxxxxx  ", "   xx xx xx   ", "  xx     xx   "},
    face = {"", "", "", "", "", "     oo oo    ", "", "", "", ""},
    palette = { x="#522453", a="#6e9bc5", b="#f0d4a2", o="#f2d4a2" }, accent="#d64eae"
  },
  ["boss-crusher"] = {
    body = {"", "", "", "       xxxxxxxxxx       ", "   xxxxxxxaaaaxxxxxxx   ", " xxxxxxxaaaaaaaaxxxxxxx ", "xxxxxxxxxxxxxxxxxxxxxxxx", "xxxxxxxxbbbbbbbbxxxxxxxx", " xxxxxxxxxxxxxxxxxxxxxx ", "   xxxxxxxxxxxxxxxxxx   ", "       xxxxxxxxxx       ", " xx    xxxx    xxxx    "},
    face = {"", "", "", "", "", "                ", "                ", "           oo   "},
    palette = { x="#713034", a="#c98b3d", b="#e7c47f", o="#7ed5d1" }, accent="#f1df9b"
  },
  ["boss-forge"] = {
    body = {"", "          axxxxx          ", "        axxxxxxxxa        ", "       xxxxxxxxxxxx       ", "       xxxx  xxxx         ", "      xxxxbbbbbbxxx       ", "     xxxxxxxxxxxxxxxx      ", "    xxxxaaaaaaaaxxxxx     ", "   xxxxxxxxxxxxxxxxxxxx    ", "   xxxx  xxxxxxxx  xxxx    ", "  xxxx    xxxxxx    xxxx   ", "  xxx      xxxx      xxx   ", " xx        xxxx        xx  ", "xx        xxxxxx        xx "},
    face = {"", "", "", "", "", "", "", "", "", "", "", "", "      oo      "},
    palette = { x="#303941", a="#d4743c", b="#fff1c5", o="#fff1c5" }, accent="#f0a34b"
  },
}

local colors = function(spec)
  local c = { outline = U.OUTLINE, body = U.hex(spec.palette.x), face = U.hex(spec.palette.o), accent = U.hex(spec.accent) }
  return c
end

local function drawMask(img, mask, ox, oy, palette)
  local scale = 2
  for row, line in ipairs(mask or {}) do
    for col = 1, #line do
      local glyph = line:sub(col, col)
      if glyph ~= " " then
        local color = palette[glyph] or palette.x
        for sy = 0, scale - 1 do
          for sx = 0, scale - 1 do U.put(img, ox + (col - 1) * scale + sx, oy + (row - 1) * scale + sy, color) end
        end
      end
    end
  end
end

function M.build(spec)
  local data = assert(masks[spec.id], "missing native enemy mask " .. spec.id)
  local size = spec.size or 48
  local s, layers = U.makeSprite("enemy", size, size)
  local c = colors(data)
  local cx = math.floor(size / 2) - 7
  local top = math.floor(size / 2) - math.floor(#data.body / 2)
  for frame = 1, 16 do
    local bob = frame <= 4 and ((frame % 2 == 0) and 1 or 0) or (frame <= 10 and ((frame % 2 == 0) and -1 or 1) or (frame >= 13 and math.min(frame - 12, 2) or 0))
    if frame >= 11 and spec.id == "boss-forge" then bob = frame >= 13 and 2 or 1 end
    local body = U.clearCel(s, "body", frame).image
    drawMask(body, data.body, cx, top + bob, { x=c.body, a=c.accent, b=c.face, c=c.accent })
    local face = U.clearCel(s, "face", frame).image
    drawMask(face, data.face, cx, top + bob, { x=c.face, o=c.face })
    -- Hand-placed material accents, kept sparse so silhouettes survive 26px.
    if spec.id == "bastion-beetle" then U.put(body, cx + 7, top + 5 + bob, c.accent)
    elseif spec.id == "junk-nester" then U.put(body, cx + 8, top + 7 + bob, c.accent)
    elseif spec.id == "shard-bot" then U.put(body, cx + 6, top + 5 + bob, c.accent)
    elseif spec.id == "boss-crusher" then U.put(body, cx + 2, top + 7 + bob, c.accent)
    elseif spec.id == "boss-forge" then U.put(body, cx + 7, top + 7 + bob, c.accent)
    end
    local notes = U.clearCel(s, "notes", frame).image
    local n = math.floor(size / 2)
    U.put(notes, n, n, U.hex("#ff00ff")); U.put(notes, n - 1, n, U.hex("#ff00ff")); U.put(notes, n + 1, n, U.hex("#ff00ff"))
  end
  s:saveAs(spec.output)
end

return M
