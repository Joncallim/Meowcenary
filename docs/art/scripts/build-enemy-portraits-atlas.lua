-- external-production-importer: build-enemy-production-art.py derives the
-- shared menu portrait atlas from the exact selected enemy production sheets.
local output = "assets-src/enemies/source/enemy-portraits-atlas.pxo"
if app.open then
  local ok = os.execute("python3 docs/art/scripts/build-enemy-production-art.py")
  if ok ~= true and ok ~= 0 then error("Enemy portrait atlas build failed") end
  app.open(output)
else
  local sprite = Sprite(2560, 256)
  sprite:saveAs(output)
end
