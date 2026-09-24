-- Deterministic production builder shared by five Alpha 3 Mercenary redraws.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")
local M = {}
local idle = {
  boar={{0,-1},{0,0},{0,1},{0,0}},
  cougar={{0,-1},{-1,0},{0,1},{0,0}},
  weasel={{0,-1},{0,0},{-1,1},{0,0}},
  raptor={{0,-1},{0,0},{0,1},{0,0}},
  ram={{-1,0},{0,0},{1,0},{0,0}},
}
local function pose(frame, archetype)
  if frame <= 4 then return idle[archetype][frame][1], idle[archetype][frame][2], 0 end
  if frame <= 10 then return frame % 2 == 0 and -1 or 0, ({-2,0,2,-2,0,2})[frame-4], 0 end
  if frame == 11 then return 0, -2, 0 end
  if frame == 12 then return 1, -1, 0 end
  local defeat = {{1,0},{2,1},{3,1},{3,2}}
  return defeat[frame-12][1], 0, defeat[frame-12][2]
end
local function notes(spr, frame)
  local i=U.clearCel(spr,"notes",frame).image; local c=U.hex("#ff00ff")
  U.put(i,24,24,c); U.put(i,23,24,c); U.put(i,25,24,c)
end
local function boar(s,f,C)
  local b,st,fall=pose(f,"boar"); local r=20+b+fall; local i=U.clearCel(s,"body",f).image
  U.outlinedEllipse(i,24,r+10,14,math.max(6,10-fall),C.fur); U.outlinedEllipse(i,27,r-2,11,8,C.fur); U.outlinedEllipse(i,34,r,7,4,C.muzzle)
  U.outlinedEllipse(i,15+st,40,5,3,C.dark); U.outlinedEllipse(i,32-st,40,5,3,C.dark); U.outlinedLine(i,14,r+4,9,r+13,C.fur,U.OUTLINE,5); U.outlinedLine(i,34,r+5,39,r+14,C.fur,U.OUTLINE,5)
  U.outlinedLine(i,35,r+1,39,r-5,C.tusk,U.OUTLINE,3); U.outlinedLine(i,31,r+2,34,r+7,C.tusk,U.OUTLINE,3)
  i=U.clearCel(s,"face",f).image; U.outlinedCircle(i,29,r-4,2,C.eye); U.put(i,30,r-4,U.OUTLINE); U.put(i,36,r,C.dark); U.put(i,32,r,C.dark)
  i=U.clearCel(s,"outfit",f).image; U.outlinedEllipse(i,24,r+10,10,math.max(4,8-fall),C.metal); U.outlinedLine(i,11,r+2,18,r+7,C.strap,U.OUTLINE,3); U.outlinedLine(i,37,r+3,31,r+8,C.strap,U.OUTLINE,3); U.outlinedCircle(i,24,r+10,2,C.highlight)
end
local function cougar(s,f,C)
  local b,st,fall=pose(f,"cougar"); local r=18+b+fall; local i=U.clearCel(s,"body",f).image
  U.outlinedEllipse(i,24,r+10,8,math.max(7,11-fall),C.fur); U.outlinedEllipse(i,26,r-3,8,6,C.fur); U.outlinedEllipse(i,31,r-1,5,3,C.muzzle); U.outlinedCircle(i,20,r-8,3,C.fur); U.outlinedCircle(i,30,r-8,3,C.fur)
  U.outlinedLine(i,17,r+5,13-st,r+18,C.fur,U.OUTLINE,4); U.outlinedLine(i,31,r+5,36+st,r+17,C.fur,U.OUTLINE,4); U.outlinedEllipse(i,20+st,41,4,2,C.dark); U.outlinedEllipse(i,29-st,41,4,2,C.dark)
  U.outlinedLine(i,17,r+12,8,r+17-st,C.tail,U.OUTLINE,3); U.outlinedLine(i,8,r+17-st,5,r+10-st,C.dark,U.OUTLINE,3)
  i=U.clearCel(s,"face",f).image; U.outlinedCircle(i,29,r-4,2,C.eye); U.put(i,30,r-4,U.OUTLINE); U.put(i,34,r-1,C.dark)
  i=U.clearCel(s,"outfit",f).image; U.outlinedRect(i,19,r+2,11,math.max(6,12-fall),C.dark); U.outlinedLine(i,17,r,33,r+3,C.copper,U.OUTLINE,4); for x=21,29,4 do U.outlinedRect(i,x,r+4,2,5,C.ember) end
