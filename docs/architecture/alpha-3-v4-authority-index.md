# Alpha 3 V4 — Authority Index After Final Adversarial Review

**Status:** canonical reading-order/index for Alpha 3 V4 implementation. This file does not duplicate the full design; it tells an implementation agent which reviewed documents supersede which earlier assumptions.

**Implementation baseline audited:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Planning branch / review PR:** `codex/alpha3-art-compendium-planning` / #169.

The planning review continued after `alpha-3-final-execution-handoff.md` was first frozen and found several material cross-version/scalability defects. Those corrections are intentionally narrow and are recorded in dedicated amendment files rather than silently rewriting historical reasoning.

---

# 1. Required implementation reading order

Read in this order:

1. **This authority index** — current precedence and late-review rules.
2. `alpha-3-final-execution-handoff.md` — base V4 slice order, ownership and product/architecture target.
3. `content-authoring-templates-v4.md` — canonical ordinary-content/N+1 authoring contract.
4. `alpha-3-terminal-settlement-amendment.md` — source-owned projected facts, historical reward receipts/fingerprints and stable first-clear Part instance identities.
5. `alpha-3-owned-state-migration-amendment.md` — owned-tier grandfathering, Mercenary grandfathering and V3 Contract performance-record migration.
6. `alpha-3-part-tier-value-amendment.md` — meaningful Part tier progression, FIRE layering and early-Part no-op corrections.
7. `alpha-3-weapon-family-authoring-amendment.md` — data-owned weapon-family/Gunsmith compatibility and Family N+1 proof.
8. `alpha-3-test-transition-plan.md` — final invariants versus RC1 plumbing tests.
9. Domain gameplay/art/Compendium documents referenced by the final handoff.
10. `alpha-3-scalability-closeout.md` and `alpha-3-checkpoint-review-ledger.md` — reasoning/evidence history, not competing implementation schemas.

If a lower item conflicts with a higher item, the higher item wins.

Historical redirect stubs remain non-authoritative:

- `alpha-3-implementation-blueprint.md`
- pre-V4 `content-authoring-templates.md`
- pre-V4 `content-authoring-template-coverage.md`

---

# 2. Late material corrections that supersede the original handoff where necessary

## 2.1 Terminal settlement / historical reward data

Use `alpha-3-terminal-settlement-amendment.md`.

Frozen rules:

- a new source-owned Stage/Boss/Achievement settlement may validate rewards against only the exact authoritative fact(s) that same atomic transaction will commit;
- arbitrary/direct grants cannot project future facts;
- completed Stage state classifies replay **before** today's RewardProfile is reconstructed;
- a historical receipt/fingerprint certifies the historical payload, not today's catalog;
- changing a RewardProfile never remints a completed Stage reward or rewrites its old fingerprint;
- legitimate RC1-owned reward inventory survives even when V4 changes future reward acquisition;
- new V4 first-clear Part grants use the stable owned IDs frozen in that amendment.

## 2.2 Owned state / migration

Use `alpha-3-owned-state-migration-amendment.md`.

Frozen rules:

- current V4 progression gates control future acquisition/upgrade commands for fresh V4 progression, not retroactive validity of legal V3-owned state;
- legal Part tiers remain owned instance state after static definition tier is removed;
- Piston Ram / Ember Cougar and every other historically selectable RC1 Mercenary remain selectable through migration-owned `character:<id>` entitlement without fabricating new Stage/Mastery/Achievement facts;
- current ten Stage completion facts survive V3→V4, but their RC1 `bestTimeMs` values are cleared because V4 materially changes the rulesets;
- a migrated replay may establish a new V4 best time without becoming a first clear.

**Late correction:** the lower amendment's earlier statement that grandfathered Equipment ownership does not preserve unspent historical upgrade capability is superseded by §3.8 below. Existing legal owned tiers remain valid **and** a migrated save retains the highest Equipment tier capability it had already earned under RC1.

## 2.3 Part progression and current content

Use `alpha-3-part-tier-value-amendment.md`.

Frozen rules:

- a Part that can legally reach T2+ must have at least one real tier-sensitive contribution;
- shared FIRE remains the existing generic 1.15x damage + burn behavior, deduped once per weapon family;
- a Fire Core's own engineering modifier is separate from the shared FIRE package and stacks normally;
- ordinary Fire Trait Core gains a small tier-scaled Part-owned damage modifier and remains a repeatable project after Crusher;
- Mastered Fire remains Warden-only/reward-only and is granted as an owned T3 instance;
- Red-Dot Optic and Padded Stock must not ship as early zero-effect Parts; use the first tuning corrections in the amendment unless playtest deliberately retunes them.

## 2.4 Weapon family authoring

Use `alpha-3-weapon-family-authoring-amendment.md`.

Frozen rules:

- current `pistol | smg | shotgun` source constants are not an acceptable Family N+1 boundary;
- add one small WeaponFamily catalog owning stable family identity/name + Gunsmith physical-slot compatibility;
- `trait` remains the current universal Gunsmith slot invariant;
- Gunsmith, save sanitation and family-scoped validation consume the same family registry;
- current shipped families/behavior do not change;
- synthetic Family 4 using existing mechanics must not require family-ID source branches or implicit pool edits.

