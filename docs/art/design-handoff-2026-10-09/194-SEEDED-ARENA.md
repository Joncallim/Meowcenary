# #194 — constrained seeded arena composition

Status: bounded implementation design. Base main `a100e053ce4e2bc48bc4b8844e7da5010d562096`. #195 framing prerequisite already landed in #213; preserve its measured per-edge actor+shadow framing. No new world artwork is required.

## Ownership and file targets

Add pure `src/gameplay/arenaLayout.ts`, `src/gameplay/arenaLayoutValidation.ts`, and focused tests. Modify `src/data/arenas.json` for opt-in generation profiles; `src/systems/arenas.ts` / existing catalog validation for schema; `src/systems/resourceLoader.ts`, `src/scenes/MenuScene.ts`, `src/scenes/GameScene.ts`, `src/systems/arenaScenery.ts` for one resolved boundary; `src/gameplay/runRequest.ts` for pure reseeding. Extend existing arena, spawn-feasibility, camera, resource and RNG tests. Do not add arena-ID branches to GameScene.

## One immutable launch result

Menu captures request, resolves RunPlan/template and **resolves layout once before physical resources**. The same immutable layout enters resource closure and GameScene collision/hazards/spawn/scenery. GameScene verifies arena ID, run seed, contentVersion, generationVersion and layout hash before entities; mismatch fails launch. It must never reroll or recompute partial geometry.

Generation tuple: `contentVersion + arenaId + runSeed + generationVersion`. Derive a dedicated named `arena-layout` RNG; stable-sort zones/archetypes/candidate cells by stable identity before any draws. Do not touch loot/spawn/upgrade/combat streams. No persistence fields.

Consumer audit is explicit: Player start, physics obstacle bodies, `WeaponRewardSystem` safe-drop bounds/obstacles, `SpawnSystem`, boss placement, `HazardSystem` hazards/skins, `ArenaWorldView`, and `preparePerformanceFixture()` must all use resolved geometry. The performance fixture currently re-fetches the static arena; remove that stale geometry path while retaining its separate performance RNG.

Current start is derived at `(width/2, height/2)`. Current boss spawn is derived at `(width/2, max(80, height*0.2))` when a boss exists; neither is currently an authored anchor row. The resolver must reserve and expose those derived witnesses, preserving their existing semantics. Gates retain current authored side/offset/width and inward witness. Do not invent moved objective/boss positions during this tranche.

## Resolved model

Layout owns size, spawn regions, start/reserved regions, paired obstacle instances, paired hazard instances, floor plan and decorative nodes. Each collision-bearing instance has one stable runtime instanceId, archetypeId, footprint, world position and logical art ID. The collision and art cannot be independently selected arrays. Source ArenaDefinition remains catalog identity/template.

Generation is opt-in. An arena without a profile returns the authored geometry/visual plan through this same resolved type. Fixed anchors stay fixed; variable placements cannot remove required landmarks or move gates unless the profile explicitly owns that variation.

## First shippable composition

- Keep Junkyard/Forge sizes, boundary sides and gate topology.
- Preserve authored boss/objective/start anchors and dangerous hazard placement initially.
- Keep the two fixed collision landmarks, then select/place 2–3 additional collision instances from the arena's existing collision-bearing landmark palette, for 4–5 TOTAL obstacles. Do not promote a noncolliding crate/tyre decoration into collision without a separately authored archetype.
- Keep the 14 fixed decorations and add 12–20 variable low/ground decorations, for 26–34 TOTAL; hard cap 48 total. Seed the floor tile/patch plan.
- Junkyard: broken scrap clusters and uneven clear routes. Forge: machinery masses and deliberate industrial lanes. These are palette/zone choices, not arena-specific algorithm branches.

All art IDs, collision dimensions, skins and offsets come from current catalog rows; enumerate these in the implementation fixture rather than inventing new assets. The floor variation is explicit deterministic presentation data, replacing the current fixed coordinate formula in `ArenaWorldView.buildFloor`.

Initial collision palettes are concrete, all 64×64: Junkyard `hanging-press → world:landmark:hanging-press`, `barrel-power-stack → world:landmark:barrel-power-stack`; Forge `furnace-throat → world:forge-landmark:furnace-throat`, `cooling-manifold → world:forge-landmark:cooling-manifold`. Variable instance IDs must be distinct from the two existing fixed IDs. Decoration palettes reuse each arena's current decoration art IDs and layers. Floor arrays retain index 0 as base and remaining authored patch roles; stable-sort only unordered candidate collections, never reorder semantic floor roles.

## Finite solver contract

Initial design caps, to be committed as named constants with tests: grid cell size 32 world units; no more than 4096 candidate cells; 8 full-layout attempts; 5 TOTAL obstacles including fixed anchors; 48 TOTAL decorations including fixed rows. Current 768×1344 arenas need 24×42 = 1008 cells. Validate configured arena extents against the cap before allocation. These are safety budgets, not measured performance claims.

