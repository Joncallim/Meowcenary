-- external-production-importer: build-gunsmith-tier-art.py imports pinned native component rasters.
-- This wrapper never draws or reconstructs component geometry.
local command = "python3 docs/art/scripts/build-gunsmith-tier-art.py"
if not app or not app.open then command = command .. " --check" end
local ok = os.execute(command)
assert(ok == true or ok == 0, "native Gunsmith tier import parity failed")
if app and app.open then app.open("assets-src/gunsmith/tiers/source/gunsmith-tier-icons-atlas.pxo") end
