-- external-production-importer: pinned native weapon tier master; CANDIDATE.
-- Historical procedural recipe is archived in lib/epic16-weapon-art.lua.
local ok = os.execute("python3 docs/art/scripts/build-weapon-production-art.py")
if ok ~= true and ok ~= 0 then error("candidate weapon tier import failed") end
