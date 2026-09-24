-- Alpha 3 production redraw: wide/tusked brass tank.
local U=dofile("docs/art/scripts/lib/sprite-utils.lua"); local P=dofile("docs/art/scripts/lib/production-mercenary.lua")
P.build({archetype="boar",output="assets-src/characters/brass-boar/source/brass-boar.pxo",colors={fur=U.hex("#6f3f2d"),muzzle=U.hex("#b46d3c"),tusk=U.hex("#fff0bd"),dark=U.hex("#292524"),eye=U.hex("#ffd166"),metal=U.hex("#b98a3d"),highlight=U.hex("#ffe19a"),strap=U.hex("#6b2530")}})
