# Alpha 3 Completion Campaign Ledger

This ledger records the live post-V4 completion campaign. Architecture and
product authority remain in the documents linked by
`docs/architecture/alpha-3-v4-authority-index.md`; this file is recovery state,
not a new design source.

## Baselines

- Campaign starting checkpoint: `7f0ced0dc9ffb46c72ea9ffd7b0429b59f20fd1d`
- Persistence candidate: `c96f3cf0b01940e4cdef6ad487dfe4f6ab1eb845`
- Persistence baseline on `main`: `27fa560f75afbaaa4944e338610e42f83ef453cf`
- Owning integration: PR #163, merged 2026-09-24
- Character/Equipment art baseline: PR #178 merge `c99bf6dc42349cbb4762be18c0c734cba7db0120`
- Gunsmith art baseline: PR #179 merge `811112dc9a02df424e478b0b4b21ea617875a375`
- Forge/Foundry baseline: PR #180 merge `d8120a70fa9cf1f76debcb8547c448867acc8b4e`
- Whole-run Results truth baseline: PR #181 merge `8530b718c3dc0dc1fb09b92e94cf13decf91b9dc`
- Assembled Gunsmith baseline: PR #182 merge `8cb8e0396df093c1b8501f47f467b62b64fa1dac`
- Dedicated Equipment baseline: PR #183 merge `30f46af06aeaa10873b01da057ca0e50b352c8ef`
- Mercenary presentation/readability baseline: PR #184 merge `2d4dadb86ea8bf278fa114b2d5f4e66fb353016d`
- Ten-Contract content-matrix baseline: PR #185 merge `b2e5d7c6cb82d1c74c7fb41447b259f1264ccba3`
- Build-pacing baseline: PR #186 merge `a39ee0d1e6a2549b1ad362afe53f71010ea5f579`
- Enemy-art baseline: PR #187 merge `e042163684330791bfa8fe3336c7dbc472b85674`

## Frozen persistence decisions

- All normal Contract win, replay, loss, and Training terminal outcomes use the
  context-owned `settleRunTerminal` candidate-save boundary.
- Candidate state publishes only after the single durable write succeeds.
- V2/V3 legal permanent-upgrade levels receive the documented cumulative
  retirement refund once. V1 receives no permanent-upgrade refund.
- Grandfathered Equipment and Part ownership is distinct from refund logic.
- Migrations are one-way and idempotent.
- V4 Equipment owns at most one instance per definition, regardless of whether
  fabrication or an authored reward happens first.

## Automated foundation evidence

At PR #163 candidate `c96f3cf0…`:

- CI Node and GitGuardian: PASS
- full repository suite: PASS (147 files / 2,368 ordinary tests, plus allocation
  and test-runner recursion/selection gates)
- lint/typecheck and production build: PASS
- content validation: PASS (156 focused tests plus builder checks)
- art validation: PASS
- controller journey, migration round-trip/idempotence, and diff hygiene: PASS
- latest exact-SHA review: no P0/P1

Physical-phone, controller-in-hand, visual approval, and subjective fun verdicts
remain **UNVERIFIED** until genuinely performed.

## Backlog reconciliation

| Item | Current evidence | Campaign disposition |
| --- | --- | --- |
| #86 enemy/death lifecycle | universal death fact and exact-once tests shipped | closed after merged-main CI |
| #90 save/progression | V4 migration and atomic terminal settlement shipped | closed after merged-main CI |
| #168 Compendium | generic discovery/save/Career UI shipped | closed after merged-main CI |
| #170 scalability | data-first registries, lazy resources, N+1 proofs shipped | closed after merged-main CI |
| #85 Contracts | stable ten-Contract structure and reviewed V4 encounter/difficulty matrix shipped; Contract-first presentation and integrated play remain | active UI/acceptance tranche |
| #87 Gunsmith | mechanics, dedicated Part/slot/trait art, assembled schematics, truthful comparisons, linear exact-pair workflow, and focused destructive confirmations shipped | closed by PR #182; physical device evidence remains UNVERIFIED |
| #88 Mercenaries | mechanics/ability feedback, graphical roster, grandfathered-availability consistency, exact Rattle cadence, and five placeholder actor redraws shipped | automated scope complete; physical acceptance remains |
| #89 Equipment | mechanics/player fabrication and all 8 emblems/32 pieces have exact dedicated semantic art | closed by PR #183; physical device evidence remains UNVERIFIED |
| #165 navigation | shared scrolling/input foundations shipped; Contract-first Home/selection, Loadout hub and visual Career refinements are in the current unmerged tranche | active UI tranche |
| #167 production art | architecture complete; production art incomplete | primary active tranche |
| #171 product pass | Contract matrix, four-role upgrade offers, and pacing telemetry shipped; integrated fun verdict remains | active acceptance tranche |
| #174 Volt Lynx | distinct source/export and automated silhouette proof complete | device acceptance remains |
| #175 actor readability | five Mercenary redraws and the enemy-art production tranche shipped; device-scale evidence remains | active acceptance tranche |
| #98 async challenges | explicitly outside Alpha 3 | defer |

