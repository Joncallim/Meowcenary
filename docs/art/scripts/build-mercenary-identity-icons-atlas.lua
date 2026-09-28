-- Eight active and eight passive icons. Active frames are open/radial;
-- passives use a quieter closed hex frame. Symbols follow the canonical brief.
local U=dofile("docs/art/scripts/lib/sprite-utils.lua")
local C={ink=U.OUTLINE,steel=U.hex("#475569"),hi=U.hex("#94a3b8"),cream=U.hex("#f4edd0"),cyan=U.hex("#67e8f9"),teal=U.hex("#2dd4bf"),orange=U.hex("#f97316"),hot=U.hex("#fbbf24"),rust=U.hex("#a94f32"),dark=U.hex("#1b2530"),brass=U.hex("#b98835"),cobalt=U.hex("#315eae")}
local S=32 local spr=U.makePropSprite(S*16,S) local im=U.getCel(spr,"body",1).image U.clear(im)
local function X(c,x)return c*S+x end
local function line(c,x1,y1,x2,y2,col,t)U.outlinedLine(im,X(c,x1),y1,X(c,x2),y2,col,C.ink,t or 2)end
local function rect(c,x,y,w,h,col)U.outlinedRect(im,X(c,x),y,w,h,col,C.ink)end
local function cir(c,x,y,r,col)U.outlinedCircle(im,X(c,x),y,r,col,C.ink)end
local function ell(c,x,y,rx,ry,col)U.outlinedEllipse(im,X(c,x),y,rx,ry,col,C.ink)end
local function active(c,col) line(c,4,10,8,5,col,2);line(c,8,5,14,3,C.steel,2);line(c,18,3,24,5,C.steel,2);line(c,24,5,28,10,col,2);line(c,4,22,8,27,col,2);line(c,24,27,28,22,col,2) end
local function passive(c,col) line(c,7,6,16,3,C.steel,2);line(c,16,3,25,6,C.steel,2);line(c,25,6,28,16,col,2);line(c,28,16,25,26,C.steel,2);line(c,25,26,16,29,C.steel,2);line(c,16,29,7,26,C.steel,2);line(c,7,26,4,16,col,2);line(c,4,16,7,6,C.steel,2) end

-- Active: Scrap Burst, jagged nut plus four impact wedges.
active(0,C.hot); cir(0,16,16,6,C.steel); cir(0,16,16,2,C.dark); for _,p in ipairs({{16,5,16,9},{16,23,16,27},{5,16,9,16},{23,16,27,16}})do line(0,p[1],p[2],p[3],p[4],C.hot,2)end
-- Giga Chomp: canine jaw bites a repair biscuit with one healing spark.
active(1,C.teal); line(1,7,10,14,15,C.hi,4);line(1,7,22,14,17,C.hi,4);line(1,14,15,25,12,C.cream,2);line(1,14,17,25,20,C.cream,2);cir(1,20,16,3,C.teal);line(1,26,6,26,10,C.hot,1);line(1,24,8,28,8,C.hot,1)
-- Adrenaline: lean paw/leg crosses speedometer arc.
active(2,C.cyan); line(2,6,20,11,9,C.cream,4);line(2,11,9,18,16,C.cream,4);line(2,18,16,26,12,C.cyan,3);line(2,7,24,25,24,C.steel,2);line(2,8,22,5,19,C.cyan,1)
-- Shield Flicker: separated hex segments around a protected centre.
active(3,C.cyan); line(3,8,8,15,4,C.cyan,2);line(3,18,4,25,8,C.cyan,2);line(3,27,12,27,19,C.hi,2);line(3,23,24,17,28,C.cyan,2);line(3,14,28,8,24,C.hi,2);line(3,5,20,5,13,C.cyan,2);cir(3,16,16,3,C.cream)
-- Heat Vent: grille plus three short outward heat waves.
active(4,C.orange); rect(4,8,12,12,10,C.steel);for x=11,17,3 do line(4,x,14,x,20,C.cream,1)end;line(4,21,13,26,9,C.orange,2);line(4,22,17,28,17,C.hot,2);line(4,21,21,26,25,C.orange,2)
-- Scavenge Pulse: coil sends angular rings to an XP mote and bolt.
active(5,C.teal);cir(5,10,17,4,C.steel);line(5,14,12,19,8,C.cyan,1);line(5,14,22,20,26,C.cyan,1);line(5,17,12,23,10,C.teal,1);line(5,17,21,23,23,C.teal,1);cir(5,26,9,2,C.cyan);rect(5,24,21,5,3,C.cream)
-- Precision Mark: hostile head, diamond weak point and piercing line.
active(6,C.orange);ell(6,14,16,6,5,C.steel);cir(6,14,16,2,C.orange);line(6,18,16,29,16,C.cream,2);line(6,22,12,26,16,C.orange,1);line(6,26,16,22,20,C.orange,1);line(6,22,20,18,16,C.orange,1)
-- Overclock: gear/piston, redline gauge and motion ticks.
active(7,C.orange);cir(7,13,17,6,C.steel);cir(7,13,17,2,C.cream);rect(7,19,10,5,13,C.hi);line(7,21,11,25,7,C.orange,2);line(7,25,7,28,9,C.hot,1);line(7,24,24,28,22,C.orange,1)

