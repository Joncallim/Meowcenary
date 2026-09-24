# Alpha 3 V4 — Final Authority Index

**Status:** canonical implementation reading order after the final adversarial planning review.

**Implementation baseline audited:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Planning branch / PR:** `codex/alpha3-art-compendium-planning` / #169.

This is a precedence/supersession register, not a second full design. Detailed rationale and tests live in the referenced documents. When documents conflict, follow the order below.

---

# 1. Required reading order

1. **`alpha-3-v4-authority-index.md`** — this file; final precedence and late-review corrections.
2. `alpha-3-final-execution-handoff.md` — base V4 slice order, ownership and product target.
3. `content-authoring-templates-v4.md` — canonical ordinary-content/N+1 schemas.
4. `alpha-3-terminal-settlement-amendment.md` — projected source facts, historical reward receipts/fingerprints, stable first-clear Part IDs.
5. `alpha-3-run-terminal-settlement-amendment.md` — one atomic normal V4 run-terminal progression write.
6. `alpha-3-owned-state-migration-amendment.md` — owned-tier preservation, Mercenary grandfathering, Contract performance migration.
7. `alpha-3-achievement-reconciliation-amendment.md` — settle stranded V3 condition-Achievement rewards with frozen RC1 payloads and add generic V4 load-time reconciliation.
8. `alpha-3-equipment-duplicate-migration-amendment.md` — collapse legitimate RC1 duplicate Equipment without erasing sunk upgrade value.
9. `alpha-3-first-victory-migration-amendment.md` — repair the legitimate V3 First Victory token-only split boundary.
10. `alpha-3-part-tier-value-amendment.md` — meaningful Part tiers, FIRE layering and early-Part usefulness.
11. `alpha-3-weapon-family-authoring-amendment.md` — data-owned WeaponFamily/Gunsmith compatibility and Family N+1.
12. `alpha-3-test-transition-plan.md` — final invariants versus temporary RC1 tests.
13. Domain gameplay/art/Compendium documents referenced by the final handoff.
14. `alpha-3-scalability-closeout.md` and `alpha-3-checkpoint-review-ledger.md` — evidence/history, not competing schemas.

Historical redirect stubs are non-authoritative:

- `alpha-3-implementation-blueprint.md`
- pre-V4 `content-authoring-templates.md`
- pre-V4 `content-authoring-template-coverage.md`

---

# 2. Base V4 invariants

Unless a later rule below explicitly supersedes one detail:

- Contract/Stage is the campaign Play root; Arena is physical location.
- Golden Run may remain explicit Training compatibility.
- auto-target/auto-fire remains primary; touch/keyboard/controller share logical actions.
- each persistent fact has one authoritative save domain.
- persistent writes are write-first/atomic; failed storage publishes no optimistic durable state.
- stable IDs, sparse persistence and explicit deterministic pools remain mandatory.
- ordinary N+1 content uses validated data/assets + existing registered mechanics.
- no content-ID gameplay branches, general scripting framework, ECS or mod runtime is added for ordinary scalability.
- logical art identity is separate from physical resource/atlas packing; renderer kinds describe rendering capability, not semantic owner.
- product PASS requires real device/manual/fun evidence; CI alone cannot declare the game ready.

---

# 3. Stage/source settlement history

`alpha-3-terminal-settlement-amendment.md` supersedes earlier first-clear/history details.

Frozen rules:

- a **new** source-owned Stage/Boss/Achievement settlement may validate a gated reward against current facts plus only the exact authoritative fact(s) that same atomic settlement commits;
- arbitrary/direct grants cannot project future facts;
- completed Stage state classifies replay before today's RewardProfile is reconstructed;
- historical receipt/fingerprint = evidence of the historical payload, not today's catalog;
- changing a RewardProfile never remints a completed Stage reward or rewrites its old fingerprint;
- legitimate historical owned reward inventory survives later acquisition-policy changes;
- current V4 first-clear physical Part owned IDs are the stable IDs frozen in that amendment.

The deliberate Warden relocation bridge in §12 is migration state, never a replayed first-clear reward.

---