## Current art direction

The existing Meowcenary identity is retained: compact industrial pixel art,
anthropomorphic mercenary silhouettes, scavenged hardware, warm rust/amber
world materials, restrained electric/cool accents, readable dark outlines, and
no copied game expression. Production follows the source → editable import →
deterministic export → logical binding chain.

Representative production batch:

1. Volt Lynx now has a distinct tall recon silhouette, deliberate
   idle/run/hurt/defeat poses, retained concept provenance, an editable PXO,
   deterministic export, and a native-scale silhouette regression.
2. Commando now has one dedicated Set emblem and four slot-readable piece
   icons in a single lazy-loaded named-frame atlas. Cold-load rerender and
   already-cached rendering are covered through the physical binding resolver.
3. Gunsmith ships a coherent 23-icon packet covering all 12 Parts, eight slots,
   and three behavior traits, with editable source, deterministic export,
   lazy resource loading, partial-load recovery, and current-selection closure
   tracking.
4. Forge Foundry is merged: a distinct existing-architecture
   Arena, Forge-specific encounters, a 16-image world packet, and an active
   heat-grate skin whose art is part of the exact run resource closure.
5. The merged assembled-weapon tranche adds three family chassis and ten co-registered
   physical-Part layers in one lazy 96×48 atlas. The Gunsmith composes them
   from data, shows trait sockets/emblems, preserves repeatable fabrication,
   and keeps destructive Workshop selection linear, exact, focused, and explicit.
6. The Equipment candidate adds dedicated art for the remaining seven Sets:
   seven emblems and 28 slot pieces in one shared 35-frame atlas. Together
   with Commando, the catalog now resolves all 40 exact semantic Equipment
   art IDs without borrowing Upgrade-card graphics.
7. The Mercenary candidate replaces Brass Boar, Ember Cougar, Scrap Weasel,
   Rattle Raptor, and Piston Ram placeholder actors with five distinct
   production silhouettes. The roster now presents authoritative actor and
   starting-weapon art through the same lazy physical-resource boundary while
   keeping locked/selectable truth in the shared character domain.
8. The merged Contract matrix gives both chapters five distinct, validated
   encounter compositions and seven bounded difficulty profiles while keeping
   every historical Stage ID stable, including `stage:junkyard-06`.

The completed art PRs add 29 shipped logical images backed by three physical
resources (Volt Lynx sheet, Commando atlas, and Gunsmith atlas). The Forge
candidate adds 16 logical world images in one physical atlas; its selected and
rejected generated directions are retained as provenance rather than copied
directly into runtime output.

Automated art-tranche evidence before PR review:

- 88 focused visual/menu/content tests: PASS;
- lint/typecheck, content validation, art validation, and diff hygiene: PASS;
- targeted builder selection rejects a zero-match filter: PASS;
- repeated Commando builder/PXO/export hashes are identical: PASS;
- independent visual review found no P0; its resource-resolution, source
  parity, Lynx defeat, and zero-match findings were corrected.

Generated sources retain prompts/provenance and remain outside runtime assets
until selected, cleaned, imported, exported, and validated. The Equipment and
Mercenary batches each retain selected and rejected generated concept
directions; their stronger-silhouette directions were reconstructed as
editable native pixels with deterministic builder/export parity.

## Known non-blocking follow-up

Codex review left one P2 hardening suggestion: validate duplicate Equipment
definition batches before replaying a historically malformed durable receipt.
No authoritative reward catalog emits that shape. It remains visible on #163
and must not be mistaken for a current P0/P1 or an excuse to reopen the frozen
migration contract.
