-- Authored native-grid mercenary masters.  These are hand-authored pixel
-- clusters, not procedural body primitives or imported concept pixels.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")
local M = {}

local actors = {
  ["scrap-tabby"] = {
    body={"", "    xx  xx    ", "   xxxxxxxx   ", "  xxxxxxxxxx  ", "  xxxxxxxxxx  ", "   xxxxxxxx   ", "    xxxxxx    ", "   xx    xx   ", "  xx      xx  ", "  xx      xx  ", " xx        xx ", ""},
    face={"", "", "", "  ff    ff  ", "   ffffff   "}, outfit={"", "", "", "", "", "", "  oooooooo  ", " oooooooooo ", "  oooooooo  "},
    palette={x="#f0b84b", f="#fff0c2", o="#247b83", a="#d26d35"}, details="tabby"
  },
  ["bolt-hound"] = {
    body={"", "     xx      ", "    xxxxx    ", " xxxxxxxxx   ", "xxxxxxxxxxx   ", "  xxxxxxx     ", "   xxxxxxx    ", "    xx xx     ", "   xx  xx     ", "  xx    xx    ", " xx      xx   ", ""},
    face={"", "", "", "", "", "", "   ff        ", ""}, outfit={"", "", "", "", "", "  ooooooo    ", " ooooooooo   ", "", ""},
    palette={x="#668da0", f="#cde8e9", o="#b4d846", a="#b76d3d"}, details="hound"
  },
  ["volt-lynx"] = {
    body={"", "    xx xx     ", "   xxxxxxx    ", "   xxxxxxx    ", "    xxxxx     ", "    xxxxx     ", "   xx xxx     ", "   xx  xx     ", "  xx    xx    ", " xx      xx   ", ""},
    face={"", "", "", "  ff  ff     ", "    ffff     "}, outfit={"", "", "", "", " oooooooo    ", "  oooooo     ", "", "", ""},
    palette={x="#443b73", f="#d8d8de", o="#39c9d7", a="#a78bca"}, details="lynx"
  },
  ["brass-boar"] = {
    body={"", "    xx xx     ", "   xxxxxxxx   ", "  xxxxxxxxxx  ", "  xxxxxxxxxxx ", "   xxxxxxxxx  ", "   xxxxxxxx   ", "  xx      xx  ", " xx        xx ", " xx        xx ", ""},
    face={"", "", "", "  ffffffff   ", "   ff  ff    "}, outfit={"", "", "", "", " oooooooooo ", " oooooooooo ", "", ""},
    palette={x="#9c7040", f="#fff0bd", o="#c19a4b", a="#702f34"}, details="boar"
  },
  ["ember-cougar"] = {
    body={"", "     xx      ", "    xxxxxx   ", "   xxxxxxx   ", "   xxxxxxx   ", "    xxxxx    ", "   xxxxxxx   ", "  xx     xx  ", " xx       xx ", ""},
    face={"", "", "", "   ff ff    ", "    ffff    "}, outfit={"", "", "", "  ooooooo    ", " ooooooooo   ", "  ooooooo    ", "", ""},
    palette={x="#493944", f="#d39b86", o="#b85b37", a="#ffb34d"}, details="cougar"
  },
  ["scrap-weasel"] = {
    body={"", "      xx     ", "     xxxx    ", "     xxxxx   ", "      xxxx   ", "      xxxx   ", "     xxxxx   ", "    xx  xx   ", "   xx    xx  ", "  xx      xx ", ""},
    face={"", "", "", "      ff    ", "       f    "}, outfit={"", "", "", "", " oo      o  ", " ooo    oo  ", "", ""},
    palette={x="#68734a", f="#f1dec0", o="#9b7546", a="#85e0c2"}, details="weasel"
  },
  ["rattle-raptor"] = {
    body={"", "      xx     ", "     xxxxx   ", "     xxxxx   ", "      xxxx   ", "     xxxxx   ", "    xx  xx   ", "   xx    xx  ", "  xx      xx ", " xx        xx", ""},
    face={"", "", "", "      ff    ", "       f    "}, outfit={"", "", "", "", "  ooooo     ", " oo   oo    ", "", ""},
    palette={x="#d9cfaa", f="#fff2cf", o="#286a6d", a="#f055ba"}, details="raptor"
  },
  ["piston-ram"] = {
    body={"", "   xx    xx  ", "  xxx    xxx ", "  xxxxxxxxxx ", "   xxxxxxxx  ", "   xxxxxxxx  ", "  xxxxxxxxxx ", " xx      xx  ", "xx        xx ", ""},
    face={"", "", "", "   ff  ff   ", "    ffff    "}, outfit={"", "", "", "  oooooooo  ", "  oooooooo  ", "", ""},
    palette={x="#526276", f="#d7d2c8", o="#3564a0", a="#ef713e"}, details="ram"
  },
}

