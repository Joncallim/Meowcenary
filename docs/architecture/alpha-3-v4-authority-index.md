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
5. `alpha-3-owned-state-migration-amendment.md` — owned-tier preservation, Mercenary grandfathering, Contract performance migration.
6. `alpha-3-equipment-duplicate-migration-amendment.md` — collapse legitimate RC1 duplicate Equipment without erasing sunk upgrade value.
7. `alpha-3-first-victory-migration-amendment.md` — repair the legitimate V3 First Victory token-only split boundary.
8. `alpha-3-part-tier-value-amendment.md` — meaningful Part tiers, FIRE layering and early-Part usefulness.
9. `alpha-3-weapon-family-authoring-amendment.md` — data-owned WeaponFamily/Gunsmith compatibility and Family N+1.
10. `alpha-3-test-transition-plan.md` — final invariants versus temporary RC1 tests.
11. Domain gameplay/art/Compendium documents referenced by the final handoff.
12. `alpha-3-scalability-closeout.md` and `alpha-3-checkpoint-review-ledger.md` — evidence/history, not competing schemas.

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

# 3. Terminal settlement / historical reward authority

`alpha-3-terminal-settlement-amendment.md` supersedes earlier settlement details.

Frozen rules:

- a **new** source-owned Stage/Boss/Achievement settlement may validate a gated reward against current facts plus only the exact authoritative fact(s) that same atomic settlement commits;
- arbitrary/direct grants cannot project future facts;
- fact + reward + receipt persist once and publish once;
- completed Stage state classifies replay before today's RewardProfile is reconstructed;
- historical receipt/fingerprint = evidence of the historical payload, not today's catalog;
- changing a RewardProfile never remints a completed Stage reward or rewrites its old fingerprint;
- legitimate historical owned reward inventory survives later acquisition-policy changes;
- current V4 first-clear physical Part owned IDs are the stable IDs frozen in that amendment.

The one deliberate exception is the versioned Warden content-relocation bridge in §10: it is migration state, never a replayed first-clear reward.

---

# 4. Save-version convergence / earned-state preservation

V1/V2/V3 must converge to one V4 meaning rather than three unrelated migrations.

`alpha-3-owned-state-migration-amendment.md` governs general owned state, subject to the duplicate/capability corrections below.

## Owned state

- legal Equipment/Part IDs and owned tiers survive definition-tier removal;
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

Do not fake mastery/Stage/Achievement history to preserve a character. A legitimate migrated `selectedCharacterId` remains selected. Roster/Career counts and locked-state presentation must consume the same shared availability resolver as actual selection.

## Contract performance

The current ten V3 Stage **completion facts** survive. Their RC1 `bestTimeMs` values do not: V4 materially changes objectives/encounters/difficulty/Forge location, so old times are incomparable. First V4 replay may establish a new best while remaining `firstClear:false`.

## V2 permanent upgrades

V2 already stores purchased permanent upgrades and RC1 V2→V3 preserves them. V4 retirement refunds therefore cannot be conditioned on literal input `version === 3`. Equivalent V2/V3 purchased state must produce the same frozen historical refund. V1 has no purchased-upgrade state and receives no fabricated refund.

---

# 5. Historical duplicate Equipment

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

# 6. Equipment capability grandfathering

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

# 7. Entitlements and permanent availability

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

# 8. Gunsmith Part / merge / infusion authority

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

# 9. WeaponFamily authoring / stale builds

`alpha-3-weapon-family-authoring-amendment.md` replaces current hard-coded `pistol | smg | shotgun` family lists with one small validated family catalog owning stable family identity/name + Gunsmith physical-slot compatibility. The trait slot remains the current universal Gunsmith-family invariant.

Current shipped behavior remains unchanged. Synthetic Family 4 using existing mechanics must work through Weapon registry/Gunsmith/save/persistent loadout without family-ID source switches or implicit pool changes.

A syntactically bounded saved build whose family is absent from the current registry is preserved as stale/unavailable where structurally safe rather than coerced to pistol. It contributes no active engineering, selected unavailable build cannot activate, and UI may offer delete/rebuild. A later compatible return of the family can resolve the stable reference again.

