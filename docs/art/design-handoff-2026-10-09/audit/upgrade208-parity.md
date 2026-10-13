# PR #208 / current-main upgrade-art parity

Audit date: 2026-10-09 UTC. Read-only GitHub inspection and independent local artifact analysis; no repository edits, PR changes, implementation, or messages to external parties.

## Conclusion

**All 18 PR #208 illustrations are already integrated into current main. No missing 18-icon source/export/binding cutover was found.**

- Current main: `a100e053ce4e2bc48bc4b8844e7da5010d562096` (branch endpoint verified at audit start); tree `0a498e6c43f9450ce7977a4ab55a10523626487f`, complete recursive listing of 2,001 entries.
- [PR #208](https://github.com/Joncallim/Meowcenary/pull/208) is still open/draft at `04e2840dae4b1efb7f8806ae350942e68768f651`. Its 27 added files are confined to `docs/art/candidates/run-upgrades-2026-09-30/`; its stale handoff is not evidence of current integration status.
- [PR #225](https://github.com/Joncallim/Meowcenary/pull/225), merged as `8eb45a7b4ce16475fca87e70779e84cc0effed77`, deliberately selected all 18 candidates. [Issue #224 is closed](https://github.com/Joncallim/Meowcenary/issues/224).
- Main runtime PNGs, main pinned `source/candidate-48.png` inputs, and PR #208 candidate PNGs have identical Git blobs for every ID. Current `src/data/upgrades.json` and PR #208 `upgrades-source.json` also share blob `73b9b3569f80218ce1384f69e8952e0fd0408b20`, so all gameplay data in that snapshot remains identical.

## Independently verified, not inferred from filenames

The audit fetched all 18 native `.pxo` files, candidate PNGs, per-icon Lua builders and runtime JSON sidecars pinned to exact main. Downloaded files were checked against Git blob IDs. A separate audit script inspected each archive and decoded each image; it did not run repository code.

- 18/18 native files are readable ZIP-format Pixelorama projects with `application/x-pixelorama` mimetype, `v1.2-stable` / PXO version 7, 48×48 RGBA, one frame, visible normal opaque `body`, and hidden `notes`.
- Every body cel equals the candidate's complete decoded RGBA byte stream; every notes cel is empty. Every Lua builder hex payload equals those same bytes and targets its proper `.pxo` path.
- Every PNG is 48×48 RGBA with a minimum 3-pixel transparent margin. All 18 decoded raster hashes are distinct. Candidate alpha maxima are 253–254 following resampling; originals' recorded 255 extrema are not claims about the downsampled exports.
- All candidate file SHA-256 hashes match both main's manifest and PR #208's review/checks.json.
- All metadata sidecars match the pinned canonical Pixelorama schema, adjusted only for their own export name.
- Exactly 18 `upgrade-icon:<id>` bindings exist, all required and 36×36, and all 18 upgrades refer to their matching ID. Each binding resolves its matching `resource:upgrade-icon-<id>`, nearest sampling, expected texture key and existing runtime image URL.
- `generate-upgrade-icon-placeholders.mjs` is a check-only compatibility command. The shared Lua renderer now decodes selected RGBA bytes; it cannot regenerate the old category symbols.

## Source/export provenance boundary

[Main provenance](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/docs/art/upgrade-icon-art-provenance.md) truthfully describes the current chain: pinned PNG → deterministic Lua → repository native-PXO writer → validated native cel bytes → Pillow PNG export plus canonical sidecar. It explicitly says the export did **not** run Pixelorama's GUI/CLI. This audit validates real native archive/cel structure and exact pixels; it does not claim a fresh GUI/CLI round trip.

The three original 1254×1254 master ZIPs are identified in the manifest as external Library artifacts, not checked into the repository. Original-master hashes and the 1254→48 reduction were not independently verified by the integrator or this audit. The 48×48 accepted production inputs are preserved and cryptographically pinned. This is a provenance limitation, not evidence that runtime art or editable sources are missing.

## Completed acceptance evidence

[Issue #224 production closeout](https://github.com/Joncallim/Meowcenary/issues/224#issuecomment-5994987524) records full exact-main gates on then-current `2865e28f46b046b743283b8c1bcf7fc7ef2936a3`, complete art/source/export validation, 368 browser passes / 64 existing scoped skips / zero failures, verified deployment, and natural phone/desktop level-up selection that increments one stack and resumes play. Those are historical recorded results, not new browser executions in this audit.

[Committed chooser evidence](https://github.com/Joncallim/Meowcenary/tree/a100e053ce4e2bc48bc4b8844e7da5010d562096/docs/delivery/issue-224-upgrade-chooser) includes all-18 catalog captures at 360px/390px/desktop, focused/pointer states and hashed facts. Main provenance records focused integrated visual inspection; it does not grant whole-game product-owner approval.

## Exact remaining checklist

1. **No source/runtime/registry reintegration is required for these 18 candidates on audited main.** Preserve the production source chain and logical IDs; do not import PR #208's old runtime base or label these shipped files placeholders because the draft remains open.
2. **If completing original-source provenance:** retrieve the three explicitly named Library master ZIPs, verify originals against PR #208's recorded source SHA-256 values, independently reproduce the documented alpha crop/BOX fit, and record accessible durable original provenance. This is the remaining master-history gap; do not fabricate or claim it already passed.
3. **For current-release visual acceptance:** the current live deployment/capture audit must pin its served build and inspect current actual-scale chooser appearance. Historical #224 acceptance remains valid evidence but is not proof of today's served build. This is owned by the parent live audit.
4. **For umbrella closure:** obtain/record the still-open whole-game human/product-owner visual acceptance under [#167](https://github.com/Joncallim/Meowcenary/issues/167) and [#191](https://github.com/Joncallim/Meowcenary/issues/191), plus physical-device acceptance where required. Focused automated/icon parity and prior browser emulation cannot stand in for those gates.
5. **PR hygiene only, if desired and authorized:** reconcile or close draft #208 as adopted by #225; no need to merge it to deliver these assets. This audit made no PR changes.

No full repository gate suite or Pixelorama GUI/CLI was rerun here. The independent byte/pixel/binding audit passed. Local evidence and script: `upgrade208-evidence/_audit/verified-parity.json` and `upgrade208-evidence/_audit/verify.py` beside this report.

## Per-icon blob inventory

For each ID below, `PNG blob` is common to:
- PR head `docs/art/candidates/run-upgrades-2026-09-30/candidate-48/<id>.png`
- main `assets-src/upgrade-icons/upgrade-icon-<id>/source/candidate-48.png`
- main `public/assets/upgrade-icons/upgrade-icon-<id>/upgrade-icon-<id>.png`

The `.pxo` path is main `assets-src/upgrade-icons/upgrade-icon-<id>/source/upgrade-icon-<id>.pxo`. Full builder/sidecar/RGBA/SHA-256 inventory is in the JSON evidence.

| ID | PNG blob | PXO blob |
|---|---|---|
| quick-paws | `01cd7d2c3e89377ffc45a19f20e30eb8e87807e0` | `27b98f88c8e42e8a80f9b8ef7d5d14c10e22629b` |
| extra-scrap | `f50a3c33f631803f4bd430cf55d739037a45cac8` | `5c56488a3e974a2168e9b126b62a982afd96326f` |
| hot-barrel | `dcb56107bb0d2378115188ea0779f3cd4070770e` | `c53b3ef6023fbd1432e1803211c4a6967efe9fb7` |
| scrap-magnet | `551df03846aa22813a3d5d504df70f47909b625a` | `92ba64a244458c2dd0f0ae405b2504908e2a2185` |
| reinforced-coat | `aa22c2b6d0d0f90076c168ec83d1de6da13a0ee2` | `d6f3699fcbb485b23dc45c6e5938389a779b3e54` |
| fast-learner | `392a15e4b745e47703e3b65b5a9ac420c2d49c5b` | `742a0cfcff153fb6bda03fb67e8d91b8e4c3ef24` |
| heavy-rounds | `cbe0ef682f1e4e6b2fe4073e90b08c5ec1df5ea2` | `41d02078b1edfa6fe5180b11893b1fff8a187709` |
| long-barrel | `3f1edd61594bbd9846c80711702ddbe4b18c307e` | `f6b68b236134a78c9157c15d3d859503ead80f3d` |
| split-shot | `2e4d13e4ee5c80cb0a34e64556a6c79817d5404f` | `14c71461164ff86a601446c29585a7bb28c40efb` |
| punch-through | `7aee67f5d471f6a482ce9c86c66d7b3f5a2f5abc` | `0c04d8ea7663b1da913c0810854e47eecae7fbb3` |
| glass-cannon | `a482271780a139d275bb02638962f7e483267421` | `b17ef76d919ab78ae6d650495f47440cbc84ee29` |
| run-and-gun | `fa32350eb6e12856043e1c2bade17b1bfba76c48` | `4649254ef17dff930d1b2737f7cfa78c194e5a6b` |
| pistol-deadeye | `bf3e50ec05ea0ede19105ba9b6a43e393ae27d27` | `9686afca5bf22261f80385a287edd099abc7f911` |
| pistol-needle-rounds | `c6f2ab578540e9f96336b8c96598ca095ce4bd56` | `d6d6dafa1e125cbd26b5f768a41ee9b7a3870b25` |
| smg-overclock | `841c94ea2416bbee1b8455ef3898f4eb3e4e3c21` | `62240794deebe42736bf4043d6f9bc80a18c163e` |
| smg-spray | `ba430376024dd475c95143c170a510658b51d2a7` | `abfbccdddddbf32336e66149ecc402ca35c503d1` |
| shotgun-buckshot | `9f10b40aa12453507c61e86a13952a32b4617b7b` | `d4939ecb9f935712ad75349275e2cff757be1318` |
| shotgun-breacher | `69e71141976cef6de4f3f2fd1449113b90ba4ce3` | `285b1a7d1ce9ff5d4a614a9734aa4b3d30e360ed` |

## Supporting source blobs on main

- [src/data/visual-art.json](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/data/visual-art.json): `471210e6c8b597d0d4a8294bd4a3ea2da5be14fb`
- [src/data/visual-resources.json](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/data/visual-resources.json): `df8d6d4f74f91abdfc88dd85b3a9443210778a53`
- [assets-src/upgrade-icons/candidate-manifest.json](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/assets-src/upgrade-icons/candidate-manifest.json): `7201cb0e9f35be8df0d0a6ad6c9b19df9ea12cc8`
- [docs/art/upgrade-icon-art-provenance.md](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/docs/art/upgrade-icon-art-provenance.md): `43f682ab90a1520a114076e52b6981e097065b0f`
- [docs/art/scripts/build-upgrade-production-art.py](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/docs/art/scripts/build-upgrade-production-art.py): `80da6860000bcf1ad428435f2dc7e9b42589f52a`
- [docs/art/scripts/build-upgrade-production-art.test.py](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/docs/art/scripts/build-upgrade-production-art.test.py): `13e3af9e6091e911f94c69f0baa85e81a906417c`
- [docs/art/scripts/lib/epic18-upgrade-icon-art.lua](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/docs/art/scripts/lib/epic18-upgrade-icon-art.lua): `9766c3379bc0ddee0bbbecc6cabc883fb51443f0`
- [docs/art/scripts/generate-upgrade-icon-placeholders.mjs](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/docs/art/scripts/generate-upgrade-icon-placeholders.mjs): `ad1798dd8f049c1ad8fc37931a81022ffdcd723b`
- [package.json](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/package.json): `afadb4eefeb202654351e4b600d5169af232d005`
- [docs/delivery/issue-224-upgrade-chooser/README.md](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/docs/delivery/issue-224-upgrade-chooser/README.md): `a04f60aba1311e293fcd66e3c3eaf5c01a7fb714`
