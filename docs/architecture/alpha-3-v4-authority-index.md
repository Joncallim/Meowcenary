# Alpha 3 V4 — Final Authority Index

**Status:** canonical implementation reading order after the final adversarial planning review.

**Implementation baseline audited:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Planning branch / review PR:** `codex/alpha3-art-compendium-planning` / #169.

This file is an index and supersession register, not a second full design. The base V4 plan was reviewed repeatedly against the RC1 implementation; later material findings are either frozen in dedicated amendments or listed here when they were too narrow to justify another subsystem document.

If two documents conflict, follow the precedence below.

---

# 1. Required reading order

1. **`alpha-3-v4-authority-index.md`** — this file; final precedence and late-review corrections.
2. `alpha-3-final-execution-handoff.md` — base V4 slice order, ownership and product/architecture target.
3. `content-authoring-templates-v4.md` — canonical ordinary-content/N+1 schemas and authoring rules.
4. `alpha-3-terminal-settlement-amendment.md` — source-owned projected facts, historical reward receipts/fingerprints, stable first-clear Part identities.
5. `alpha-3-owned-state-migration-amendment.md` — owned Equipment/Part tier preservation, Mercenary grandfathering, V3 Contract performance migration.
6. `alpha-3-part-tier-value-amendment.md` — meaningful Part tiers, FIRE layering, early-Part usefulness corrections.
7. `alpha-3-weapon-family-authoring-amendment.md` — data-owned WeaponFamily/Gunsmith compatibility and Family N+1 proof.
8. `alpha-3-test-transition-plan.md` — final invariants versus RC1 plumbing tests.
9. Domain gameplay/art/Compendium documents referenced by the final handoff.
10. `alpha-3-scalability-closeout.md` and `alpha-3-checkpoint-review-ledger.md` — evidence/reasoning history, not competing implementation schemas.

Historical redirect stubs are deliberately non-authoritative:

- `alpha-3-implementation-blueprint.md`
- pre-V4 `content-authoring-templates.md`
- pre-V4 `content-authoring-template-coverage.md`

---

# 2. Base architecture that remains frozen

Unless a later rule below says otherwise:

- Contract/Stage is the normal campaign composition root.
- Arena is physical location, not a competing campaign progression system.
- legacy Golden Run may remain explicit Training compatibility.
- automatic targeting/firing remains primary; touch/keyboard/controller share one logical-action model.
- one authoritative save domain owns each gameplay fact.
- persistent mutation is write-first/atomic; failed persistence publishes no optimistic durable state.
- ordinary N+1 content uses validated data/assets + existing registered mechanic primitives.
- stable IDs and sparse persistence are retained.
- deterministic pools/composition are explicit; definition existence never silently enters old pools.
- no content-ID gameplay branches, generic ECS, arbitrary executable JSON, mod runtime or scripting framework are introduced merely for scalability.
- product PASS requires real play/device/fun evidence; green CI alone is insufficient.

---

# 3. Dedicated amendment precedence

## 3.1 Terminal settlement and versioned reward history

`alpha-3-terminal-settlement-amendment.md` wins over conflicting earlier settlement details.

Key consequences:

- a **new** source-owned Stage/Boss/Achievement settlement may validate a gated reward against current durable facts plus only the exact authoritative fact(s) that same atomic transaction will commit;
- arbitrary/direct grants may not project future facts;
- fact + reward + receipt remain one durable write;
- completed Stage state classifies replay **before** today's RewardProfile is reconstructed;
- a historical receipt/fingerprint certifies the payload actually committed historically, not the current catalog;
- changing a RewardProfile never remints a completed Stage reward or rewrites its old fingerprint;
- legitimate historical owned reward inventory survives changed future acquisition policy;
- current V4 first-clear physical Part IDs are the stable source-owned IDs frozen in that amendment.

## 3.2 Owned-state migration

`alpha-3-owned-state-migration-amendment.md` wins over the original handoff for V1–V3 owned state, except for the historical Equipment capability correction in §7 below.

Key consequences:

