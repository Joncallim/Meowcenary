-- external-production-importer: build-menu-semantic-concept-atlas.py crops
-- selected Contract and Settings boards into one bounded production atlas.
local output = "assets-src/ui/source/menu-semantic-icons-atlas.pxo"
if app.open then
  local ok = os.execute("python3 docs/art/scripts/build-menu-semantic-concept-atlas.py")
  if ok ~= true and ok ~= 0 then error("Menu semantic icon build failed") end
  app.open(output)
else
  local sprite = Sprite(1056, 96)
  sprite:saveAs(output)
end
