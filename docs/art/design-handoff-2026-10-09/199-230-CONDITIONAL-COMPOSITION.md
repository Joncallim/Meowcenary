# #199 / #230 — conditional Mercenary composition contract

**HOLD.** #230 now owns the focused eight-Mercenary redesign and its directional/art decision. This packet records durable invariants and current evidence only. It is not permission to implement sockets, a renderer or all eight sheets. Jonathan must approve the directional model, sprite style and composition evidence first.

## Canonical boundary

Preserve eight actual anatomy/identity briefs. Rejected recoloured-cat sheets are non-canonical. #174's owner statement “Works now” is narrow evidence of the existing distinction; it does not cancel the requested full redesign. #175 includes authored contact shadows as well as sprites. Enemy/boss polish remains #175 scope outside this focused Mercenary tranche.

## Current main facts that change the design

- Character sources are 48×48, 16 frames (4 idle, 6 run, 2 hurt, 4 defeat), right-facing with mirror. This is a comparison baseline, not approved future topology.
- `ActorView` has a 1.55 character presentation multiplier over 28×28 logical display. Actual world display is 43.4 units before camera zoom.
- Player updates facing only for nonzero horizontal movement; pure up/down holds previous horizontal facing.
- `Player.ts` creates a circle shadow; `ActorView.writeCompleteWorldBounds` already includes it. Replace the existing shadow owner, do not stack another shadow or lose framing.
- Current wearable IDs resolve to existing three-quarter Equipment icon atlas frames. Gloves/boots are drawn as pairs. They are semantic/material references, not per-limb/front/back-ready overlays.
- `HeldWeaponView` owns one node for the latest successful shot, visible 110 ms; it uses actual heldId/tier, root position, continuous target-central aim, recoil and flipY for left. `WeaponSystem` iterates equipped weapons in order, so the last successfully fired entry wins same-tick presentation. This is existing presentation policy, not a new active-weapon mechanic.

## Direction decision inputs

Compare the same canonical Tabby and Hound at fixed body scale, same floor, loadout, weapon/tier, movement vector and aim vector. 2-direction repeats side view for vertical movement; 4-direction must show genuine front/back. If side mirroring is accepted, record physical ear/guard/bracer asymmetry compromise explicitly. Eight directions only after four-direction evidence shows a material unresolved visual problem.

Separate movement facing from authoritative shot aim. Stationary firing-facing versus held last movement-facing is a design choice to demonstrate, not silently decide in code. Fast multi-rack fire must not whip the body among targets. Do not rotate the entire actor to fake a missing direction.

Production count becomes `authored directions × 16 frames × 8 characters`, plus bounded directional wearable/source work. For two-direction mirror this is 128 base frames; four genuinely authored directions 512; four directions with one side mirrored 384; eight genuinely authored directions 1024. These are base-frame counts only, not total art budget. Do not present mirroring a side as four independently authored directions.

## Invariants that survive every choice

One immutable run-start loadout snapshot feeds mechanics, resolved appearance and exact physical resource closure before loading. Gameplay does not reread mutable save to choose visuals later. Candidate loadout preview is pure and revocable; failed save/commit must not display as committed gear.

Use current `DataEquipmentVisualRegistry` for equipmentId+tier → canonical art identity. The resolver does not infer tiers or sets from texture names. A new directional wearable representation, if approved, stays presentation data; no new Save V4 appearance fields and no equipment stat changes.

One composite player view owns base, shadow, wearable pieces and mount transforms, with one lifecycle. No scene-local chase of accessories, no per-frame object/texture allocation, no physics changes. Shared wearable art first; anatomy-specific override only for an evidenced failure, not an eager character×item×tier×frame matrix.

Do not promise a four-node maximum while also proposing helmet, armour, gloveLeft/right and bootLeft/right. If the approved design uses six wearable pieces, the bounded budget must say six; one gloves/boots Equipment identity may own two presentation pieces. Final node count depends on the selected visual model and must be tested explicitly.

Keep held-weapon semantics derived from actual firing events and rack state. Mount transform is presentation-only. The muzzle may visually originate from an authored mount, but changing projectile spawn/aim/hit geometry is a separate gameplay change and not authorized here.

## Conditional file targets after approval

Evolve `src/entities/actorView.ts`, `src/entities/Player.ts`, `src/entities/heldWeaponView.ts`, `src/systems/WeaponSystem.ts`; do not replace entity physics. Add a pure appearance resolver under `src/presentation/`, a character-owned directional presentation catalog, and source/builder/export metadata only after direction topology is chosen. Reuse `src/presentation/equipmentVisuals.ts`, existing Loadout candidate state, Menu serialized loader/generation guards, `src/systems/resourceLoader.ts` and current art registries.

Socket candidate names may include head/torso/left-right paw/weapon anchors. Validate actual direction/frame/pose metadata against accepted pixels before schema freeze. Root, feet contact, muzzle mount and shadow anchor are different concepts; do not collapse them into one arbitrary x/y. No unreviewed per-frame rotation/interpolation of wearable pixel art.

## Layer and lifecycle test requirements

Provisional layering is shadow → rear wearable/weapon as appropriate → body → front wearable/weapon as appropriate → front FX. Do not freeze an always-front held gun: up/back and off-axis aim need actual occlusion proof first. Camera bounds include complete composition as required; collision and current damage-target footprint do not follow clothing or shadows.

Test direction change while moving/firing; opposite/off-axis shots; multiple rack shots same tick; merge/tier change; zero equipment; each slot; mixed 2+2 set; candidate cancel/failed commit; missing base/shadow/wearable; paused/hurt/invulnerable/defeated actor; destroy/recreate; resize and stale resource completion. Runtime never silently falls back to a circle shadow or primitive base.

## Approval gate and stop condition

The current generated directional studies are exploratory and independently reviewed. They are not accepted native pixel masters. Remaining defects and controlled-comparison gaps are recorded in the art review; do not make the implementation agent resolve them by guessing. Owner choice first, then bounded four-anatomy proof (Tabby/Hound/Boar/Raptor), then remaining roster, then real-scale crowded/device acceptance. #199/#174/#175/#191 do not close automatically when #230 lands.
