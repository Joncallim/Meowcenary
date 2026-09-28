-- external-production-importer: approved Figma Clean Master derivative.
local ok = os.execute("python3 docs/art/scripts/build-approved-brand-assets.py")
if ok ~= true and ok ~= 0 then error("approved brand asset build failed") end