# 4. Normal V4 run terminal persistence

`alpha-3-run-terminal-settlement-amendment.md` supersedes RC1's fragmented Stage/run-bank/mastery/Achievement success path.

A normal successful Stage terminal event builds **one candidate Save V4** that contains, as applicable:

```text
Stage completion / improved best time
matching Boss fact
current genuine-first-clear reward
this run's collected Scrap bank
metric:scrap-banked += actual run Scrap
win metric used by First Victory
current win mastery award
Achievements satisfied by the complete candidate Stage/Boss/metrics/mastery facts
each reward-bearing Achievement's own completion receipt
platform-report outbox additions
```

Persist once, publish once.

A loss uses the same run-level persistence owner for run Scrap, scrap-banked metric and any current loss-eligible Achievement consequences, but creates no fake Stage clear.

Training/legacy runs use the same run-level path without Stage first-clear semantics.

Replay rule remains version-safe:

```text
old first-clear reward does not replay
current repeat-run Scrap/mastery/metrics/Achievements still settle once
```

The normal terminal path evaluates Achievements against **candidate facts**, not stale pre-terminal state. This prevents fresh V4 First Victory, Crusher Down, Junkyard Champion, Tabby Mastery and Warden Down from being stranded behind a separately persisted source fact.

Alpha 3 does **not** add a new durable terminal-run receipt solely for double taps. Current browser persistence is synchronous and a live run is not re-submitted after process restart. The scene/run accepted terminal marker advances only after `settleRunTerminal()` returns a successful durable result; storage failure leaves the live run retryable. Existing Stage/Achievement receipts remain where their contracts need historical/source replay evidence.

A future resumable/asynchronous cross-process run system can justify a terminal receipt then; do not pre-build it now.

Result UI consumes the structured accepted terminal-settlement result. It does not reconstruct “what happened this run” from the whole save or historical unlock bag.

Load-time Achievement reconciliation remains a recovery/backstop, not the normal completion path for a terminal run.

---

# 5. Save-version convergence / earned-state preservation

V1/V2/V3 must converge to one V4 meaning rather than three unrelated migrations.

`alpha-3-owned-state-migration-amendment.md` governs general owned state, subject to the Achievement, duplicate-Equipment and capability corrections below.

## Owned state

- legal Equipment/Part IDs and owned tiers survive definition-tier removal unless a specific duplicate-consolidation rule applies;
- legacy `reward:*` and `merged-*` Parts coexist with new fabricated `owned:<part-slug>:<serial>` IDs;
- `fabricationSerials={}` is valid for pre-V4 saves, but a derived `owned:*` ID is never overwritten and the serial advances only after the complete candidate is durable;
- stale content fails soft; current progression gates do not retroactively invalidate a legal owned tier.

## Mercenaries

Historically selectable RC1 Mercenaries become explicit `character:<id>` ownership entitlements during migration before legacy compatibility evidence is removed.

Normal V4 selectability is:

```text
matching explicit character entitlement
OR
current V4 CharacterDefinition.unlock passes
```

Do not fake mastery/Stage/Achievement history to preserve a character. A legitimate migrated `selectedCharacterId` remains selected. Roster/Career counts and locked-state presentation consume the same shared availability resolver as actual selection.

## Contract performance

The current ten V3 Stage **completion facts** survive. Their RC1 `bestTimeMs` values do not: V4 materially changes objectives/encounters/difficulty/Forge location, so old times are incomparable. First V4 replay may establish a new best while remaining `firstClear:false`.

## V2 permanent upgrades

V2 already stores purchased permanent upgrades and RC1 V2→V3 preserves them. V4 retirement refunds therefore cannot be conditioned on literal input `version === 3`. Equivalent V2/V3 purchased state must produce the same frozen historical refund. V1 has no purchased-upgrade state and receives no fabricated refund.

---

# 6. Achievement gap settlement and current reconciliation

`alpha-3-achievement-reconciliation-amendment.md` owns the generic recovery rule.

RC1 metric-driven Achievements persist metric/progress/reward together and are not historical split cases. The condition-driven source facts below can become durable before their separate Achievement write:

