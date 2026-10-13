# #200 — physical pickup remediation

Status: design/art packet; no runtime cutover. Base main `a100e053ce4e2bc48bc4b8844e7da5010d562096`. Independent of #230. Preserve #229's pool lifetime/Scavenge collection behavior.

## Current evidence and minimal change

`Drop` currently creates up to four art sprites per pooled object keyed only by kind. Do not extend this Map to weapon definitions. Use one reusable presentation sprite per pooled Drop plus existing invisible physics circle and optional one bounded state/glint node.

`resolveRunPhysicalResources` already loads every registered weapon iconId, heldId and projectileId because those definitions can appear as loot. Therefore reusing canonical weapon iconId requires **no additional weapon resource closure**. Preserve existing family/tier art; a new weapon-drop family is not justified before actual-size testing.

## Exact file targets

Add `src/presentation/dropPresentation.ts` (pure grant→resolved presentation), modify `src/entities/Drop.ts`, `src/systems/DropSystem.ts`, and its GameScene wiring. Replace physical XP/Scrap/cache source/export pixels through existing `assets-src/pickups/*` and `public/assets/pickups/*` paths; retain logical bindings in `src/data/visual-art.json` and resource IDs in `src/data/visual-resources.json`. Keep required clip/frame contracts unless a reviewed asset change explicitly migrates them. Extend `tests/drop.test.ts`, `tests/dropSystem.test.ts`, `tests/weaponRewardDropIntegration.test.ts`, `tests/resourceLoader.test.ts`, `tests/scavengePulseCollection.test.ts`.

## Resolver and pool contract

Input is the authoritative immutable `LootGrant`, not a guessed kind/name. XP→drop:xp, scrap→drop:scrap, cache→drop:chest. Weapon definitionId resolves through weapon registry to its canonical art.iconId. Unknown IDs or missing required art produce deterministic diagnostics/fail validation, not generic old weapon token.

Retain the exact grant kind `chest`; “cache” is visual/user-facing language only. Resolve and validate presentation BEFORE acquiring/publishing a pool lifetime, or roll back acquisition, liveDrops membership and spawn serial atomically on any error. Current spawn publishes the live object before `Drop.spawn`; inserting a throwing resolver there without rollback would leak an invisible live Drop. Add a failure-injection regression.

Resolve once on spawn. Set texture, frame, display transform, origin, alpha, tint, animation and marker state explicitly. Reset stops animation, hides/deactivates nodes, clears grant-specific reference, blocked marker, stale tint/flip/rotation and velocity through existing owner. Do not allocate new sprites in spawn/update and do not keep one per weapon definition.

One texture/frame may be static while another animates. Never pass the previous animation key to the new binding. Center art to existing pickup body; art cannot alter pickup radius, blocked admission, magnet speed, reward amount or collection delay. The state/glint node is presentation-only.

## Artwork manifest and source geometry

| Logical ID | Physical resource | Source frame | Display | Existing idle |
|---|---|---|---|---|
| drop:xp | resource:drop-xp-mote | 16×16 | 16×16 | 0–3, 8 fps, repeat |
| drop:scrap | resource:drop-scrap | 20×20 | 18×18 | 0–3, 7 fps, repeat |
| drop:chest | resource:drop-chest | 20×20 | 20×20 | 0–3, 6 fps, repeat |
| Weapon grant | definition.art.iconId | existing canonical atlas/image | aspect-preserving fit within 20×20 world review box | static unless binding explicitly owns a valid idle |

Keep all four source frames untrimmed and stable centered anchor (XP 8,8; Scrap/cache 10,10). No baked shadow/halo outside the frame. Frame sequence should retain the body silhouette; glint/pulse alters a few deliberate pixels only. Reduced-motion freezes to frame0 but preserves identity and blocked state.

## Art direction

XP: a compact split-core salvage energy capsule, cyan/cream core with dark horizontal casing; narrow vertically oriented silhouette. Not a gem or coin. Four-frame shutter pulse, no fuzzy glow.

Scrap: asymmetric low bundle of bolt head, bent plate and wire; cream/brass/rust with near-black separation. It must retain a different width/height silhouette from XP even while moving rapidly. One small glint is enough; no spinning coin.

Cache: squat improvised hard case with broad lid, off-center latch and two clear reinforced corners. Rust/gunmetal/cream, tiny restrained teal indicator. Shape is a container before colour. Opening animation cannot postpone collection.

Weapon: actual canonical family/tier shape dominates. Use an optional shared short ground bracket to separate from floor; no new surrounding rarity badge. Blocked full rack retains the exact gun image and adds broken corner brackets/short unavailable mark. Colour is supplemental. No pulsing warning that hides the item itself.

Generated candidate art, where supplied, is a design master only. Final native16/20 pixel art must be deliberately authored/cleaned, imported into real editable sources and exported reproducibly. Oversized generated illustrations cannot be mechanically reduced and called production pixels.

Do not ask the implementation agent to invent or creatively reconstruct the missing accepted native artwork from this prose. The code/resolver/pool slice may proceed with current validated art while the separately owned native-art slice is completed and reviewed. Runtime visual cutover stays blocked until that slice supplies exact accepted pixels, editable sources, export metadata and parity evidence. The illustrated cache latch and XP casing still need the specific corrections listed in ART-REVIEW.

## Required regression sequence

Reuse the SAME physical pooled Drop: Pistol T1 → reset → Shotgun T3 → blocked → unblocked → reset → Scrap → reset → XP → reset → cache. At every step assert artId/resource/frame/animation/alpha/flip/rotation/tint/marker, grant lifetime, physical radius and active count. Reset while an animation is mid-frame must not leak it into a static gun.

Further gates: missing weapon ID; missing required texture; atlas-frame correctness; all possible grant definitions in run closure; rack-full persists without collection; magnet movement follows body with no lag; Scavenge only admits XP/Scrap and respects spawnSerial lifetime under callbacks; paused/terminal behavior unchanged; no per-frame allocation. Art sprites fall from up to four to ONE per pooled Drop; budget separately allows at most one marker/glint plus one invisible physics owner, at most three total nodes. No catalog-proportional node expansion.

## Visual evidence

Show XP/Scrap/cache and Pistol/SMG/Shotgun at actual 16/18/20 display size over both existing arena floors; grayscale silhouettes; dense cluster; moving magnet stream; blocked weapon; full-rack retry. Include 390×844 phone and desktop. Real art acceptance is separate from pool tests. No gameplay/economy/loot table changes.
