-- Build: Trash Brute native raster master.
local Native = dofile("docs/art/scripts/lib/native-raster-actor.lua")
Native.build({
  id = "trash-brute",
  raster = "assets-src/enemies/trash-brute/source/trash-brute-native-raster.lua",
  output = "assets-src/enemies/trash-brute/source/trash-brute.pxo",
})