```text
Crusher Down       <- boss-crusher fact
Junkyard Champion  <- J1..J5 Stage facts
Tabby Mastery      <- Scrap Tabby mastery fact
```

For V3 history where the frozen RC1 condition is true and completion is absent, migration settles the **frozen RC1 payload**, not the current V4 reward definition:

```text
Crusher Down      -> completed +100 Scrap + equipment:commando-helmet entitlement + reward:crusher-commando-helmet T1
Junkyard Champion -> completed +200 Scrap
Tabby Mastery     -> completed +75 Scrap
```

No historical `completedAt`, receipt or fingerprint is fabricated for a transaction that never became durable. Already-completed history never replays rewards.

Historical gap settlement runs before duplicate-Equipment consolidation and before historical Equipment-capability derivation, so a stranded Crusher Down correctly contributes both its historical duplicate item and its RC1 T4 capability evidence.

After accepted Save V4 load/migration, run one generic current-definition Achievement reconciliation pass. Any **active, missing** Achievement already satisfied by current canonical metrics/facts completes through the ordinary V4 per-achievement reward ownership model, with all new completions/rewards in one candidate Save V4 write. Persistence failure publishes none and reconciliation remains retryable.

Completed history is never replayed merely because a reward definition changed or a receipt is missing.

First Victory and retired Well Protected have special historical evidence/payload rules in §13 because their RC1 boundaries differ from the generic condition-Achievement case.

---

# 7. Historical duplicate Equipment

`alpha-3-equipment-duplicate-migration-amendment.md` supersedes the generic preserve-all-owned-instances rule for duplicate same-definition Equipment.

RC1 legitimately permits both:

```text
reward:stage-01-commando-helmet
reward:crusher-commando-helmet
```

for `equipment:commando-helmet`, while V4 permits one owned instance per Equipment definition.

Migration:

1. keep the highest legal tier;
2. tie -> prefer exactly-one-equipped copy;
3. tie -> stable lexicographic ID;
4. rewrite loadout to survivor if needed;
5. refund only frozen RC1 upgrade spend sunk into the removed **legitimate** duplicate:

```text
removed T1 =   0
removed T2 = 100
removed T3 = 250
removed T4 = 450
```

- safe-integer clamp;
- historical source receipts/fingerprints remain unchanged;
- do not replay either source to recreate the removed copy;
- arbitrary/unrecognized duplicate edits may be consolidated but mint no compensation;
- compensation requires an originally legal raw historical tier, not `tier:99` sanitized to T4.

After migration, active Equipment obeys one instance per definition and needs no duplicate-management feature.

---

# 8. Equipment capability grandfathering

The lower owned-state amendment's original statement that only existing high-tier items are grandfathered is superseded here.

RC1 granted a real unspent future upgrade capability at:

```text
T2 -> J2 complete
T3 -> boss-crusher defeated
T4 -> achievement:boss-crusher completed
```

Fresh V4 deliberately rebalances to:

```text
T2 -> J3 complete
T3 -> boss-crusher defeated
T4 -> boss-forge defeated
```

A migrated player keeps the highest capability already earned under RC1. Persist a bounded migration capability entitlement, e.g.:

```text
capability:equipment-tier-2
capability:equipment-tier-3
capability:equipment-tier-4
```

and resolve:

```text
maxEquipmentTier = max(live V4 capability, migrated historical capability floor)
```

The capability token never fabricates J3/Warden/Achievement facts, never unlocks unrelated content, exists only on qualifying migrated saves and is cleared by full Reset Progress. Fresh V4 saves follow J3/Crusher/Warden normally.

---

# 9. Entitlements and permanent availability

`progression.unlocks` is an explicit entitlement bag, not a shadow fact DB.

Shipped V3 produced automatic `achievement:*` shadows plus only these non-Achievement explicit content tokens:

```text
character:scrap-weasel
equipment:commando-helmet
```

No shipped V3 producer created `unlock-part`, `unlock-trait` or `unlock-stage` tokens.

V4 rules:

