-- Eight canonical 96px Mercenary portraits in one bounded named-frame atlas.
local U = dofile("docs/art/scripts/lib/sprite-utils.lua")
local C = {
  ink=U.OUTLINE, cream=U.hex("#f4edd0"), steel=U.hex("#475569"), steelHi=U.hex("#94a3b8"),
  cyan=U.hex("#67e8f9"), teal=U.hex("#2dd4bf"), amber=U.hex("#d58a38"), rust=U.hex("#a94f32"),
  navy=U.hex("#253454"), violet=U.hex("#65519b"), brass=U.hex("#b98835"), ox=U.hex("#6f302d"),
  charcoal=U.hex("#222831"), olive=U.hex("#697044"), magenta=U.hex("#e879f9"), cobalt=U.hex("#315eae"),
}
local S=96
local spr=U.makePropSprite(S*8,S)
local im=U.getCel(spr,"body",1).image U.clear(im)
local function X(c,x) return c*S+x end
local function ell(c,x,y,rx,ry,col) U.outlinedEllipse(im,X(c,x),y,rx,ry,col,C.ink) end
local function cir(c,x,y,r,col) U.outlinedCircle(im,X(c,x),y,r,col,C.ink) end
local function rect(c,x,y,w,h,col) U.outlinedRect(im,X(c,x),y,w,h,col,C.ink) end
local function line(c,x1,y1,x2,y2,col,t) U.outlinedLine(im,X(c,x1),y1,X(c,x2),y2,col,C.ink,t or 3) end
local function eye(c,x,y,col) rect(c,x,y,4,4,col) end
local function shoulder(c,col,w) ell(c,48,83,w or 33,17,col) end

-- Scrap Tabby: compact head, notched triangular ears, tin-lid guard/scarf.
shoulder(0,C.amber,30); line(0,30,30,22,11,C.amber,6); line(0,66,30,74,12,C.amber,6)
ell(0,48,45,25,25,C.amber); line(0,23,19,31,22,C.ink,3); ell(0,48,58,16,12,C.cream)
cir(0,48,57,4,C.rust); eye(0,37,43,C.cyan); eye(0,57,43,C.cyan)
cir(0,72,72,12,C.steel); line(0,25,76,55,86,C.teal,5)

-- Bolt Hound: long low muzzle and strongly asymmetric swept ears.
shoulder(1,C.navy,34); line(1,33,35,18,8,C.navy,7); line(1,61,31,68,14,C.navy,5)
ell(1,46,44,28,21,C.steel); ell(1,59,53,26,12,C.steelHi); cir(1,75,53,4,C.charcoal)
eye(1,43,39,C.cyan); line(1,22,72,70,78,C.rust,5); rect(1,27,66,12,17,C.cyan)

-- Volt Lynx: tall narrow face, high tufts and compact sensor harness.
shoulder(2,C.violet,25); line(2,33,30,27,5,C.violet,5); line(2,63,30,69,5,C.violet,5)
line(2,28,9,22,1,C.cream,3); line(2,68,9,74,1,C.cream,3)
ell(2,48,42,20,30,C.violet); ell(2,48,55,13,15,C.steelHi)
line(2,29,39,68,37,C.cyan,4); eye(2,37,41,C.cyan); eye(2,57,41,C.cyan)
rect(2,39,70,18,12,C.charcoal); cir(2,58,77,4,C.cyan)

-- Brass Boar: broad plate, wedge snout and two unmistakable tusks.
shoulder(3,C.brass,41); ell(3,48,42,34,25,C.ox); ell(3,48,54,24,15,C.brass)
ell(3,48,53,15,10,C.cream); cir(3,42,53,3,C.charcoal); cir(3,54,53,3,C.charcoal)
line(3,30,55,24,68,C.cream,5); line(3,66,55,72,68,C.cream,5)
eye(3,34,38,C.cream); eye(3,58,38,C.cream); rect(3,22,72,52,17,C.brass)

-- Ember Cougar: low round ears, strong muzzle, controlled vent mantle.
shoulder(4,C.charcoal,33); cir(4,28,27,9,C.rust); cir(4,68,27,9,C.rust)
ell(4,48,44,27,25,C.rust); ell(4,48,57,17,12,C.cream); cir(4,48,54,4,C.charcoal)
eye(4,36,41,C.amber); eye(4,57,41,C.amber); rect(4,20,70,56,17,C.charcoal)
for x=30,62,16 do line(4,x,72,x,83,C.amber,3) end

-- Scrap Weasel: long small head, asymmetric salvage satchel and coil.
shoulder(5,C.olive,25); ell(5,44,37,18,29,C.cream); ell(5,53,54,19,11,C.cream)
cir(5,69,54,3,C.charcoal); eye(5,43,36,C.teal); line(5,24,63,65,89,C.rust,6)
rect(5,58,67,28,24,C.olive); cir(5,72,78,9,C.cyan); cir(5,72,78,4,C.charcoal)

-- Rattle Raptor: side-profile beak, monocular optic and tail-base harness.
shoulder(6,C.teal,27); ell(6,43,40,22,25,C.cream)
line(6,54,39,82,48,C.cream,8); line(6,53,48,78,49,C.brass,5)
cir(6,43,37,8,C.charcoal); cir(6,43,37,4,C.magenta); line(6,43,37,68,31,C.magenta,2)
rect(6,28,67,37,18,C.teal); line(6,61,76,89,88,C.teal,6)

-- Piston Ram: symmetric horn arcs, box chest and pressure gauge.
shoulder(7,C.cobalt,34); ell(7,48,40,20,22,C.steelHi)
line(7,31,42,17,31,C.cream,7); line(7,17,31,25,13,C.cream,7)
line(7,65,42,79,31,C.cream,7); line(7,79,31,71,13,C.cream,7)
eye(7,38,40,C.cyan); eye(7,55,40,C.cyan); rect(7,27,63,42,27,C.cobalt)
cir(7,48,72,9,C.cream); line(7,48,72,54,67,C.rust,2); line(7,27,77,15,87,C.steel,7); line(7,69,77,81,87,C.steel,7)

spr:saveAs("assets-src/characters/identity/source/mercenary-portraits-atlas.pxo")
