-- external-production-importer: build-navigation-concept-atlas.py crops the
-- two selected generated-source boards into one production navigation atlas.
-- This entrypoint preserves manifest-derived builder discovery and lets a
-- Pixelorama operator rebuild and open the editable source in one command.
local output = "assets-src/ui/source/navigation-icons-atlas.pxo"
if app.open then
  local ok = os.execute("python3 docs/art/scripts/build-navigation-concept-atlas.py")
  if ok ~= true and ok ~= 0 then error("Navigation art build failed") end
  app.open(output)
else
  local sprite = Sprite(1920, 192)
  sprite:saveAs(output)
end
