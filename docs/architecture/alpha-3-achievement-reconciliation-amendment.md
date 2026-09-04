# Alpha 3 V4 — Achievement Reconciliation and Historical Gap Amendment

**Status:** narrow progression/reliability amendment discovered during the final RC1 durable-boundary audit.

**Implementation baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Scope:** recover legitimate condition-derived Achievement completions/rewards when their authoritative source fact became durable before the separate Achievement write. V3 historical gaps use frozen RC1 reward payloads; V4 gains one generic current-definition reconciliation path so the defect does not recur per Achievement.

This does not make every Achievement reward replayable and does not turn Achievement evaluation into a second progression-fact database.

---

# 1. RC1 split boundary

RC1 persists several authoritative source facts before evaluating condition-driven Achievements:

```text
Stage/Boss clear
-> Stage/Boss transaction persists
-> evaluate condition Achievements
-> Achievement completion/reward transaction persists separately

run win mastery
-> character mastery persists
-> evaluate mastery Achievement
-> Achievement completion/reward transaction persists separately
```

A failed second write is retried while the live scene survives, but app/browser exit after the source-fact write can leave:

```text
authoritative condition fact = true
Achievement completion       = absent
Achievement reward           = absent
```

For the normal RC1 Achievement transaction, completion state and its explicit rewards are in the same candidate write. Therefore a missing completion is also evidence that the normal reward transaction did not become durable.

---

# 2. Which shipped RC1 Achievements are vulnerable

Metric-driven Achievements are **not** in this historical gap table because RC1 commits the metric snapshot, completion state and reward through the same Achievement boundary:

```text
First Blood
Scrap Squad
Junkyard Veteran
Forge Initiate
Scrap Tycoon
```

First Victory has its own earlier ProgressionSystem shadow-token split and is handled by `alpha-3-first-victory-migration-amendment.md`.

Well Protected is retired and has its own frozen permanent-upgrade settlement in the final authority index.

The remaining condition-driven shipped gaps are exactly:

| Achievement | Historical authoritative condition | Frozen RC1 explicit reward |
| --- | --- | --- |
| `achievement:boss-crusher` / Crusher Down | `boss-crusher` defeated | 100 Scrap + `equipment:commando-helmet` entitlement + `reward:crusher-commando-helmet` T1 |
| `achievement:chapter-junkyard` / Junkyard Champion | J1..J5 all completed | 200 Scrap |
| `achievement:mastery-scrap-tabby` / Tabby Mastery | Scrap Tabby mastery tier >=1 | 75 Scrap |

This table is frozen historical migration data. Do not reconstruct it from mutable V4 Achievement definitions.

---

# 3. V3 -> V4 historical gap settlement

Before retiring V3 compatibility truth and before active V4 Achievement reconciliation, evaluate the frozen historical table against canonicalized V3 facts.

For each row:

## Completion already exists

```text
preserve completion
preserve legitimate historical reward/receipt state
DO NOT replay the historical reward
```

A missing/corrupt receipt alone is not permission to remint when completion is already authoritative.

## Historical condition true + completion absent

Settle the stranded RC1 event exactly once inside the V4 migration candidate:

```text
achievement completed = true
completedAt absent
apply the frozen RC1 explicit reward payload
```

No old Achievement receipt/fingerprint is fabricated; the original Achievement transaction never became durable. Migration versioning is the idempotency boundary.

If storage of the V4 migrated snapshot fails, no migrated completion/reward is published.

---

# 4. Frozen historical payloads

## 4.1 Crusher Down

If canonical historical `boss-crusher` is defeated and `achievement:boss-crusher` completion is absent:

```text
+100 Scrap
+explicit entitlement equipment:commando-helmet
+owned Equipment:
  instanceId  = reward:crusher-commando-helmet
  equipmentId = equipment:commando-helmet
  tier        = 1
```

The owned instance key must be unused or already the exact legitimate historical instance. Never overwrite a conflicting instance.