- legal owned Equipment and Part instance IDs/tiers survive migration;
- static definition tier is removed without rewriting legitimate owned tier;
- historically selectable RC1 Mercenaries are promoted to explicit `character:<id>` ownership entitlements rather than being relocked by changed V4 conditions;
- no fake new Stage/Mastery/Achievement facts are created to grandfather a character;
- a legitimate migrated `selectedCharacterId` remains selected;
- current ten Stage **completion facts** survive V3→V4, but their RC1 `bestTimeMs` values are cleared because the V4 Contract rulesets are materially different;
- the first V4 replay may establish a new V4 best time while remaining `firstClear:false`;
- legacy `reward:*` and `merged-*` Part IDs coexist with new fabricated `owned:<part-slug>:<serial>` IDs.

## 3.3 Part tier/value semantics

`alpha-3-part-tier-value-amendment.md` wins over earlier Part tuning/details.

Key consequences:

- any Part that can legally reach T2+ needs at least one real tier-sensitive contribution;
- shared FIRE remains the existing generic family-scoped package: 1.15x damage + burn behavior, deduped once per family;
- a fitted Part's own `effects` are independent source-owned engineering modifiers and are not removed by trait dedupe;
- ordinary Fire Trait Core is fabricable after Crusher, uses the amendment's first tuning values and has a small tier-scaled Part-owned damage contribution;
- Mastered Fire remains Warden-only/reward-only and a new Warden clear grants it as an owned T3 instance;
- Red-Dot Optic and Padded Stock cannot remain early silent no-op Parts; use the amendment's first tuning correction unless playtest deliberately retunes it.

## 3.4 Weapon family authoring

`alpha-3-weapon-family-authoring-amendment.md` wins over current three-family source constants.

Key consequences:

- add one small validated WeaponFamily catalog owning stable family ID/name + Gunsmith physical-slot compatibility;
- current shipped `pistol`, `smg`, `shotgun` behavior remains unchanged;
- the trait slot remains the current universal Gunsmith-family invariant;
- Gunsmith UI/gameplay, save sanitation and family-scoped validation consume the same registry;
- synthetic Family 4 using existing firing/merge/stat/trait mechanics must work without family-ID scene/controller/save branches or implicit old-pool changes.

---

# 4. Contract frontier and transient selection

The RC1 `normalStageTargetId()` wraps to the first available Stage when all available Stages are complete. That is not valid V4 product behavior.

V4 distinguishes:

```text
nextIncompleteContractId?: string
selectedReplayContractId?: string
```

Rules:

- when all current Contracts are complete, `nextIncompleteContractId` is absent;
- Home/Results use campaign-complete / Replay / Loadout / Career treatment rather than calling First Scavenge the next Contract;
- an explicitly selected completed Contract is a replay;
- future newly unlocked incomplete content naturally makes the frontier non-empty again;
- no final-stage-ID branch is required.

Full reset and any mutation that can make the transient selected Contract unavailable must recompute/revalidate selection against the new durable facts. A stale selected later-stage ID may never survive Reset Progress as a way to bypass the unlock chain.

---

# 5. Gunsmith merge and trait invariants

## 5.1 Merge identity is commutative

Merging two same-definition/same-tier owned Parts is semantically an unordered operation.

Before durable output identity is derived:

```text
canonicalize/sort the two consumed instance IDs
```

The same pre-state must satisfy:

```text
merge(A, B) == merge(B, A)
```

for both durable output ID and complete semantic output.

Caller selection order may not become permanent ownership identity.

## 5.2 Total behavior-trait cap

The current cap of two behavior traits applies to the **effective unique trait set** of a non-trait Part:

```text
effectiveTraits(instance)
= unique(definition.traits + instance.infusedTraits)

max unique effective traits = 2
```

Infusion:

- if the source trait is already present natively or by previous infusion, reject before consuming the source;
- if adding it would exceed two effective traits, reject before consuming the source;
- otherwise persist infused traits in one stable canonical BehaviorTrait order.

Examples:

```text
native PIERCING + attempted PIERCING -> reject/no consumption
native PIERCING + FIRE               -> allowed
native PIERCING + FIRE + EXPLOSIVE   -> reject/no consumption
```

Merge:

1. compute the unique union of both instances' infused traits;
2. include native definition traits in the total-cap check;
3. if total effective traits would exceed two, reject before consuming either input;
4. never `.slice()` or silently discard a paid/earned infused trait;
5. persist canonical infused-trait order;
6. derive output ID from the canonical unordered input pair.

Generic validation rejects unknown/duplicate trait state and definitions that begin above the supported effective-trait cap.

### Save V3 migration for traits

Normal shipped RC1 gameplay could create native `PIERCING`/`EXPLOSIVE` + infused `FIRE`, but could not legitimately produce a third effective trait because the only shipped trait-slot infusion sources are Fire Core and Mastered Fire, both FIRE.

V4 sanitation therefore:

- preserves legitimate native+FIRE two-trait state;
- canonicalizes known unique infused traits;
- removes infused traits already native to the definition;
- bounds impossible/untrusted over-cap state deterministically to the supported total cap.

No legitimate shipped three-trait player build is silently destroyed by this correction.

---

# 6. Infusion consumption semantics

Infusion transfers the registered behavior trait, not the consumed trait Core's tier/definition engineering modifier.

```text
infuse Fire Core Tn into target
-> consume source Core
-> target keeps its own partId / owned tier / own modifiers
-> target gains infused FIRE
-> source Core's Part-owned tier modifier does not transfer
```

The merge/infusion confirmation UI shows the exact consumed source and exact resulting mechanical delta before commitment.

A reward-only/non-reacquirable trait Part is protected from destructive infusion under the current V4 rules.

Current content:

```text
ordinary Fire Trait Core
fabricable after Crusher
-> legal infusion source

Mastered Fire Trait Core
Warden-only / non-fabricable / one headline instance
-> may be fitted
-> NOT a legal destructive infusion source
```

Implement this from a generic acquisition/consumption policy, never a Mastered-Fire ID branch. A protected source fails with zero mutation. If future content genuinely needs a consumable reward-only source, define a reusable reacquisition/consumption contract deliberately rather than weakening the unique-item guard.

---

# 7. Preserve historically earned Equipment upgrade capability

The lower owned-state amendment originally preserved existing high-tier items but did not preserve unspent historical tier capability. That narrower statement is **superseded here**.

RC1 granted a real future upgrade action at:

```text
T2 -> stage:junkyard-02 completed
T3 -> boss-crusher defeated
T4 -> achievement:boss-crusher completed
```

Fresh V4 deliberately rebalances those milestones to:

```text
T2 -> stage:junkyard-03 completed
T3 -> boss-crusher defeated
T4 -> boss-forge defeated
```

A migrated player who already earned an RC1 capability does not lose that action merely because they had not spent Scrap before migration.

Persist the highest historical capability floor using a bounded migration entitlement, e.g.:

```text
capability:equipment-tier-2
capability:equipment-tier-3
capability:equipment-tier-4
```

Derive it from frozen RC1 facts before compatibility cleanup:

```text
J2 complete                  -> at least T2
boss-crusher defeated        -> at least T3
achievement:boss-crusher     -> at least T4
```

Shared V4 resolution:

```text
maxEquipmentTier = max(
  current V4 condition-derived capability,
  migrated historical capability floor
)
```

The capability token:

- does not mark J3/Warden/any Achievement complete;
- does not unlock unrelated content;
- exists only for migrated saves that earned it;
- is cleared by a full Reset Progress under normal reset semantics;
- is restricted to the bounded current Equipment tier capability grammar.

Fresh V4 saves have no historical capability token and follow J3/Crusher/Warden normally.

---

# 8. Entitlement bag is not a shadow fact database

Shipped V3 producers created automatic `achievement:*` shadow tokens and only these non-achievement explicit tokens:

```text
character:scrap-weasel
equipment:commando-helmet
```

There were no shipped `unlock-part`, `unlock-trait` or `unlock-stage` producers.

V4 rules:

- promote known historical Achievement evidence into `save.achievements` and remove live shadow-fact dependence;
- Stage/Boss/Achievement/Mastery conditions read only their authoritative domains;
- a valid historical explicit content entitlement may remain, but it never substitutes for a physical owned instance or a Stage/Boss/Achievement/Mastery fact;
- migration Equipment capability tokens are consumed only by the Equipment capability resolver.

