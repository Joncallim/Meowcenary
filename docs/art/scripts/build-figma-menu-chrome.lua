-- external-production-importer: exact pinned Figma SVG menu chrome; CANDIDATE.
-- The importer writes normalized, editable Pixelorama pixels as well as PNG/JSON.
local ok = os.execute("python3 docs/art/scripts/build-figma-menu-chrome.py")
if ok ~= true and ok ~= 0 then error("candidate Figma menu chrome import failed") end