- promote historical Achievement evidence into `save.achievements` and remove live shadow-fact fallback;
- Stage/Boss/Achievement/Mastery conditions read only their authoritative domains;
- historical explicit content entitlement may remain but is not physical inventory or a progression-fact alias;
- migration `capability:equipment-tier-*` tokens are consumed only by the Equipment capability resolver.

## `owns-content` cross-reference

Structural `prefix:slug` validity is insufficient. Production validation requires `owns-content.contentId` to resolve to an explicitly ownable content definition/domain.

These are not legal generic `owns-content` targets:

```text
stage:*
achievement:*
capability:equipment-tier-*
```

## Permanent availability must be monotonic

Current permanent Character/Contract/Set/Part/tier-capability gates may use only monotonic graphs:

```text
always
stage-cleared
boss-defeated
achievement-completed
mastery-reached
owns-content (validated durable content)
all / any of monotonic children
```

Do not use spendable `scrap-total`, non-monotonic `not(...)` or affordability disguised as an unlock. `Scrap >= cost` is transaction-time affordability. A lifetime economic milestone that must remain earned uses an authoritative metric/Achievement fact.

A future genuinely reversible eligibility feature must be explicit and separate rather than weakening permanent-unlock semantics.

---

# 10. Gunsmith Part / merge / infusion authority

`alpha-3-part-tier-value-amendment.md` governs current Part value and FIRE semantics.

## Tier value / FIRE

- every Part legal at T2+ needs at least one tier-sensitive real contribution;
- shared FIRE preserves RC1's generic family package: 1.15x damage + burn, deduped once per family;
- PartDefinition `effects` are separate source-owned engineering modifiers and still apply when the same trait is supplied elsewhere;
- ordinary Fire Core is fabricable after Crusher with the amendment's first tuning values;
- Mastered Fire is Warden-only/reward-only, new Warden clear grants owned T3;
- Red-Dot and Padded Stock use the amendment's early-usefulness correction unless deliberately retuned by playtest.

## Merge is commutative and lossless

- canonicalize/sort consumed instance IDs before deriving output identity;
- deterministic output ID collision fails/diagnoses with zero consumption; never append `:2/:3`;
- caller order cannot change output ID or semantic result.

Effective behavior-trait cap on a non-trait Part is:

```text
unique(definition.traits + instance.infusedTraits) <= 2
```

Infusion rejects a trait already native/infused and rejects additions that exceed the cap before consuming the source.

Merge takes the unique union of both infused sets, includes definition-native traits in the cap and rejects before consumption if the output would exceed two. Never `.slice()` or silently discard a paid/earned trait. Persist one canonical trait order.

Shipped RC1 can legitimately contain native PIERCING/EXPLOSIVE + infused FIRE, but cannot legitimately produce a third effective trait; V4 sanitation preserves legitimate two-trait state while bounding impossible/untrusted over-cap state.

Keep separate constants even if both start at 2:

```text
MAX_EFFECTIVE_TRAITS_PER_PART
MAX_TRAIT_CORES_PER_BUILD
```

## Infusion transfers behavior only

Consuming a trait Core transfers the registered trait behavior, not the Core's own tier-scaled definition modifier.

Ordinary fabricable Fire Core is a legal source. Warden-only/non-fabricable Mastered Fire is protected from destructive infusion and may be fitted instead. Implement protection from generic acquisition/reacquisition policy, never a Mastered-Fire ID branch.

## Authoritative interactive commands

Fabricate/merge/infuse are narrow GameContext commands receiving stable IDs only. The persistence boundary re-resolves latest owned state, definitions, costs/conditions and eligibility, builds one candidate, saves once, publishes once.

Stale/consumed input, changed funds/eligibility, deterministic output collision or storage failure produces zero mutation. Direct interactive commands need no external-event receipt; current-state re-resolution + consumed stable IDs provide replay safety.

---

# 11. WeaponFamily authoring / stale builds

`alpha-3-weapon-family-authoring-amendment.md` replaces current hard-coded `pistol | smg | shotgun` family lists with one small validated family catalog owning stable family identity/name + Gunsmith physical-slot compatibility. The trait slot remains the current universal Gunsmith-family invariant.