-- Passives begin at cell 8.
-- Scrap Hoarder: open pouch facing two loose fragments, explicitly no magnet.
passive(8,C.rust);line(8,9,13,12,25,C.rust,3);line(8,12,25,22,25,C.rust,3);line(8,22,25,24,13,C.rust,3);line(8,9,13,24,13,C.cream,2);rect(8,24,9,4,4,C.hi);rect(8,26,17,3,5,C.orange)
-- Quick Tail: swept canine tail and short speed ticks.
passive(9,C.cyan);line(9,8,22,16,23,C.hi,4);line(9,16,23,25,13,C.hi,4);line(9,25,13,22,8,C.hi,3);line(9,7,11,13,11,C.cyan,1);line(9,5,16,11,16,C.cyan,1)
-- Light Paws: two narrow paw prints with air gap.
passive(10,C.cyan);ell(10,11,20,4,6,C.cream);cir(10,8,13,2,C.cyan);cir(10,12,11,2,C.cyan);ell(10,22,13,4,6,C.cream);cir(10,20,6,2,C.cyan);cir(10,24,5,2,C.cyan)
-- Thick Hide: three nested plate layers, not an active shield.
passive(11,C.brass);line(11,7,9,25,9,C.hi,3);line(11,9,14,23,14,C.steel,3);line(11,11,19,21,19,C.brass,3);line(11,13,24,19,24,C.cream,2)
-- Ember Aura: contained ember inside dark vent ring.
passive(12,C.orange);cir(12,16,16,10,C.dark);cir(12,16,16,6,C.steel);line(12,16,21,12,16,C.orange,3);line(12,12,16,17,9,C.hot,3);line(12,17,9,20,17,C.orange,3);line(12,20,17,16,21,C.hot,3)
-- Magnet Belly: belt coil embraces one bolt; no pulse rings.
passive(13,C.teal);line(13,5,12,27,12,C.rust,3);line(13,10,13,10,23,C.cyan,3);line(13,10,23,21,23,C.cyan,3);line(13,21,23,21,16,C.cyan,3);rect(13,15,16,9,4,C.cream)
-- Hunter Eye: angular optic and one long range line, no target tag.
passive(14,C.magenta);line(14,5,16,11,10,C.hi,3);line(14,11,10,19,11,C.hi,3);line(14,19,11,24,16,C.hi,3);line(14,24,16,19,21,C.hi,3);line(14,19,21,11,22,C.hi,3);line(14,11,22,5,16,C.hi,3);cir(14,15,16,3,C.magenta);line(14,19,16,29,16,C.cyan,1)
-- Hydraulic Core: paired pistons around a rotating core, no redline gauge.
passive(15,C.cyan);rect(15,6,9,6,15,C.steel);rect(15,22,9,5,15,C.steel);line(15,12,13,16,16,C.hi,2);line(15,22,13,18,16,C.hi,2);cir(15,17,17,6,C.cobalt);cir(15,17,17,2,C.cream);line(15,14,23,20,23,C.teal,1)

spr:saveAs("assets-src/characters/identity/source/mercenary-identity-icons-atlas.pxo")
