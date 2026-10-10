# Seeded arenas and tactical world interactions (#233 / #194)

This implements the bounded #194 design handoff from draft #231 against main
`a100e053`, then adds the newer #233 raised-cover and hazard interaction scope.
It does not replace stage objectives or add persistence fields.

Menu resolves one immutable layout before physical resource loading and sends
that exact result to GameScene. The game verifies arena, seed, content version,
generation version, boss witness presence, and canonical hash before entities.
Scenery, collision, spawn system, boss/player anchors, hazards, safe weapon
rewards, and performance-fixture spawning consume its `arena`; floor presentation
consumes its explicit tile plan. Runtime does not regenerate production geometry.
A headless caller without a captured run request retains explicit compatibility
resolution. Contract intro integration must retain this prepared result.

Generation is opt-in validated data: authored obstacle IDs form the paired
footprint/skin archetype palette. Zone ordering and palette ordering are canonical.
A dedicated `arena-layout:contentVersion:arenaId:generationVersion` named stream
is derived from the seed and never shares combat/loot/spawn draws. Two fixed
landmarks stay in place; 2–3 additional raised landmarks vary collision. Junkyard
uses broad broken clusters; Forge uses machinery lanes. 12–20 extra quiet props
and coarse floor patches provide seeded presentation. Fixed gate topology and
world/camera extents stay unchanged. Decorations avoid generated collision,
hazards, spawn reserves, and gate strips.

Budgets: 32-unit placement grid, 4096 candidates, eight complete attempts, five
total obstacles, 48 total decorations. Geometry uses a separate 8-unit grid capped
at 65,536 cells, imported player radius plus 8 clearance, conservative inflated
AABB occupancy and four-neighbor connectivity. Start/boss have 96-unit placement
reserves; gates retain full-width 128-unit inward strips. New blockers have
64-unit raw separation and a 64-unit world inset; total obstruction ≤18% area.
All witness attachment uses exact-clearance segments within 32 units. Rect/ring
spawn regions and ordinary edges also supply witnesses. No runtime pathfinding.
An exhausted solver uses the already-validated authored baseline with diagnostics;
an unsafe authored baseline aborts launch. Authored arenas use the same boundary.

Terminal Replay/Retry draws exactly one fresh menu seed through a pure reseed
helper. A loading Retry keeps the captured request and layout. Navigating away
from a failed launch abandons it. Existing asynchronous generation guards remain
across texture/audio preparation and shutdown.

## Raised blockers are tactical cover

Existing tall press/barrel/machinery landmark art corresponds to solid body
footprints. `blocksEnemyProjectiles` marks raised cover: hostile shots now hit
that footprint before a protected player. Low decorative props do not gain
collision. A swept segment prevents fast shots tunneling; earliest contact wins,
with cover winning exact ties. Pool reset consumes the shot without rewards or
combat hit facts. Player auto-fire stays unchanged so movement remains the only
required aiming input. This is raised obstruction/cover, not a claim of walkable
platforms, climbing, jumping, or cosmetic height changing actor elevation.

## Heat crossing windows

Forge's existing heat-grate footprint/art stays fixed and gains a data-authored
cycle: 2400ms safe, 900ms warning, 1700ms damaging, 10 damage/sec when active.
The grate is dim/cool while safe, pulses amber in warning, and becomes full-bright
red when damaging. Exact active-duration integration preserves damage across
frame boundaries for stationary occupancy; position is sampled per simulation tick. Simulation updates own elapsed time; pause/inactive player
stops the system. Safe connectivity always excludes hazards even while inactive,
so a route never requires taking damage. No hazard-only asset substitutions.

## Primary references and limits

- [Phaser Arcade Physics](https://docs.phaser.io/phaser/concepts/physics/arcade):
  static bodies are fixed collision bodies; art and physics positions must stay
  explicitly synchronized. Inspected 2026-10-10.
- [Phaser collision events](https://docs.phaser.io/api-documentation/event/physics-arcade-events):
  overlaps and collisions are separate, informing the explicit hostile-shot
  contact owner. Inspected 2026-10-10.

These references support implementation semantics, not claims of benchmark
playtesting. Desktop/mobile browser captures are simulated viewport evidence;
physical-device/controller checks remain separate. Subjective map fun and visual
readability require human playtesting beyond deterministic correctness tests.

Design benchmark: [Funday's official Deep Rock Galactic: Survivor page](https://www.fundaygames.dk/deep-rock-galactic-survivor)
places mining and environmental navigation alongside automatic shooting. This
supports treating positioning around terrain as a player decision while attacks
remain automatic; it is inspiration rather than a claim that Meowcenary now has
mining/destructible terrain. The [official Deep Rock Galactic site](https://www.deeprockgalactic.com/)
also presents different cave layouts as part of exploration. Both inspected
2026-10-10. Our bounded two-arena solver deliberately keeps fixed theme anchors.