---

# 3. Additional frozen late-review rules

These findings did not justify another architecture subsystem or large amendment, but are implementation requirements.

## 3.1 Campaign frontier is optional

Current RC1 `normalStageTargetId()` wraps to the first available Stage after all available Stages are completed.

V4 must instead distinguish:

```text
nextIncompleteContractId?: string
selectedReplayContractId?: string
```

When all current Contracts are complete:

- `nextIncompleteContractId` is absent;
- Home/Results show campaign-complete / replay / Loadout / Career actions;
- First Scavenge is not presented as “Next Contract”;
- adding a future unlocked incomplete Contract naturally makes the frontier non-empty again.

No final-stage-ID branch is required.

## 3.2 Part merge identity is commutative

The semantic merge operation consumes an unordered pair of same-definition/same-tier Parts.

Before deriving durable merge provenance/output identity:

```text
canonicalize/sort the two consumed instance IDs
```

Therefore:

```text
merge(A, B) == merge(B, A)
```

for output identity/content against the same pre-state.

Caller selection order may not become permanent ownership identity.

## 3.3 V3 entitlement bag remains an entitlement bag, not fact storage

Shipped V3 producers created automatic `achievement:*` shadow tokens plus only these non-achievement explicit tokens:

```text
character:scrap-weasel
equipment:commando-helmet
```

There were no shipped `unlock-part`, `unlock-trait` or `unlock-stage` producers.

Migration rules:

- promote known `achievement:*` history into `save.achievements`, then remove active shadow-fact dependence;
- character grandfathering is handled by the broader historical-selectability rule in the owned-state amendment;
- a valid historical content entitlement may remain in the entitlement bag, but it never substitutes for a physical owned instance or authoritative Stage/Boss/Achievement/Mastery fact;
- active V4 `stage-cleared`, `boss-defeated` and `achievement-completed` evaluators never fall back to `progression.unlocks`.

## 3.4 Historical Achievement reward definitions never rewrite history

A V3 achievement already marked completed is terminal historical state even if V4 changes/removes its reward definition.

Migration/runtime must preserve:

- completion;
- legitimate historical owned reward effects;
- historical receipt/fingerprint when present.

It must not:

- re-complete the Achievement;
- mint the V4 replacement reward;
- rewrite the historical fingerprint to today's reward payload.

## 3.5 Achievement platform outbox pruning

`pendingAchievementReports` is a best-effort native-platform mirror outbox, not gameplay truth.

V4 migration/sanitization:

- preserves local historical achievement completion;
- retains pending reports that still have an explicit reportable V4/historical platform mapping;
- prunes retired/unknown non-reportable pending IDs so they cannot retry forever after restart.

An active pending report must still survive restart and retry.

## 3.6 BossProgress owns only the defeat fact

RC1 writes Stage `timeMs` into `BossProgress.firstDefeatedAt`, despite the field name implying a timestamp. It is duplicate/incomparable performance metadata and has no required V4 product role.

V4 active BossProgress is the authoritative defeat fact only:

```ts
interface BossProgress {
  readonly defeated: true;
}
```

Do not invent a wall-clock first-defeat timestamp during migration. Stage owns Contract performance time; Achievement completion owns `completedAt` where available.

## 3.7 Migration bridge for content moved onto an already-completed milestone

The generic replay rule remains: changing a historical RewardProfile does not remint its new payload.

However that rule cannot make **reward-only content permanently unobtainable** for a player who completed the newly assigned sole source before V4 existed.

Current V4 has one such case:

```text
Mastered Fire Trait Core
V4 acquisition: Forge Warden milestone only, reward-only/non-fabricable
RC1 Warden reward: no Mastered Fire instance
RC1 live loot tables: no physical Part acquisition path
```

Therefore V3→V4 migration must bridge the content relocation:

```text
if boss-forge is authoritatively defeated
AND no owned Part instance has partId = part:trait-fire-mastered
then add exactly one owned instance:
  instanceId = reward:stage-06-mastered-fire-trait
  partId     = part:trait-fire-mastered
  tier       = 3
  infusedTraits = []
```

Rules:

- this is a **schema/content migration grant**, not a replayed first-clear transaction;
- preserve the historical Warden Stage receipt/fingerprint unchanged;
- do not mark the next Warden replay `firstClear:true`;
- do not grant another copy if a legitimate Mastered Fire instance already exists;
- never overwrite an occupied different owned-instance key at `reward:stage-06-mastered-fire-trait`; corrupted/conflicting state fails/diagnoses safely;
- migration versioning/deterministic instance identity provides idempotency; do not add a second reward transaction manager solely for this bridge;
- result UI must not claim the item was earned by the player's first post-migration replay.

This is deliberately narrow but the migration principle is reusable:

> If a release moves a non-fabricable/non-repeatable content item onto a sole milestone that historical players may already have completed, the versioned migration must preserve acquisition coverage without rewriting the historical source receipt.

### Warden Down historical fact bridge

V4 also adds `achievement:boss-forge` / Warden Down for the already-existing authoritative `boss-forge` defeat fact.