end
local function weasel(s,f,C)
  local b,st,fall=pose(f,"weasel"); local r=17+b+fall; local i=U.clearCel(s,"body",f).image
  U.outlinedEllipse(i,25,r+11,6,math.max(8,14-fall),C.fur); U.outlinedEllipse(i,27,r-2,7,5,C.fur); U.outlinedLine(i,31,r-1,38,r+1,C.muzzle,U.OUTLINE,4); U.outlinedCircle(i,23,r-7,3,C.fur)
  U.outlinedLine(i,20,r+7,16-st,r+19,C.fur,U.OUTLINE,3); U.outlinedLine(i,29,r+7,34+st,r+19,C.fur,U.OUTLINE,3); U.outlinedEllipse(i,21+st,42,3,2,C.dark); U.outlinedEllipse(i,29-st,42,3,2,C.dark)
  U.outlinedLine(i,20,r+16,10,r+19-st,C.tail,U.OUTLINE,4); U.outlinedLine(i,10,r+19-st,5,r+13-st,C.tail,U.OUTLINE,3)
  i=U.clearCel(s,"face",f).image; U.outlinedCircle(i,31,r-3,2,C.eye); U.put(i,32,r-3,U.OUTLINE); U.put(i,39,r+1,C.dark)
  i=U.clearCel(s,"outfit",f).image; U.outlinedRect(i,20,r+3,10,math.max(8,14-fall),C.cloth); U.outlinedRect(i,11,r+8,10,13,C.bag); U.outlinedLine(i,17,r+1,27,r+17,C.strap,U.OUTLINE,2); U.outlinedCircle(i,15,r+18,4,C.coil); U.outlinedCircle(i,15,r+18,1,C.glow)
end
local function raptor(s,f,C)
  local b,st,fall=pose(f,"raptor"); local r=20+b+fall; local i=U.clearCel(s,"body",f).image
  U.outlinedEllipse(i,25,r+7,7,math.max(6,10-fall),C.feather); U.outlinedEllipse(i,27,r-5,7,5,C.cream); U.outlinedLine(i,32,r-5,40,r-2,C.beak,U.OUTLINE,5); U.outlinedLine(i,21,r-8,17,r-12,C.cream,U.OUTLINE,3); U.outlinedLine(i,22,r-7,20,r-13,C.teal,U.OUTLINE,3)
  U.outlinedLine(i,19,r+9,5,r+15-st,C.teal,U.OUTLINE,5); U.outlinedLine(i,18,r+11,7,r+19-st,C.cream,U.OUTLINE,3); U.outlinedLine(i,22,r+15,19+st,40,C.dark,U.OUTLINE,3); U.outlinedLine(i,29,r+15,33-st,40,C.dark,U.OUTLINE,3); U.outlinedLine(i,19+st,40,14+st,42,C.dark,U.OUTLINE,2); U.outlinedLine(i,33-st,40,38-st,42,C.dark,U.OUTLINE,2)
  i=U.clearCel(s,"face",f).image; U.outlinedCircle(i,31,r-6,2,C.eye); U.put(i,32,r-6,U.OUTLINE)
  i=U.clearCel(s,"outfit",f).image; U.outlinedLine(i,19,r+1,32,r+10,C.harness,U.OUTLINE,3); U.outlinedCircle(i,33,r-6,4,C.optic); U.outlinedCircle(i,34,r-6,2,C.glow); U.outlinedCircle(i,24,r+7,3,C.metal)
end
local function ram(s,f,C)
  local b,st,fall=pose(f,"ram"); local r=18+b+fall; local i=U.clearCel(s,"body",f).image
  U.outlinedRect(i,16,r+3,17,math.max(10,17-fall),C.chest); U.outlinedEllipse(i,24,r-4,7,6,C.face); U.outlinedCircle(i,14,r-5,8,C.horn); U.outlinedCircle(i,14,r-5,4,C.dark); U.outlinedCircle(i,34,r-5,8,C.horn); U.outlinedCircle(i,34,r-5,4,C.dark)
  U.outlinedRect(i,8,r+7,7,15,C.metal); U.outlinedRect(i,34,r+7,7,15,C.metal); U.outlinedEllipse(i,11-st,41,5,4,C.dark); U.outlinedEllipse(i,38+st,41,5,4,C.dark); U.outlinedRect(i,18+st,38,5,4,C.dark); U.outlinedRect(i,27-st,38,5,4,C.dark)
  i=U.clearCel(s,"face",f).image; U.outlinedCircle(i,21,r-5,2,C.eye); U.outlinedCircle(i,27,r-5,2,C.eye); U.put(i,22,r-5,U.OUTLINE); U.put(i,28,r-5,U.OUTLINE)
  i=U.clearCel(s,"outfit",f).image; U.outlinedRect(i,18,r+5,13,math.max(7,13-fall),C.power); U.outlinedCircle(i,24,r+10,5,C.gauge); U.outlinedLine(i,24,r+10,27,r+7,C.redline,U.OUTLINE,1); U.outlinedRect(i,10,r+10,3,8,C.highlight); U.outlinedRect(i,36,r+10,3,8,C.highlight)
end
local render={boar=boar,cougar=cougar,weasel=weasel,raptor=raptor,ram=ram}
function M.build(c)
  local s,l=U.makeSprite("character",48,48); l.weapon.isVisible=false; l.shadow.isVisible=false
  for f=1,16 do render[c.archetype](s,f,c.colors); notes(s,f) end
  s:saveAs(c.output)
end
return M
