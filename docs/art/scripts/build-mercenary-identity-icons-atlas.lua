-- external-production-importer: build-mercenary-identity-concept-atlas.py
-- crops the selected 4x4 generated-source board into the production atlas.
local output = "assets-src/characters/identity/source/mercenary-identity-icons-atlas.pxo"
if app.open then
  local ok = os.execute("python3 docs/art/scripts/build-mercenary-identity-concept-atlas.py")
  if ok ~= true and ok ~= 0 then error("Mercenary identity icon build failed") end
  app.open(output)
else
  local sprite = Sprite(1536, 96)
  sprite:saveAs(output)
end
