-- Pixelorama production-chain entrypoint for the authored brand atlas. The
-- deterministic exporter preserves the reviewed native pixels and PXO source.
local ok = os.execute("node docs/art/scripts/build-brand-art.mjs")
if ok ~= true and ok ~= 0 then error("Brand art build failed") end