## `owns-content` must be typed by cross-reference validation

The structural V3 validator accepted any canonical `prefix:slug` for `owns-content`. V4 production validation must additionally require that `owns-content.contentId` resolves to an **explicitly ownable content definition/domain**.

Therefore these are not legal generic `owns-content` targets:

```text
stage:*
achievement:*
capability:equipment-tier-*
```

Current/future ownable content domains are admitted explicitly through the validated content-ownership contract; adding a durable capability namespace does not turn it into a general unlock language.

---

# 9. Permanent availability must be monotonic

A persistent project/character/Contract should not become legitimately available and later relock because the player spent currency or progressed further.

For current V4 permanent availability/capability gates, allow only monotonic condition graphs:

```text
always
stage-cleared
boss-defeated
achievement-completed
mastery-reached
owns-content (validated explicit durable content ownership)
all / any composed only from monotonic children
```

Do not use by default for permanent availability:

- `scrap-total`, because it reads spendable current Scrap and can become false after spending;
- non-monotonic `not(...)` graphs;
- affordability checks disguised as unlock conditions.

`Scrap >= cost` remains transaction-time affordability. A lifetime economic milestone that must stay earned should become an authoritative Achievement/metric fact.

If a future product feature truly requires reversible eligibility, define it explicitly outside the permanent-unlock read model instead of weakening this invariant.

Generic validation includes synthetic failure cases for permanent Character/Set/Part/Contract definitions using spendable-Scrap or non-monotonic conditions.

---

# 10. Historical Warden migration bridge

The generic historical-reward rule remains: a completed Stage never receives today's changed first-clear payload merely because the catalog changed.

One V4 content relocation needs an explicit migration bridge because otherwise acquisition coverage is impossible:

```text
Mastered Fire Trait Core
V4: Warden-only + reward-only/non-fabricable
RC1 Warden reward: no Mastered Fire
RC1 live loot: no physical Part route
```

V3→V4 migration:

```text
if boss-forge is authoritatively defeated
AND no owned Part has partId = part:trait-fire-mastered
then create exactly:
  instanceId      = reward:stage-06-mastered-fire-trait
  partId          = part:trait-fire-mastered
  tier            = 3
  infusedTraits   = []
```

Rules:

- this is a versioned migration grant, not a replayed first-clear settlement;
- preserve the historical Warden Stage receipt/fingerprint unchanged;
- the next Warden play remains `firstClear:false`;
- do not grant a second copy if a legitimate Mastered Fire already exists;
- never overwrite an occupied different owned instance at the target ID; conflict fails/diagnoses safely;
- migration versioning + stable identity provide idempotency;
- result UI does not pretend the item was earned by the first post-migration replay.

General migration principle:

> If a release moves non-fabricable/non-repeatable content onto a sole milestone historical players may already have completed, versioned migration preserves acquisition coverage without rewriting the historical source receipt.

## Warden Down

V4 adds `achievement:boss-forge` / Warden Down for an already-existing authoritative boss fact.

Migration:

```text
boss-forge defeated
-> achievement:boss-forge completed = true
```

No invented `completedAt`.

Initial Warden Down has no explicit persistent reward; Warden Stage owns the headline Scrap/Mastered Fire milestone.

If a V4 platform mapping declares Warden Down reportable, migration queues its local completion for the existing best-effort platform outbox. If no mapping exists, local completion remains authoritative and no unknown pending entry is created.

---

# 11. Historical Achievement rewards and platform outbox

An already-completed V3 Achievement remains terminal historical state even if V4 changes/removes its reward definition.

Preserve:

- local completion;
- legitimate historical owned reward effects;
- historical reward receipt/fingerprint when present.

Do not:

- re-complete it;
- mint a new V4 replacement reward;
- rewrite its historical fingerprint against today's definition.

`pendingAchievementReports` is a best-effort native-platform mirror outbox, not gameplay truth.

V4 migration/sanitation:

