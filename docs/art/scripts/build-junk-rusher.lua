-- Build: Junk Rusher native raster master.
local Native = dofile("docs/art/scripts/lib/native-raster-actor.lua")
Native.build({
  id = "junk-rusher",
  raster = "assets-src/enemies/junk-rusher/source/junk-rusher-native-raster.lua",
  output = "assets-src/enemies/junk-rusher/source/junk-rusher.pxo",
})
