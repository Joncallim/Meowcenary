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
| #85 Contracts | implementation shipped; distinct pacing needs integrated play | keep for acceptance |
| #87 Gunsmith | mechanics shipped; assembled-weapon/dedicated Part visuals remain | active art tranche |
| #88 Mercenaries | mechanics/ability feedback shipped; cast art readability remains | active art tranche |
| #89 Equipment | mechanics and player fabrication shipped; dedicated piece art remains | active art tranche |
| #165 navigation | implementation shipped; device and final visual acceptance remain | keep for acceptance |
| #167 production art | architecture complete; production art incomplete | primary active tranche |
| #171 product pass | integrated pacing/reward/fun verdict remains | follows representative art |
| #174 Volt Lynx | distinct source/export and automated silhouette proof complete | device acceptance remains |
| #175 actor readability | several generated placeholders remain | active art tranche |
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
3. Gunsmith exploration selected a coherent 23-icon direction covering all 12
   Parts, eight slots, and three behavior traits. Production source/export and
   UI integration are the next tranche.

The representative batch adds six shipped logical images backed by two
physical resources (Volt Lynx sheet and Commando atlas), while the 23 Gunsmith
concept identities remain outside runtime until their deterministic production
chain and exact-ID validation land.

Automated art-tranche evidence before PR review:

- 88 focused visual/menu/content tests: PASS;
- lint/typecheck, content validation, art validation, and diff hygiene: PASS;
- targeted builder selection rejects a zero-match filter: PASS;
- repeated Commando builder/PXO/export hashes are identical: PASS;
- independent visual review found no P0; its resource-resolution, source
  parity, Lynx defeat, and zero-match findings were corrected.

Generated sources retain prompts/provenance and remain outside runtime assets
until selected, cleaned, imported, exported, and validated.

## Known non-blocking follow-up

Codex review left one P2 hardening suggestion: validate duplicate Equipment
definition batches before replaying a historically malformed durable receipt.
No authoritative reward catalog emits that shape. It remains visible on #163
and must not be mistaken for a current P0/P1 or an excuse to reopen the frozen
migration contract.
