# Alpha 3 V4 — Terminal Settlement Eligibility Amendment

**Status:** narrow V4 architecture amendment discovered during the final adversarial review of PR #169.

**Implementation baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Scope:** this file amends two coupled terminal-settlement details: (1) eligibility validation for source-owned rewards whose own atomic settlement creates the qualifying fact, and (2) replay/migration handling when historical first-clear receipt fingerprints were bound to an older reward payload. All other authority, execution order, reward density, save, progression and N+1 rules remain in `alpha-3-final-execution-handoff.md` and `content-authoring-templates-v4.md`.

This is required because the V4 product matrix intentionally contains rewards such as:

```text
Junkyard 1 clear       -> Standard Barrel T1
Scrap Crusher defeat   -> Fire Trait Core T1
Forge Warden defeat    -> Mastered Fire Trait Core T3
```

while those Parts may become available because of the **same** Stage/Boss fact being committed by that clear. In addition, V4 deliberately changes RC1 first-clear reward payloads, so a legitimate historical receipt cannot be compared to the new payload as if it had always certified that payload.

---

# 1. Problems in the RC1 boundary

RC1 correctly persists a Stage first-clear reward receipt, Stage fact and optional Boss fact in one candidate save. Two later V4 requirements expose gaps around that otherwise sound atomicity.

## 1.1 Same-transaction eligibility

RC1 generic content-reward validation checks Part unlock conditions against the **pre-transaction** current save before the Stage/Boss fact is added.

Therefore a catalog-owned reward can be structurally valid yet be rejected because its own source transaction is the event that satisfies its availability condition.

The same class can occur for an Achievement-owned reward whose target content is gated by that same Achievement completion.

## 1.2 Historical receipt fingerprint versus changed catalog payload

RC1 durable receipts are payload-bound:

```text
transaction ID
+
grant fingerprint
```

A same-ID altered payload correctly fails closed for a retry of the **same source event**.

However V4 intentionally rewrites first-clear reward profiles. A V3 save may already contain:

```text
stage completed = true
applied receipt = stage:<id>:first-clear
fingerprint = RC1 reward payload
```

If a V4 replay reconstructs today's new RewardProfile and compares that new payload fingerprint to the historical RC1 fingerprint, the legitimate migrated clear fails forever.

The same problem would recur after any future deliberate reward rebalance if replay always revalidated history against today's catalog.

Do not solve these problems by:

- deleting meaningful unlock conditions from content definitions;
- weakening all reward validation;
- persisting Stage/Boss/Achievement facts first and paying rewards in a second save;
- inserting shadow unlock tokens before settlement;
- special-casing current Part IDs;
- rewriting a historical fingerprint so it appears to certify a reward the player never received;
- reminting a changed first-clear reward merely because the current catalog differs from the historical one.

---

# 2. Frozen rule: validate new source-owned settlement against projected facts

For a **new source-owned atomic settlement only**, reward eligibility is evaluated against a condition context containing:

```text
current durable facts
+
only the authoritative fact(s) that this exact transaction will commit atomically
```

Examples:

### Stage clear

May project:

```text
stage-cleared: <the exact stage being completed>
```

### Boss Stage clear

May additionally project:

```text
boss-defeated: <the exact boss owned by that Stage/encounter>
```

### Achievement completion transaction

May project:

```text
achievement-completed: <the exact completion(s) included in this atomic achievement commit>
```

A projected fact is **not durable state** and is never published independently. It exists only while validating/building the candidate save that will contain both the fact and its source-owned reward receipt.

---

# 3. Projection is deliberately narrow

Projection is forbidden for ordinary/ad-hoc durable grant application.

The generic grant boundary may not invent:

```text
future Stage clears
future Boss defeats
future Achievement completions
future mastery
future Scrap balance
future owned content
```

A caller cannot supply arbitrary projected facts.

Projection is derived internally from the authoritative source settlement itself:

- Stage registry + exact Stage ID;
- matching Stage boss/encounter identity;
- exact Achievement completion batch being committed.

If source identity is malformed or mismatched, validation fails closed.

---

# 4. Frozen replay rule: historical first clear is classified before current reward reconstruction

The durable **Stage completion fact** answers whether the player is attempting a new first clear or replaying an already-completed Contract.

Settlement order is therefore:

```text
1. validate Stage identity / matching boss-domain integrity
2. inspect durable Stage completion state
3a. if already completed -> replay path
3b. if not completed     -> new first-clear path
```

## 4.1 Replay path

When `save.stages[stageId].completed === true`:

- report `firstClear: false`;
- do **not** rebuild/apply today's first-clear reward transaction;
- do **not** compare a historical first-clear fingerprint to today's RewardProfile fingerprint;
- never mint newly-added/changed first-clear rewards;
- preserve historical receipt/fingerprint data unchanged;
- permit only the reviewed fact-only best-time improvement write;
- for a boss Stage, require/repair the authoritative Boss fact through migration rules before normal replay is considered healthy.

This rule is what makes deliberate RewardProfile tuning migration-safe.

A historical receipt fingerprint certifies the payload that was actually committed at that time. It is not a promise that every future catalog version will reconstruct the same reward.

## 4.2 Corruption containment

A first-clear receipt with no corresponding Stage completion fact is **not** evidence that the current reward should be replayed or considered successful. It is corrupted/inconsistent history and fails closed/diagnoses according to the migration/recovery path.

Conversely, a migrated durable Stage completion with no usable historical receipt must **not** be treated as a fresh first clear just to regenerate a reward. The Stage fact is sufficient to prevent duplicate first-clear payment; missing receipt history may be diagnosed/migrated but cannot cause reminting.

Do not manufacture a current-payload fingerprint for a historical completion when the historical payload was different or unknown.

---

# 5. New first-clear atomicity remains unchanged

Only when the Stage is not already durably completed does settlement resolve and apply the **current** catalog-owned first-clear reward.

The final durable write contains:

```text
source fact(s)
+
source-owned current reward grant effects
+
source-owned durable receipt + current payload fingerprint
+
other facts explicitly owned by the same settlement boundary
```

Then:

```text
persist once
publish once
```

If storage fails:

```text
no source fact becomes visible
no reward becomes visible
no receipt becomes visible
retry sees the same pre-transaction state
```

This preserves the existing write-first contract.

---

# 6. Stage settlement algorithm

Conceptually:

```text
validate Stage ID / time
resolve Stage definition
validate matching Stage/Boss/encounter identity

if durable Stage fact already says completed:
    require healthy authoritative facts for the replay path
    do NOT reconstruct/apply current first-clear reward
    optionally persist better best time only
    return { ok: true, firstClear: false, bestTimeImproved: ... }

# new first clear only below this line
resolve exact current catalog-owned RewardProfile
build exact expected durable reward transaction

projectedFacts = currentFacts
projectedFacts += stage-cleared(exact stage)
if boss stage:
    projectedFacts += boss-defeated(exact matching boss)

validate every reward target/reference
validate reward acquisition condition against projectedFacts

apply durable grants to candidate save
add Stage fact
add matching Boss fact when applicable
persist complete candidate once
publish only after persistence
return { ok: true, firstClear: true, ... }
```

Do not let reward validation project a different Stage/Boss than the transaction owns.

The context/persistence boundary should resolve or validate catalog-owned reward truth internally. Scene/UI input must not be able to turn a replay into a fresh reward event by supplying a different payload.

---

# 7. V3 -> V4 receipt migration rule

Save V4 preserves existing Stage facts, owned rewards, applied receipt IDs and recorded fingerprints. It does not recompute old receipt fingerprints from the mutable V4 reward catalog.

Required migration behavior:

- existing legitimate `reward:*` / Equipment/Part owned instances survive sanitization;
- existing `appliedGrantTransactions` and historical `grantTransactionFingerprints` survive unless independently invalid data must be sanitized;
- a completed migrated Stage remains completed and cannot receive V4 first-clear rewards again;
- a historical first-clear receipt may retain a fingerprint different from the current V4 RewardProfile indefinitely;
- migration does not overwrite that fingerprint with the V4 payload;
- known Boss facts are preserved/repaired from authoritative historical evidence according to Save V4 migration rules.

Frozen migration code/test data may know historical V3 IDs/facts when needed, but normal V4 runtime may not depend on today's RewardProfile reproducing an old fingerprint.

---

# 8. Achievement settlement algorithm

V4 Achievement completion already requires one atomic candidate save for the evaluated completion group.

For each **new** completion-owned explicit reward transaction:

```text
project the exact Achievement completion fact(s) already included in the candidate evaluation
validate reward target/acquisition route against that projected condition context
apply each source-owned reward receipt to the same candidate save
persist the entire completion group once
publish once
```

Already-completed achievements are not re-completed merely because reward definitions later change.

No first Achievement in a batch owns sibling reward payloads.

A reward for Achievement A may not project unrelated Achievement B unless B is also an actual completion in the same authoritative evaluation batch.

---

# 9. Current V4 examples that must pass

### Junkyard 1

If Standard Barrel becomes available on `stage:junkyard-01` clear, a **new** first-clear Standard Barrel reward validates against the candidate context containing that exact Stage clear.

A migrated RC1 J1 clear with the old receipt/fingerprint remains a replay under V4 and receives no new V4 first-clear reward.

