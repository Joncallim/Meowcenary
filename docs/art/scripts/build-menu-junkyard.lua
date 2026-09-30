-- external-production-importer: build-menu-backdrops.py imports the selected
-- generated master into the editable/runtime Junkyard backdrop chain.
local output = "assets-src/ui/backdrops/source/menu-junkyard.pxo"
if app.open then
  local ok = os.execute("python3 docs/art/scripts/build-menu-backdrops.py")
  if ok ~= true and ok ~= 0 then error("Menu backdrop build failed") end
  app.open(output)
else
  local sprite = Sprite(768, 512)
  sprite:saveAs(output)
end