Current shipped behavior remains unchanged. Synthetic Family 4 using existing mechanics must work through Weapon registry/Gunsmith/save/persistent loadout without family-ID source switches or implicit pool changes.

A syntactically bounded saved build whose family is absent from the current registry is preserved as stale/unavailable where structurally safe rather than coerced to pistol. It contributes no active engineering, selected unavailable build cannot activate, and UI may offer delete/rebuild. A later compatible return of the family can resolve the stable reference again.

---

# 12. Historical Warden / Boss migration

Historical completed boss-Stage repair is migration-only:

```text
stage:junkyard-05 completed -> boss-crusher defeated when missing
stage:junkyard-06 completed -> boss-forge defeated when missing
```

Normal V4 runtime never uses Stage completion as a Boss-fact fallback.

`BossProgress.firstDefeatedAt` is retired: RC1 wrote run duration `timeMs`, not a wall-clock first-defeat timestamp. V4 BossProgress owns only the defeat fact; Stage owns Contract performance and Achievement owns `completedAt` where available.

## Warden-only Mastered Fire bridge

Generic rule still says a completed historical Stage does not receive today's changed first-clear payload. But V4 moves non-fabricable Mastered Fire onto Warden as its sole acquisition route, while RC1 Warden did not grant it and live RC1 loot has no physical Part route.

V3→V4 migration therefore creates exactly one missing Mastered Fire only when authoritative `boss-forge` defeat already exists:

```text
instanceId    = reward:stage-06-mastered-fire-trait
partId        = part:trait-fire-mastered
tier          = 3
infusedTraits = []
```

- migration grant, not replayed first-clear settlement;
- preserve old Warden receipt/fingerprint;
- next Warden play remains `firstClear:false`;
- do not duplicate an already-owned Mastered Fire;
- never overwrite an occupied conflicting target ID;
- result UI does not pretend it was earned on the first post-migration replay.

V4 also adds `achievement:boss-forge` / Warden Down. Historical authoritative `boss-forge` defeat backfills `{completed:true}` with no invented timestamp. Warden Down has no explicit persistent reward because the Stage owns the headline reward. Queue a native-platform report only if the V4 platform mapping declares it reportable.

---

# 13. Special historical Achievement migrations / outbox

Already-completed historical Achievements remain terminal history even if V4 changes/removes their reward definitions. Preserve completion, legitimate old reward effects and historical receipt/fingerprint where present. Do not re-complete, mint replacement rewards or rewrite historical fingerprints.

`pendingAchievementReports` is a best-effort platform mirror. Retain pending IDs only when an explicit current/historical platform mapping remains reportable; prune retired/unknown non-reportable IDs while keeping the local completion authoritative.

## First Victory split-boundary repair

`alpha-3-first-victory-migration-amendment.md` governs this unique V3 partial-terminal state.

RC1 persists on a win in order:

```text
1. ProgressionSystem banks run Scrap + legacy achievement:first-victory token
2. Achievement system persists First Victory completion + its 25 Scrap reward
```

So a legitimate V3 save can contain the legacy token with completion absent, which proves the second atomic Achievement write did not become durable.

Migration:

- V3 token-only + no completion -> set First Victory completed, no invented `completedAt`, add frozen 25 Scrap once, then remove the shadow token;
- completion already present -> preserve; no 25 replay;
- direct V2 legacy token is first normalized through frozen V2→V3 meaning, which creates completion evidence but did not historically grant the later V3 reward, so it does **not** enter the V3 token-only compensation case;
- no token/no completion -> no action;
- no old receipt/fingerprint is fabricated.

V4 normal terminal settlement banks run Scrap + win metric + First Victory completion/reward in one candidate, so this split cannot recur.

## Retired Well Protected settlement

`achievement:permanent-reinforced-coat-3` / Well Protected leaves the active V4 catalog, but its historical condition/reward is settled fairly before permanent upgrades are removed/refunded.

Frozen condition/reward:

```text
reinforced-vest level >= 3
reward = 150 Scrap
```