During V3→V4 migration:

```text
boss-forge defeated
-> achievement:boss-forge completed = true
```

with no invented `completedAt`.

Initial V4 Warden Down carries **no explicit persistent reward**; the Warden Stage already owns the headline Scrap/Mastered Fire milestone reward. This keeps the migration factual and prevents a second reward-remint problem.

Do not require the player to defeat an already-completed boss again merely to synchronize the new canonical Achievement domain.

## 3.8 Preserve historically earned Equipment tier capability

Further review of RC1's actual upgrade path found that progression conditions controlled not only existing item validity but a visible, spendable **future upgrade capability**:

```text
RC1 T2 capability -> stage:junkyard-02 cleared
RC1 T3 capability -> boss-crusher defeated
RC1 T4 capability -> achievement:boss-crusher completed
```

V4 deliberately rebalances fresh-save pacing to:

```text
V4 T2 -> stage:junkyard-03
V4 T3 -> boss-crusher
V4 T4 -> boss-forge
```

A migrated player who had already satisfied an RC1 capability gate must not lose an upgrade action merely because they had not spent Scrap before migration.

### Migration capability floor

During V3→V4 migration determine the highest Equipment tier capability legitimately earned under frozen RC1 semantics and persist a migration-owned entitlement/capability floor without fabricating Stage/Boss/Achievement facts.

Recommended explicit entitlement grammar:

```text
capability:equipment-tier-2
capability:equipment-tier-3
capability:equipment-tier-4
```

These are **capability entitlements**, not Stage/Boss fact aliases. They may live in the durable entitlement bag because they state exactly what was earned rather than pretending a later V4 milestone occurred.

Historical derivation:

```text
stage:junkyard-02 completed        -> at least T2
boss-crusher defeated              -> at least T3
achievement:boss-crusher completed -> at least T4
```

The shared V4 availability/upgrade resolver computes:

```text
maxEquipmentTier = max(
  current V4 condition-derived capability,
  migrated historical capability entitlement
)
```

Consequences:

- a V3 J2 player can still perform T1→T2 upgrades after migration even before V4 J3;
- a V3 Crusher-achievement player retains T4 upgrade capability even before Forge Warden;
- existing T4 pieces remain valid as already required;
- this entitlement never marks J3/Warden complete and never unlocks unrelated content gated by those facts;
- a fresh V4 save has no migration capability entitlement and follows the new J3/Crusher/Warden cadence;
- Reset Progress may clear migration entitlements according to normal reset semantics.

Validation/sanitization recognizes only the bounded current Equipment tier capability grammar; `capability:*` must not become an arbitrary executable condition namespace.

Required tests cover RC1-earned-but-unspent T2 and T4 capability, fresh V4 behavior, reset behavior, and proof that the capability token cannot satisfy `stage-cleared`, `boss-defeated` or `achievement-completed`.

---

# 4. Tracker ownership of the late rules

| Rule | Primary implementation trackers |
| --- | --- |
| Stage settlement / reward replay / first-clear IDs | #85, #90, #170, #171 |
| Owned-tier / Mercenary / best-time migration | #87, #88, #89, #90, #170 |
| Historical Equipment tier capability floor | #89, #90, #170 |
| Part tier value / FIRE / early no-op Parts | #87, #170, #171 |
| Weapon-family data owner / Family N+1 | #87, #90, #170 |
| Campaign-complete frontier | #85, #165, #171 |
| Achievement historical receipts/outbox | #90, #171 |
| BossProgress simplification | #85, #90 |
| Warden Mastered-Fire/Warden-Down migration bridge | #90, #171 |
| Product/UI presentation of migrated state | #165, #171 |

Issue comments added during the review are clarifications of these documents, not an alternative authority.

---

# 5. What remains implementation proof, not planning PASS

This index does **not** make the RC1 implementation conformant.

Implementation still has to prove, at exact candidate SHAs:

- #164 runtime freeze remediation and trustworthy playtesting;
- #166 full intended Arena traversal/camera behavior;
- Save V4 migrations and write-first failure semantics;
- universal enemy damage/death settlement;
- first-class Equipment Sets/global tier policy;
- fabrication, merge and persistent Loadout behavior;
- logical-art/resource/bundle/tooling architecture;
- Contract-first scalable UI/touch extraction/result truth;
- current content rebalance and playtest pacing;
- Compendium;
- production art;
- synthetic N+1/scale cases;
- real device/manual/fun acceptance.

Do not convert unavailable evidence into PASS.

---

# 6. Review status

The early automated Codex review on PR #169 found valid issues and those historical threads were fixed/resolved. A fresh independent review of the later exact planning head has not been obtained because the configured Codex GitHub review path reported that its code-review usage quota was exhausted; an alternate App reviewer was not a repository collaborator.

Therefore:

```text
internal adversarial planning review:  PASS only when current-head CI/content checks are green and no further material contradiction remains
fresh independent final-head review:   UNVERIFIED / quota-blocked
Alpha 3 implementation/release PASS:   NOT YET
```

Any future independent review finding against the then-current exact head must be fixed and re-reviewed; this file is not permission to waive that gate.