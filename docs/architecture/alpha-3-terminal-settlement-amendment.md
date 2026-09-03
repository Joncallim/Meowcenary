# Alpha 3 V4 — Terminal Settlement Eligibility Amendment

**Status:** narrow V4 architecture amendment discovered during the final adversarial review of PR #169.

**Implementation baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Scope:** this file amends only the eligibility-validation timing for **source-owned durable rewards committed in the same atomic settlement as the fact that makes them eligible**. All other authority, execution order, reward density, save, progression and N+1 rules remain in `alpha-3-final-execution-handoff.md` and `content-authoring-templates-v4.md`.

This is required because the V4 product matrix intentionally contains rewards such as:

```text
Junkyard 1 clear       -> Standard Barrel T1
Scrap Crusher defeat   -> Fire Trait Core T1
Forge Warden defeat    -> Mastered Fire Trait Core
```

while those Parts may become available because of the **same** Stage/Boss fact being committed by that clear.

---

# 1. Problem in the RC1 boundary

RC1 correctly persists a Stage first-clear reward receipt, Stage fact and optional Boss fact in one candidate save. However, its generic content-reward validation checks Part unlock conditions against the **pre-transaction** current save before the Stage/Boss fact is added.

Therefore a catalog-owned reward can be structurally valid yet be rejected because its own source transaction is the event that satisfies its availability condition.

The same class of problem can occur for an Achievement-owned reward whose target content is gated by that same Achievement completion.

Do not solve this by:

- deleting meaningful unlock conditions from the content definition;
- weakening all reward validation;
- persisting the Stage/Boss/Achievement fact first and paying the reward in a second save;
- inserting a shadow unlock token before settlement;
- special-casing current Part IDs.

---

# 2. Frozen rule: validate against source-owned projected facts

For a **source-owned atomic settlement only**, reward eligibility is evaluated against a condition context containing:

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

Projection is derived internally from the authoritative source transaction itself:

- Stage registry + exact Stage ID;
- matching Stage boss/encounter identity;
- exact Achievement completion batch being committed.

If the source identity is malformed or mismatched, validation fails closed.

---

# 4. Atomicity remains unchanged

The final durable write contains the complete candidate state:

```text
source fact(s)
+
source-owned reward grant effects
+
source-owned durable receipt(s)
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

# 5. Stage settlement algorithm

Conceptually:

```text
validate Stage ID / time / matching Boss identity
resolve exact catalog-owned RewardProfile
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
```

Do not let reward validation project a different Stage/Boss than the transaction owns.

Replay behavior remains:

- an existing valid first-clear receipt does not remint first-clear rewards;
- a later clear may improve best time through the existing fact-only path;
- a receipt with missing certified facts is corruption/fail-closed, not success.

---

# 6. Achievement settlement algorithm

V4 Achievement completion already requires one atomic candidate save for the evaluated completion group.

For each completion-owned explicit reward transaction:

```text
project the exact Achievement completion fact(s) already included in the candidate evaluation
validate the reward target/acquisition route against that projected condition context
apply each source-owned reward receipt to the same candidate save
persist the entire completion group once
publish once
```

No first Achievement in a batch owns sibling reward payloads.

A reward for Achievement A may not project unrelated Achievement B unless B is also an actual completion in the same authoritative evaluation batch.

---

# 7. Current V4 examples that must pass

### Junkyard 1

If Standard Barrel becomes available on `stage:junkyard-01` clear, the first-clear physical Standard Barrel reward must validate against the candidate context containing that exact Stage clear.

### Scrap Crusher

If Fire Trait Core availability is gated by `boss-crusher`, the Crusher first-clear physical Fire Trait Core must validate against the candidate context containing the matching Crusher defeat fact.

### Forge Warden

`part:trait-fire-mastered` remains reward-only/non-fabricable and may use `boss-defeated: boss-forge` as its visibility/availability condition. The Warden first-clear reward must validate against the candidate context containing that exact Boss defeat.

None of these require a duplicate `unlock-part` token.

---

# 8. Required RED -> GREEN tests

## Same-source success

```text
J1 pre-clear save
+ exact J1 first-clear transaction
-> Stage fact + Standard Barrel + receipt persist together
```

```text
Crusher pre-clear save
+ exact Crusher boss clear transaction
-> Stage fact + boss fact + Fire Trait Core + receipt persist together
```

```text
Warden pre-clear save
+ exact Warden boss clear transaction
-> Stage fact + boss fact + Mastered Fire Core + receipt persist together
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

## Replay

Already-receipted first clear does not grant the item again even though the eligibility condition is now durably true.

---

# 9. N+1 rule

This correction remains generic.

Future content may express:

```text
new Contract fact -> new Part becomes available and first copy is granted
new Boss fact     -> reward-only Part is granted
new Achievement   -> content becomes available and an explicit reward is paid
```

without editing source code for the new content ID.

The implementation must project **fact types + exact source identities**, never current release IDs.

---

# 10. Ownership / implementation location

Expected implementation ownership is the existing durable settlement boundary in `src/engine/context.ts` plus a small pure helper if needed to construct/evaluate projected condition contexts.

Do not add a second transaction manager.

Relevant implementation trackers:

- #85 — Stage/Contract settlement;
- #90 — Save V4 / progression integration;
- #170 — generic acquisition/authoring validation;
- #171 — current reward/content matrix.

---

# 11. PASS

This amendment passes implementation when:

1. source-owned same-transaction rewards can consume only their own projected authoritative facts;
2. ordinary/ad-hoc grants cannot project future facts;
3. fact + reward + receipt remain one durable write;
4. storage failure remains non-optimistic;
5. replay remains exactly once;
6. current J1/Crusher/Warden reward cases pass;
7. a synthetic N+1 same-source reward passes with no content-ID branch.

This is a correction to the V4 settlement contract, not a relaxation of validation.