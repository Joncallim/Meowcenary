-- Build: Dust Mite native raster master.
local Native = dofile("docs/art/scripts/lib/native-raster-actor.lua")
Native.build({
  id = "dust-mite",
  raster = "assets-src/enemies/dust-mite/source/dust-mite-native-raster.lua",
  output = "assets-src/enemies/dust-mite/source/dust-mite.pxo",
})