This settlement can legitimately create the historical duplicate Commando Helmet alongside `reward:stage-01-commando-helmet`. Therefore migration ordering must run `alpha-3-equipment-duplicate-migration-amendment.md` **after** historical Achievement-gap settlement. Duplicate consolidation then preserves the best copy and any real upgrade spend consistently.

Because Crusher Down completion is also historical evidence for RC1 T4 Equipment capability, derive the migrated capability floor **after** this settlement so a stranded Crusher achievement does not lose the capability it would have granted under RC1.

## 4.2 Junkyard Champion

If all current historical Junkyard Stage facts J1..J5 are completed and `achievement:chapter-junkyard` completion is absent:

```text
achievement completed = true
+200 Scrap
```

No timestamp/receipt is invented.

## 4.3 Tabby Mastery

If historical Scrap Tabby mastery tier >=1 and `achievement:mastery-scrap-tabby` completion is absent:

```text
achievement completed = true
+75 Scrap
```

Do not change the saved mastery tier merely to explain the completion.

---

# 5. Recommended V3 -> V4 migration order

The ordering is part of correctness because later migrations consume facts created by earlier historical settlements.

One valid sequence is:

```text
1. parse raw version + structurally sanitize bounded V1/V2/V3 fields
2. normalize V2 -> frozen V3 historical meaning where applicable
3. repair known historical Stage/Boss/Achievement compatibility evidence
4. evaluate frozen RC1 Mercenary selectability and promote character entitlements
5. settle First Victory token-only V3 gap
6. settle frozen condition-Achievement gaps from this amendment
7. settle retired Well Protected condition/reward gap
8. derive historical Equipment tier capability floor
9. apply Warden Mastered-Fire/Warden-Down historical bridge
10. collapse legitimate duplicate Equipment and refund removed-copy sunk spend
11. normalize/sanitize Part trait state and fabrication serial domain
12. clear incomparable current-ten Contract bestTimeMs / retire Boss firstDefeatedAt
13. remove active Achievement shadow tokens / permanent-upgrade domain
14. prune non-reportable platform outbox entries
15. validate/freeze/persist one Save V4 snapshot
16. run current V4 Achievement reconciliation (§6) against the accepted migrated save
```

Equivalent implementation ordering is acceptable only when focused tests prove identical final durable state and no historical evidence is destroyed before it is consumed.

Do not run current V4 Achievement definitions first; that could replace a stranded RC1 reward with a changed V4 payload before historical migration has settled it.

---

# 6. Generic V4 load-time Achievement reconciliation

V4 still has authoritative facts that may be committed in one boundary and condition-derived Achievements evaluated immediately afterwards. The normal live path should continue to evaluate after source-fact acceptance, but app exit between those boundaries must not permanently strand a current V4 Achievement.

After Save V4 load/migration and validated current registries are available, run one pure reconciliation evaluation over:

```text
current save.achievements
current achievementMetrics
current progression
current stages
current bosses
current character mastery
current active V4 Achievement definitions
```

For any **currently active** Achievement that is not completed and whose current condition/metric state is already satisfied:

1. construct the normal current V4 `AchievementCompletion`;
2. construct only that Achievement's explicit reward transaction `<achievementId>:completion` when rewards exist;
3. apply all newly reconciled completions/rewards to one candidate Save V4 snapshot;
4. persist once;
5. publish once.

A completion with no explicit reward needs no reward receipt.

If persistence fails, publish none and retry reconciliation at a later safe lifecycle/fact boundary.

This is generic registry/condition evaluation. No current Achievement ID switch is permitted.

---

# 7. Reconciliation does not replay completed history

If `save.achievements[id].completed === true`:

- never re-evaluate it as a new completion merely because the reward definition changed;
- never mint a missing current reward solely because the historical receipt is absent;
- never rewrite an old reward fingerprint;
- preserve retired/stale historical completion even if the definition no longer exists.

