# In-run upgrade icon artwork handoff

## Scope and priority

Jonathan requested a check of the **in-run upgrade** icons and generation/upload of missing artwork. The 18 stable upgrade IDs are already wired, but the current generator explicitly describes its drawings as category placeholders. The eight character ability illustrations are a separate, already committed set. This package covers only the 18 upgrades.

This is an additive art candidate package. It does not replace runtime files, active `.pxo` sources, registry entries, weapon/equipment artwork, or any Codex-owned change. Reconcile against the latest branch before integration. If newer committed final upgrade art exists, keep that work and use this package only for comparison. Do not merge stale gameplay changes from this branch.

## Evidence baseline

- `main`: `45c53e904f6f9faeb03fe4a4d5da4db22cfacca0`
- Existing art integration PR #192: `5f808a6339d9f477103312757032f96c3e8003ea`
- Rechecked 2026-09-30 22:45 UTC: all 18 runtime upgrade PNG blobs are identical between main, PR #206 head `df4eab54ae352c5733acb82caf8c9ba9cbe00c9b`, and PR #207 head `0bd678de4c7348c09a1e35c8e746d920ac7c1a46`. No newer upgrade illustration cutover was found; detailed path/blob inventory is in `overlap-evidence.json`
- `src/data/upgrades.json` supplies IDs and actual effects
- `docs/art/scripts/lib/epic18-upgrade-icon-art.lua` explicitly calls the current drawings placeholders before final art lands
- Existing contract: 48×48 source/export canvas, 36×36 display
- Style reference: committed `assets-src/characters/identity/concepts/ability-icons-v2-selected.png` on #192. Used only to match visual language; its eight symbols are not replaced

## Package

- Original transparent OpenAI Image Generation outputs are supplied in three companion source ZIPs through ChatGPT Library. See `SOURCE-PACKS.md` for the exact Library file IDs and materialization instructions. Each ZIP contains `generated/` with one icon per file. The GitHub package below contains the actual 48×48 PNGs needed for integration
- `candidate-48/`: deterministic downsampled 48×48 RGBA previews, alpha-cropped then fitted within 42×42 with a minimum three-pixel margin
- `subjects.json`: exact subject briefs in stable ID order
- `upgrades-source.json`: baseline content snapshot for semantic comparison; do not copy over current gameplay data
- `review.py`: reproducible preview/contact-sheet preparation; Pillow BOX reduction, nearest-neighbour display previews
- `review/native-audit.png`: all candidates shown at 2× source size and actual 36-pixel size on dark and light backgrounds
- `review/checks.json`: hashes, source dimensions, alpha and bounding-box checks

These PNGs are illustrated masters and review exports. They are **not** an assertion that a Pixelorama import/export chain or runtime integration has passed. Never fabricate `.pxo` files or metadata sidecars from a filename rename.

## Integration sequence

1. Recheck the latest active integration branch and inventory all 18 IDs. Keep every ID, rarity, category, effect, stack limit and weapon-family scope unchanged.
2. Use the repository's real, deterministic source importer to create the canonical 48×48 Pixelorama projects. Preserve the original generated masters with hashes and document the resampling operation. If pixel cleanup is needed, save it as an explicit revision rather than silently altering the original.
3. Export PNGs and metadata using the supported pipeline. Compare exported pixels to the accepted 48-pixel candidates and inspect any resampling changes.
4. Keep `upgrade-icon:<id>` bindings and existing runtime paths. Change only their artwork and truthful provenance. Retire the placeholder generator for these assets so a subsequent regeneration cannot overwrite final art.
5. Treat art IDs as visual references, not gameplay switches. All actual effects remain in validated data. These symbols are mnemonic aids, not a replacement for the upgrade title, description or trade-off text.
6. Run `npm run art:validate`, content validation, relevant icon registry/source/export tests, then the repository closeout gates. Check for missing textures, stale caches and asset-load errors.
7. Inspect every icon in the real upgrade selection UI at desktop and phone sizes. Test long/localized labels, all rarities, selected/disabled states, touch/keyboard/controller focus, repeated rerolls and returning to play. Ensure focus/rarity chrome remains distinguishable from the icon accent colors.
8. Preserve existing interaction fixes in #192 and correctness work in #202. Do not refresh golden screenshots merely to hide an unexpected change. Final acceptance requires a reviewed integrated capture and human visual approval.

## Semantic review traps

- Hot Barrel and SMG Overclock mean faster fire, not fire damage or overheating mechanics
- Scrap Magnet means pickup radius; Extra Scrap means currency gained
- Reinforced Coat means max health, not a new armor/damage-reduction rule
- Heavy Rounds, Glass Cannon, Pistol Needle Rounds, SMG Overclock/Spray and Shotgun Breacher have trade-offs; continue displaying them in text
- Split Shot/SMG Spray/Shotgun Buckshot add projectiles; a picture's exact pellet count is not the runtime stat
- Pistol Deadeye changes damage/range, not critical chance
- Glass Cannon's cracked-glass visual means reduced max health, not a new breakage system
- Rarity and category must not be communicated by color alone. Keep existing accessible labels and selection semantics

## Verification boundary

Art inspection and file checks are recorded separately from implementation. No gameplay code, balancing, input handling, save data, deployment or merge is part of this package. Runtime tests and physical-device testing remain implementation gates.
