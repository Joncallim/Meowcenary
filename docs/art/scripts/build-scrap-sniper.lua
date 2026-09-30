-- Build: Scrap Sniper native raster master.
local Native = dofile("docs/art/scripts/lib/native-raster-actor.lua")
Native.build({
  id = "scrap-sniper",
  raster = "assets-src/enemies/scrap-sniper/source/scrap-sniper-native-raster.lua",
  output = "assets-src/enemies/scrap-sniper/source/scrap-sniper.pxo",
})
