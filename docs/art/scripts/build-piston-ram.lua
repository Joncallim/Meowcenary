-- Alpha 3 production redraw: horned pressure-driven automaton.
local U=dofile("docs/art/scripts/lib/sprite-utils.lua"); local P=dofile("docs/art/scripts/lib/production-mercenary.lua")
P.build({archetype="ram",output="assets-src/characters/piston-ram/source/piston-ram.pxo",colors={chest=U.hex("#35465a"),face=U.hex("#c9c3b6"),horn=U.hex("#b79558"),dark=U.hex("#252a32"),metal=U.hex("#66717d"),eye=U.hex("#ffd166"),power=U.hex("#315e9c"),gauge=U.hex("#ece6cf"),redline=U.hex("#f06a3d"),highlight=U.hex("#d2aa5b")}})