For each attempt: build finite legal candidates; apply stable ordering; deterministically shuffle using layout stream; consume without replacement; choose bounded target count; pair archetype and footprint; reject overlap, out-of-bounds or reserved-zone intrusion; finish all requested collision before validation. Never silently accept a partial map because attempts ran out.

Validation inflates collision with imported `PLAYER_BODY_RADIUS` (currently 14) plus authored 8-unit margin. Use a separate 8-unit validation grid (not the 32-unit placement grid), maximum 65,536 cells; current arenas use 96×168 = 16,128 cells. Four-neighbor flood-fill marks every cell intersecting inflated AABBs occupied, not only cells whose centers fall inside, and forbids diagonal corner cutting. Required routes need at least 44 units of raw clearance for current radius+margin; authored obstacle separation is 64 units between raw AABBs. Use a 96-unit player-start reserve, 96-unit boss reserve around the derived spawn when present, and each existing gate's full 96-wide ingress strip extending 128 units inward as exclusions for NEW generated objects. Existing fixed geometry is retained and separately checked for actual spawn/body clearance; broad new-placement reserve circles do not retroactively outlaw the authored hazard. Bound placement to an arena inset of 64 units, subtract fixed collision/hazards/reservations, and cap raw obstacle area at 18% of arena area. Treat hazard footprint plus player clearance as unavailable when validating safe connectivity; no new hazard generation in this tranche. Every active gate ingress and present boss/objective witness must connect to the reachable region. This is not runtime enemy pathfinding.

Regression fixture: Forge's current boss spawn `(384, 268.8)` lies 35.2 units above the heat grate at y304. A conservative 32-unit validation cell would falsely mark its containing cell blocked after 22-unit inflation; the separate 8-unit validation grid avoids that specific false failure. For any witness not in a free cell, allow attachment only by an exact-clearance continuous segment to a reachable free-cell center within 32 units, using segment-versus-inflated-AABB/bounds checks; otherwise reject. Test both authored baselines through the full validator before enabling generation. Do not weaken safety or move a boss to make a test pass.

If no full candidate validates, select the same arena's already validated authored baseline, run it through the same validator, and emit seed/tuple/failed invariant/fallback reason in diagnostics. If baseline is invalid, fail launch with recoverable Menu error; never start unsafe partial physics. An impossible test profile must deterministically produce baseline or explicit launch error, never hang.

## Replay and asynchronous lifecycle

Player terminal Replay/Retry preserves character + stage/arena identity but obtains exactly one new seed from Menu RNG, then passes that value to a pure request-reseed helper and the normal launch gate. A resource-load Retry for a failed preparation preserves that captured request/seed/layout; it does not consume another menu seed. Development exact-seed reproduction is explicit and separate. Do not bare-restart GameScene. Resolved results carry contentVersion, generationVersion, stable hash and an explicit authored-baseline/fallback diagnostic flag.

Keep Menu's existing runLaunchGeneration checks across serialized texture/audio loads. Back/new launch/shutdown revokes old prepared layout/resource results. Layout resolution is synchronous pure work within bounded cost; do not introduce a worker/cache invalidation system for this first scope.

Resource closure walks selected resolved art plus required fixed boundary/gates. Validate all palette references at catalog load, but do not load unused palette resources merely because they exist. Physical atlas granularity may load sibling frames in an already-required atlas; report physical resource counts honestly.

## Visual layout evidence

Provide a fixed seed cohort for both Junkyard and Forge: seeds 1, 2, 3, 42, 4294967295 plus a selected fallback fixture. Each review image overlays the same collision AABBs, start-safe zone, gate ingress witnesses and traversable connectivity mask on its actual rendered scenery. Include uncluttered player-facing capture beside debug evidence; debug overlays are never production UI. Show two materially different normal seeds and same-seed reproduction side by side.

## Regression/acceptance

- Same full tuple gives deep-equal canonical layout and stable hash; permutations of unordered zone/archetype maps do not alter it. Do not permute semantic floor base/patch order.
- Different-seed cohort yields collision variation, not only floor cosmetics. Record exact expected hashes after reviewing fixtures; do not choose random seeds in golden tests.
- No cross-stream RNG change. Save bytes and gameplay rewards unaffected.
- Every generated instance has exact matching collider/art and remains in bounds, outside reserved zones, non-overlapping and connected to required witnesses.
- Impossible/extreme profiles are rejected early or use deterministic validated fallback within caps.
- Launch closure includes every chosen world resource; mismatched tuple/missing art fails before entity construction.
- Replay fresh seed, diagnostic replay same seed; old launch cannot publish after new navigation.
- Camera/physics rectangle and measured per-edge sprite+shadow framing remain unchanged. Browser captures at supported phone/landscape/desktop sizes cover multiple fixed seeds and edge ingress.

Stop after this bounded two-arena composition. No infinite rooms, navmesh, procedural objectives, new environment art or economy changes.