Historical migration settlements in §§2–5 run before current reconciliation specifically so V3 gaps use frozen RC1 payloads rather than current V4 reward definitions.

---

# 8. Reconciliation scope and cycles

The existing Achievement condition/cycle validation remains authoritative.

Current reconciliation may consume:

```text
metrics
Stage facts
Boss facts
mastery facts
explicit current entitlements where the validated condition permits
other completed Achievements only through the ordinary validated condition model
```

If multiple current Achievements become newly satisfied together:

- compute the deterministic completion group using the ordinary V4 evaluator;
- each reward-bearing Achievement owns only its own `<achievementId>:completion` payload;
- apply the complete group to one candidate save;
- do not let the first completion own sibling rewards.

Do not add repeated arbitrary fixed-point execution unless a real validated Achievement dependency requires it. Current cycle-free dependency ordering may be resolved deterministically by the existing evaluator/registry contract.

---

# 9. Native platform reporting

New completions accepted by V4 reconciliation follow the ordinary best-effort reporting path:

- local completion is authoritative;
- enqueue/report only if the platform mapping says the Achievement is reportable;
- failure remains in the durable outbox;
- no platform support is required for local PASS.

Historical V3 migration settlements should similarly queue only explicitly reportable current/historical platform identities when appropriate; an unknown retired mapping never creates an immortal pending entry.

---

# 10. Required tests

## V3 historical gaps

### Crusher Down

```text
boss-crusher defeated
Crusher Down completion absent
```

Result:

```text
completion true
+100 Scrap
historical equipment entitlement present
reward:crusher-commando-helmet T1 present
```

Then run duplicate-Equipment consolidation when the J1 helmet also exists.

Already-completed Crusher Down -> no reward replay.

Conflicting occupied reward instance ID -> fail/diagnose safely, never overwrite.

### Junkyard Champion

J1..J5 complete + achievement absent -> completed +200 once.

### Tabby Mastery

Scrap Tabby mastery >=1 + achievement absent -> completed +75 once.

## Ordering

A stranded Crusher Down settlement must contribute the historical T4 capability floor before final V4 snapshot acceptance.

A newly created duplicate Commando Helmet must be consolidated/refunded according to the duplicate amendment in the same migration.

## Current V4 reconciliation

- condition fact already durable + active Achievement missing -> load reconciliation completes/rewards it exactly once;
- metric already at/above target + active Achievement missing -> current V4 reconciliation completes it consistently;
- multiple newly satisfied Achievements receive separate reward ownership but one durable candidate write;
- persistence failure -> no completion/reward publication; retry later succeeds once;
- completed Achievement + changed reward definition -> no replay;
- retired historical completion survives absent definition;
- synthetic condition Achievement N+1 reconciles without core-code ID changes.

---

# 11. Non-goals

Do not create:

- one migration function per Achievement forever;
- a second Achievement database;
- reward replay based only on a true current condition when historical completion already exists;
- hidden unlock tokens as Achievement truth;
- another transaction manager.

Historical mappings are finite versioned migration data; current/future recovery is generic V4 reconciliation.

---

# 12. Implementation owners

- #90 — Save V4 migration, Achievement transaction/reconciliation, platform outbox;
- #171 — historical/current reward consistency;
- #170 — generic condition/registry/N+1 validation;
- `alpha-3-test-transition-plan.md` — transition tests.

---

# 13. PASS

This amendment passes when:

1. every legitimate shipped V3 condition-derived Achievement gap is settled using its frozen RC1 payload;
2. already-completed history never replays rewards;
3. migration ordering preserves duplicate-Equipment and historical capability semantics;
4. current V4 load-time reconciliation generically recovers satisfied-but-missing active Achievements;
5. each reward-bearing current completion owns only its own reward receipt;
6. persistence failure remains non-optimistic/retryable;
7. no current Achievement ID branch is required for reconciliation or N+1 content.