---

# 10. Historical Warden / Boss migration

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

# 11. Historical Achievement migrations / outbox

Already-completed historical Achievements remain terminal history even if V4 changes/removes their reward definitions. Preserve completion, legitimate old reward effects and historical receipt/fingerprint where present. Do not re-complete, mint replacement rewards or rewrite historical fingerprints.

`pendingAchievementReports` is a best-effort platform mirror. Retain pending IDs only when an explicit current/historical platform mapping remains reportable; prune retired/unknown non-reportable IDs while keeping the local completion authoritative.

## First Victory split-boundary repair

`alpha-3-first-victory-migration-amendment.md` governs this unique V3 partial-terminal state.

RC1 persists on a win in order:

```text
1. ProgressionSystem banks run Scrap + legacy achievement:first-victory token
2. Achievement system persists First Victory completion + its 25 Scrap reward
```

So a legitimate V3 save can contain:

```text
legacy First Victory token present
First Victory completion absent
```

which proves the second atomic Achievement write did not become durable.

Migration:

- V3 token-only + no completion -> set First Victory completed, no invented `completedAt`, add frozen 25 Scrap once, then remove the shadow token;
- V3 completion already present -> preserve; no 25 replay;
- direct V2 legacy token is first normalized through frozen V2→V3 meaning, which creates completion evidence but did not historically grant the V3 reward, so it does **not** enter the V3 token-only compensation case;
- no token/no completion -> no action;
- no old receipt/fingerprint is fabricated for the failed historical transaction.

V4 `ProgressionSystem` banks run Scrap only, so this split state cannot be created going forward.

## Retired Well Protected settlement

`achievement:permanent-reinforced-coat-3` / Well Protected leaves the active V4 catalog, but its historical condition/reward is settled fairly before permanent upgrades are removed/refunded.

Frozen condition/reward:

```text
reinforced-vest level >= 3
reward = 150 Scrap
```

- completion/history already exists -> preserve; do **not** replay 150;
- structurally legal V2/V3 historical Vest>=3 with no completion evidence -> set completed true, no invented `completedAt`, add 150 Scrap once with safe-int clamp;
- this is versioned migration settlement, not replayed Achievement transaction; do not fabricate old receipt/fingerprint;
- invalid hand-edited/clamped upgrade level is not compensation evidence.

Equivalent V2/V3 historical state converges to the same V4 result.

---

# 12. Contract/UI consistency after migration

- full Reset Progress clears migrated entitlements/capability floors and recomputes transient Contract selection/frontier;
- migrated Stage completed + no new best time displays cleanly as completed without `0`/stale RC1 time;
- Mercenary roster/Career uses the same entitlement-aware availability resolver as actual selection;
- migrated high-tier Equipment displays its real owned tier separately from current/max upgrade capability;
- historical migration grants/repairs are not presented as if earned by the first post-migration gameplay action.

---

# 13. Tracker ownership

| Rule | Primary trackers |
| --- | --- |
| Stage settlement / replay / stable reward IDs | #85, #90, #170, #171 |
| Owned tier / Mercenary / Stage-time migration | #87, #88, #89, #90, #170 |
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

# 14. Evidence still required

This planning PR does **not** make RC1 conformant or Alpha 3 release-ready. Implementation still needs exact-SHA evidence for:

- #164 freeze remediation / trustworthy playtesting;
- #166 full intended Arena traversal/camera behavior;
- Save V4 migrations and atomic failure semantics;
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

# 15. Review status

The original automated Codex review covered an early planning commit and found valid issues; those historical threads were fixed/replied/resolved.

Fresh re-review of later heads has been explicitly rejected because the configured Codex code-review quota is exhausted; the alternate App reviewer is not a repository collaborator.

Therefore:

```text
internal adversarial planning review:  PASS only after exact final planning-head CI is green and no further material contradiction remains
fresh independent final-head review:   UNVERIFIED / quota-blocked until new review evidence exists
Alpha 3 implementation/release PASS:   NOT YET
```

Any future independent final-head finding must be fixed and re-reviewed; this index is not permission to waive that gate.