- retains pending IDs that still have an explicit reportable V4/historical platform mapping;
- prunes retired/unknown non-reportable pending IDs so they cannot retry forever;
- never deletes the authoritative local historical completion solely because a platform mapping disappeared.

Active reportable pending entries still survive restart and retry through the existing GameContext outbox path.

---

# 12. BossProgress owns only the boss fact

RC1 stores `BossProgress.firstDefeatedAt`, but the value written is Stage `timeMs` run duration, not a wall-clock first-defeat timestamp. It duplicates/inconsistently names performance data and has no required V4 product role.

V4 active shape is simply:

```ts
interface BossProgress {
  readonly defeated: true;
}
```

Stage owns Contract performance time. Achievement completion owns `completedAt` where available. Migration does not invent a wall-clock boss timestamp.

---

# 13. Stale WeaponFamily save behavior

A syntactically bounded saved Gunsmith build may reference a family absent from the current WeaponFamily registry.

Do not silently coerce it to `pistol` and do not apply its engineering as if valid.

Preferred V4 behavior:

- preserve the stale build identity/data as unavailable where structurally safe;
- exclude it from active persistent-loadout resolution;
- a selected unavailable build cannot activate;
- UI may expose unavailable/delete/rebuild treatment;
- if the family definition returns in a compatible later build, the preserved stable reference may resolve again.

This follows the same non-destructive stale-content policy used elsewhere rather than reinterpreting player state.

---

# 14. Required implementation tracker ownership

| Rule | Primary trackers |
| --- | --- |
| Stage settlement / historical reward replay / first-clear IDs | #85, #90, #170, #171 |
| Owned tier / Mercenary / Stage-time migration | #87, #88, #89, #90, #170 |
| Historical Equipment capability floor | #89, #90, #170 |
| Entitlement/condition namespace + monotonic availability | #85, #87, #88, #89, #90, #170 |
| Part tier value / FIRE / early usefulness | #87, #170, #171 |
| Infusion protection + total trait cap + lossless merge | #87, #90, #170, #171 |
| WeaponFamily data owner / stale family / Family N+1 | #87, #90, #170 |
| Campaign-complete frontier / reset revalidation | #85, #90, #165, #171 |
| Historical Achievement receipts/outbox | #90, #171 |
| BossProgress simplification | #85, #90 |
| Warden Mastered-Fire / Warden-Down migration bridge | #90, #171 |
| Migrated-state presentation | #165, #171 |

Issue comments are implementation clarifications of these rules, not competing authority.

---

# 15. Evidence still required before implementation/release PASS

This planning PR does **not** make the RC1 runtime conformant.

Implementation still needs exact-SHA evidence for:

- #164 freeze remediation / trustworthy playtesting;
- #166 full intended Arena traversal/camera behavior;
- Save V4 migrations and write-first failure semantics;
- universal enemy alive→dead settlement;
- first-class Equipment Sets/global tier policy;
- fabrication, merge, infusion and persistent Loadout behavior;
- logical-art/resource/bundle/tooling architecture;
- Contract-first scalable UI, touch extraction and truthful results;
- current content rebalance and pacing;
- Compendium;
- production art;
- synthetic N+1/scale proofs including Character 20, Set 12 + 48 pieces, Part 50, Enemy/Compendium 50, Contract 25, Achievement 40, Family 4 and 500 logical static art IDs;
- real portrait touch, controller, mixed-input, viewport, lifecycle/soak/performance and independent fun/replayability evidence.

Unavailable evidence remains **UNVERIFIED**, never inferred green.

---

# 16. Review status

The first automated Codex review of PR #169 reviewed an early planning commit and found valid issues; those historical inline threads were fixed, replied to and resolved.

Fresh automated re-review of later heads was explicitly rejected because the configured Codex code-review quota was exhausted. The alternate App reviewer was not a repository collaborator.

Therefore:

```text
internal adversarial planning review:  PASS only after the exact final planning head has green CI and no further material contradiction
fresh independent final-head review:   UNVERIFIED / quota-blocked until new review evidence exists
Alpha 3 implementation/release PASS:   NOT YET
```

A future independent review finding against the then-current exact head must be fixed and re-reviewed; this index is not permission to waive that gate.