- completion/history already exists -> preserve; do **not** replay 150;
- structurally legal V2/V3 historical Vest>=3 with no completion evidence -> set completed true, no invented `completedAt`, add 150 Scrap once with safe-int clamp;
- versioned migration settlement, not replayed Achievement transaction; no old receipt/fingerprint is fabricated;
- invalid hand-edited/clamped upgrade level is not compensation evidence.

Equivalent V2/V3 historical state converges to the same V4 result.

---

# 14. Contract/UI consistency after migration

- full Reset Progress clears migrated entitlements/capability floors and recomputes transient Contract selection/frontier;
- when every current Contract is completed, `nextIncompleteContractId` is absent rather than wrapping to First Scavenge; future newly unlocked incomplete content naturally restores a frontier;
- migrated Stage completed + no new best time displays cleanly as completed without `0`/stale RC1 time;
- Mercenary roster/Career uses the same entitlement-aware availability resolver as actual selection;
- migrated high-tier Equipment displays its real owned tier separately from current/max upgrade capability;
- historical migration grants/repairs are not presented as if earned by the first post-migration gameplay action;
- terminal result presentation consumes the accepted structured settlement result rather than reconstructing new rewards from historical state.

---

# 15. Tracker ownership

| Rule | Primary trackers |
| --- | --- |
| Stage/source settlement / stable reward history | #85, #90, #170, #171 |
| Atomic normal run terminal settlement | #85, #88, #90, #165, #170, #171 |
| Owned tier / Mercenary / Stage-time migration | #87, #88, #89, #90, #170 |
| V3 condition-Achievement gaps + V4 reconciliation | #90, #170, #171 |
| Historical duplicate Equipment consolidation/refund | #89, #90, #170 |
| Historical Equipment capability floor | #89, #90, #170 |
| Entitlement typing + monotonic availability | #85, #87, #88, #89, #90, #170 |
| Part tier/FIRE/usefulness | #87, #170, #171 |
| Lossless merge / trait cap / infusion protection / authoritative commands | #87, #90, #170, #171 |
| WeaponFamily/stale builds/Family N+1 | #87, #90, #170 |
| Campaign-complete frontier/reset | #85, #90, #165, #171 |
| Historical Achievement/outbox/V2/First Victory/Well Protected | #90, #171 |
| BossProgress / Warden migration | #85, #90, #171 |
| Migrated-state UI consistency | #88, #89, #165, #171 |

Issue comments clarify these documents; they are not competing authority.

---

# 16. Evidence still required

This planning PR does **not** make RC1 conformant or Alpha 3 release-ready. Implementation still needs exact-SHA evidence for:

- #164 freeze remediation / trustworthy playtesting;
- #166 full intended Arena traversal/camera behavior;
- Save V4 migrations and atomic failure semantics;
- atomic normal run terminal settlement;
- generic current Achievement reconciliation;
- universal enemy alive→dead settlement;
- first-class Equipment Sets/global tier policy;
- fabrication/merge/infusion/persistent Loadout;
- logical-art/resource/bundle/tooling architecture;
- Contract-first scalable UI, touch extraction and truthful result flow;
- current content rebalance/pacing;
- Compendium;
- production art;
- synthetic scale proofs: Character 20, Set 12 + 48 pieces, Part 50, Enemy/Compendium 50, Contract 25, Achievement 40, Family 4, 500 logical static art IDs;
- real portrait touch, controller, mixed input, target viewports, lifecycle/soak/performance and independent fun/replayability evidence.

Unavailable evidence is **UNVERIFIED**, never inferred green.

---

# 17. Review status

The original automated Codex review covered an early planning commit and found valid issues; those historical threads were fixed/replied/resolved.

Fresh re-review of later heads has been explicitly rejected because the configured Codex code-review quota is exhausted; the alternate App reviewer is not a repository collaborator.

Therefore:

```text
internal adversarial planning review:  PASS only after exact final planning-head CI is green and no further material contradiction remains
fresh independent final-head review:   UNVERIFIED / quota-blocked until new review evidence exists
Alpha 3 implementation/release PASS:   NOT YET
```

Any future independent final-head finding must be fixed and re-reviewed; this index is not permission to waive that gate.
