-- Alpha 3 production redraw: precision hunter with beak and stabilising tail.
local U=dofile("docs/art/scripts/lib/sprite-utils.lua"); local P=dofile("docs/art/scripts/lib/production-mercenary.lua")
P.build({archetype="raptor",output="assets-src/characters/rattle-raptor/source/rattle-raptor.pxo",colors={feather=U.hex("#d9cfaa"),cream=U.hex("#fff2cf"),beak=U.hex("#ba8749"),teal=U.hex("#236b6d"),dark=U.hex("#173638"),eye=U.hex("#ffcf4a"),harness=U.hex("#315257"),optic=U.hex("#30273f"),glow=U.hex("#f055ba"),metal=U.hex("#a48652")}})