### Scrap Crusher

If Fire Trait Core availability is gated by `boss-crusher`, a new Crusher first-clear physical Fire Trait Core validates against the candidate context containing the matching Crusher defeat fact.

A migrated RC1 Crusher clear retains its historical reward/receipt and is not converted into a new V4 first clear.

### Forge Warden

`part:trait-fire-mastered` remains reward-only/non-fabricable and may use `boss-defeated: boss-forge` as its visibility/availability condition. A new Warden first-clear T3 Mastered Fire reward validates against the candidate context containing that exact Boss defeat.

None of these require a duplicate `unlock-part` token.

---

# 10. Required RED -> GREEN tests

## Same-source success

```text
J1 pre-clear save
+ exact current J1 first-clear settlement
-> Stage fact + Standard Barrel + receipt persist together
```

```text
Crusher pre-clear save
+ exact current Crusher boss clear settlement
-> Stage fact + boss fact + Fire Trait Core + receipt persist together
```

```text
Warden pre-clear save
+ exact current Warden boss clear settlement
-> Stage fact + boss fact + Mastered Fire Core T3 + receipt persist together
```

## Direct-grant rejection

The same gated Part submitted through an ordinary/ad-hoc grant boundary **before** its Stage/Boss/Achievement fact exists must still be rejected.

## Projection containment

- J1 settlement cannot project J2 clear.
- Crusher settlement cannot project Forge Warden defeat.
- non-boss Stage cannot project any boss fact.
- malformed Stage/Boss mismatch fails before reward application.
- Achievement A cannot project an uncompleted Achievement B.

## Failure atomicity

For each representative Stage/Boss/Achievement case:

```text
storage failure
-> no fact
-> no item
-> no currency change
-> no receipt
```

Retry after recovery succeeds exactly once.

## Historical fingerprint migration

Construct a V3 fixture with:

```text
Stage completed = true
old first-clear receipt present
old RC1 fingerprint present
old RC1 owned reward effects present
```

Then load under V4 where the current RewardProfile has a different payload.

PASS:

```text
historical receipt/fingerprint preserved
Stage still completed
replay returns firstClear:false
no fingerprint mismatch failure
no V4 first-clear Scrap/item reminted
only legitimate best-time improvement may persist
```

Repeat for a representative normal Stage and Boss Stage.

## Future reward-tuning regression

Complete a fresh V4 Stage under RewardProfile A, persist its receipt/fingerprint, then run the same save against a test catalog where that Stage now has RewardProfile B.

Replay must still:

```text
firstClear:false
no new reward
no historical fingerprint rewrite
no mismatch failure merely because current reward data changed
```

## Corruption containment

- receipt present + Stage fact missing -> fail closed / migration diagnostic, never remint;
- Stage completed + receipt missing -> never pay a new first-clear reward solely to recreate the missing receipt;
- boss Stage replay with unrepaired missing Boss fact -> fail closed/diagnose rather than silently invent normal runtime truth.

---

# 11. N+1 rule

This correction remains generic.

Future content may express:

```text
new Contract fact -> new Part becomes available and first copy is granted
new Boss fact     -> reward-only Part is granted
new Achievement   -> content becomes available and an explicit reward is paid
```

without editing source code for the new content ID.

The implementation must project **fact types + exact source identities**, never current release IDs.

Future reward tuning also must not require receipt-ID churn merely to keep old clears replayable; completed source facts classify replay before current reward reconstruction.

---

# 12. Ownership / implementation location

Expected implementation ownership is the existing durable settlement boundary in `src/engine/context.ts`, Save V4 migration, and a small pure helper if needed to construct/evaluate projected condition contexts.

Do not add a second transaction manager.

Relevant implementation trackers:

- #85 — Stage/Contract settlement;
- #90 — Save V4 / progression/receipt migration;
- #170 — generic acquisition/authoring validation;
- #171 — current reward/content matrix.

---

# 13. PASS

This amendment passes implementation when:

1. new source-owned same-transaction rewards can consume only their own projected authoritative facts;
2. ordinary/ad-hoc grants cannot project future facts;
3. new fact + reward + receipt remain one durable write;
4. storage failure remains non-optimistic;
5. completed Stage facts classify replay before current reward reconstruction;
6. historical receipt/fingerprint payloads survive V4 reward-profile changes without reminting or false mismatch failure;
7. receipt-without-fact corruption still fails closed;
8. current J1/Crusher/Warden new-first-clear cases pass;
9. representative V3 migrated normal/boss Stage replay passes;
10. a synthetic N+1 same-source reward passes with no content-ID branch.

This is a correction to the V4 settlement contract, not a relaxation of validation.