local function putMask(img, rows, ox, oy, palette)
  for y, row in ipairs(rows or {}) do
    for x = 1, #row do
      local glyph=row:sub(x,x)
      if glyph ~= " " then
        local color=palette[glyph] or palette.x
        if palette.outline then
          for sy=-1,2 do for sx=-1,2 do U.put(img,ox+(x-1)*2+sx,oy+(y-1)*2+sy,palette.outline) end end
        end
        for sy=0,1 do for sx=0,1 do U.put(img,ox+(x-1)*2+sx,oy+(y-1)*2+sy,color) end end
      end
    end
  end
end

local function details(img, kind, frame, ox, oy, c)
  local swing=(frame>=5 and frame<=10 and ((frame%2==0) and 2 or -1)) or 0
  if kind=="tabby" then
    U.line(img,ox+6,oy+3,ox+3,oy+1,c.accent); U.line(img,ox+19,oy+15,ox+25,oy+18+swing,c.accent)
  elseif kind=="hound" then
    U.line(img,ox+3,oy+12,ox-4,oy+17+swing,c.a); U.line(img,ox+16,oy+13,ox+25,oy+16-swing,c.a)
  elseif kind=="lynx" then
    U.line(img,ox+7,oy+3,ox+3,oy-2,c.a); U.line(img,ox+15,oy+3,ox+19,oy-2,c.a); U.put(img,ox+16,oy+10,c.a)
  elseif kind=="boar" then
    U.line(img,ox+17,oy+7,ox+23,oy+10,c.f); U.line(img,ox+19,oy+8,ox+23,oy+12,c.f); U.line(img,ox+5,oy+12,ox+20,oy+12,c.a)
  elseif kind=="cougar" then
    U.line(img,ox+4,oy+12,ox-3,oy+17+swing,c.a); U.line(img,ox+18,oy+10,ox+25,oy+16-swing,c.a); U.put(img,ox+12,oy+10,c.a)
    U.line(img,ox+4,oy+11,ox-4,oy+8,c.outline); U.line(img,ox-4,oy+8,ox-7,oy+3,c.a)
  elseif kind=="weasel" then
    U.line(img,ox+7,oy+8,ox+2,oy+15+swing,c.a); U.line(img,ox+17,oy+7,ox+23,oy+11,c.a); U.put(img,ox+8,oy+14,c.a)
  elseif kind=="raptor" then
    U.line(img,ox+7,oy+6,ox+1,oy+6,c.a); U.line(img,ox+7,oy+14,ox-3,oy+17+swing,c.a); U.put(img,ox+14,oy+6,c.a)
  elseif kind=="ram" then
    U.line(img,ox+3,oy+2,ox-3,oy-4,c.a); U.line(img,ox-3,oy-4,ox-5,oy+1,c.a); U.line(img,ox+19,oy+2,ox+25,oy-4,c.a); U.line(img,ox+25,oy-4,ox+27,oy+1,c.a); U.line(img,ox+10,oy+10,ox+14,oy+10,c.a)
  end
end

function M.build(spec)
  local a=assert(actors[spec.id],"unknown mercenary "..spec.id)
  local s,layers=U.makeSprite("character",48,48); layers.weapon.isVisible=false; layers.shadow.isVisible=false
  local c={outline=U.OUTLINE,body=U.hex(a.palette.x),face=U.hex(a.palette.f),outfit=U.hex(a.palette.o),accent=U.hex(a.palette.a),a=U.hex(a.palette.a),f=U.hex(a.palette.f)}
  local ox=15; local oy=16
  for frame=1,16 do
    local bob=frame<=4 and ((frame%2==0) and 1 or 0) or (frame<=10 and ((frame%2==0) and -1 or 1) or (frame>=13 and math.min(frame-12,2) or 0))
    putMask(U.clearCel(s,"body",frame).image,a.body,ox,oy+bob,{x=c.body,f=c.face,o=c.outfit,a=c.accent,outline=c.outline})
    putMask(U.clearCel(s,"face",frame).image,a.face,ox,oy+bob,{x=c.face,f=c.face,o=c.outfit,a=c.accent,outline=c.outline})
    local outfit=U.clearCel(s,"outfit",frame).image; putMask(outfit,a.outfit,ox,oy+bob,{x=c.outfit,o=c.outfit,a=c.accent,f=c.face,outline=c.outline}); details(outfit,a.details,frame,ox,oy+bob,c)
    local notes=U.clearCel(s,"notes",frame).image; U.put(notes,24,24,U.hex("#ff00ff")); U.put(notes,23,24,U.hex("#ff00ff")); U.put(notes,25,24,U.hex("#ff00ff"))
  end
  s:saveAs(spec.output)
end
return M
