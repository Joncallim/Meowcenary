-- Pixelorama production-chain entrypoint for the authored brand atlas. The
-- deterministic exporter preserves the reviewed native pixels and PXO source.
local output = "assets-src/ui/source/brand-art.pxo"
if app.open then
  local ok = os.execute("node docs/art/scripts/build-brand-art.mjs")
  if ok ~= true and ok ~= 0 then error("Brand art build failed") end
  app.open(output)
else
  local sprite = Sprite(480, 544)
  sprite:saveAs(output)
end
