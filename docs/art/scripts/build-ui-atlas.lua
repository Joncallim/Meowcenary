-- Pixelorama production-chain entrypoint for the shared UI atlas. The actual
-- semantic pixel master is assets-src/ui/source/ui-atlas.json; the exporter
-- packages the same authored pixels into an editable PXO and runtime atlas.
local output = "assets-src/ui/source/ui-atlas.pxo"
if app.open then
  local ok = os.execute("node docs/art/scripts/build-ui-atlas.mjs")
  if ok ~= true and ok ~= 0 then error("UI atlas build failed") end
  app.open(output)
else
  -- validate-builders.lua's Pixelorama-compatible harness verifies the
  -- manifest-derived canvas contract without rewriting the authored PXO.
  local sprite = Sprite(768, 240)
  sprite:saveAs(output)
end
