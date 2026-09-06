# Alpha 3 V4 — Atomic Run Terminal Settlement Amendment

**Status:** P1 architecture correction discovered during the final RC1 durable-boundary audit.

**Implementation baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Scope:** collapse the normal V4 terminal progression consequences of one finished run into one authoritative candidate Save V4 write. This removes RC1 crash windows between Stage clear, run-Scrap banking, mastery, terminal metrics and condition-derived Achievements. It extends the existing terminal-settlement architecture; it does not introduce another transaction manager or another required Save receipt domain.

---

# 1. RC1 durability topology is fragmented

A successful Stage run can currently cross several persistence boundaries:

```text
1. Stage clear transaction
   -> Stage fact / Boss fact / first-clear reward

2. ProgressionSystem run bank
   -> run-collected Scrap
   -> legacy First Victory shadow token

3. character mastery persistence
   -> mastery XP/tier

4. Achievement evaluation/commit
   -> run metrics
   -> Stage/Boss/mastery Achievements
   -> Achievement rewards
```

Each individual boundary is mostly write-first, but the **run outcome as a whole** is not atomic.

Crash/app-exit windows can therefore produce legitimate partial terminal state:

- Stage/Boss clear durable but run Scrap not banked;
- run Scrap durable but First Victory metric/completion absent;
- mastery durable but Tabby Mastery completion/reward absent;
- Boss fact durable but Crusher Down completion/reward absent;
- J1..J5 durable but Junkyard Champion absent.

The V3 migration amendments recover known historical instances of those splits. V4 must stop creating them.

---

# 2. Frozen V4 rule: one normal terminal progression settlement

For a terminal gameplay result, GameContext owns one pure/candidate settlement operation conceptually:

```ts
settleRunTerminal(input): RunTerminalSettlementResult
```

The input carries only authoritative run/source identity and immutable terminal facts needed to re-resolve current catalogs, for example:

```text
terminal status
run-collected Scrap amount
character ID
run duration / Stage completion time when applicable
Stage ID when this is a Stage extraction/clear
validated terminal run facts needed by current rules
```

UI/scene code does **not** supply reward payloads, prices, Achievement completions, mastery outputs, Boss IDs or current catalog truth as authoritative data. Context re-resolves them from current validated registries/source state.

---

# 3. Successful Stage settlement contents

For a normal successful Stage extraction, construct one candidate Save V4 containing all durable consequences owned by that terminal event.

Order of pure candidate construction:

```text
A. validate exact Stage / terminal input / matching encounter-Boss identity
B. classify first clear vs replay from durable Stage fact
C. resolve current first-clear RewardProfile only for a genuine new first clear
D. construct the exact Stage/Boss projected fact context
E. validate/apply current source-owned first-clear reward against only those projected facts
F. update Stage completion/best time and matching Boss fact
G. bank this run's collected Scrap exactly once
H. update terminal Achievement metrics:
     metric:scrap-banked += actual banked run Scrap
     metric:runs-completed += 1 on a V4 win per current First Victory semantics
I. apply the current win mastery award for the selected character
J. evaluate current active Achievements against the COMPLETE candidate facts/metrics/mastery
K. apply each new reward-bearing Achievement's own <achievementId>:completion transaction
L. append any reportable platform completion IDs to the durable best-effort outbox
M. persist the complete Save V4 candidate once
N. publish accepted state/result once
```

This means current V4 Crusher Down / Junkyard Champion / Tabby Mastery / First Victory / Warden Down cannot be stranded behind their source fact during ordinary terminal play.

---

# 4. Loss settlement contents

A lost run has no Stage-clear reward/fact unless another reviewed game rule explicitly says otherwise.

The one loss candidate still owns:

```text
bank actual run-collected Scrap
metric:scrap-banked += same actual banked amount
current loss-eligible Achievement metric/fact evaluation
any resulting current Achievement completions/rewards
platform outbox additions
```

Current V4 mastery remains win-owned unless a later reviewed product decision changes it.

Do not award `metric:runs-completed` on loss if the frozen First Victory semantics continue to mean a successful completed run; naming/copy must remain consistent with the chosen metric semantics.

If product later decides all terminal attempts count as completed runs, change the metric definition/copy deliberately in one place rather than silently altering settlement code.

---

# 5. Training / legacy run compatibility

A non-Stage/Training run uses the same terminal progression settlement without Stage/Boss/first-clear components.

It may still:

- bank collected run Scrap;
- update the appropriate terminal metrics;
- award win mastery if current product rules allow it;
- complete/reward current Achievements.

The explicit legacy run-request adapter remains compatibility input; it does not create a second persistence path.

---

# 6. Stage replay semantics remain version-safe

For an already-completed Stage:

- do not reconstruct/apply today's first-clear reward;
- preserve historical Stage reward receipt/fingerprint unchanged;
- update only a legitimate improved V4 best time in the Stage portion;
- still bank **this run's** collected Scrap and apply current run/mastery/Achievement consequences once.

Therefore:

```text
historical first-clear reward = never replayed
current repeat-run economy    = still settled normally
```

The rules from `alpha-3-terminal-settlement-amendment.md` remain authoritative for first-clear history.

---

# 7. Achievement evaluation uses candidate facts, not stale pre-terminal save

Achievement evaluation inside terminal settlement sees the complete candidate state produced by the same run:

- candidate Stage/Boss completion;
- candidate run metrics;
- candidate banked Scrap;
- candidate mastery;
- prior durable Achievement state.

This removes the need for hidden shadow tokens or a second follow-up write merely to let an Achievement observe a fact that this same terminal event owns.

Each reward-bearing Achievement still owns only its own reward receipt:

```text
<achievementId>:completion
```

When several complete together, all completion states/reward effects/receipts live in the one terminal candidate Save V4.

No first completion owns sibling rewards.

---

# 8. Duplicate terminal command / retry without another Save receipt

Alpha 3's current persistence target is synchronous browser-local persistence. A live RunState is not reconstructed and re-submitted after process restart. Therefore a new durable `terminalRunReceipts` save domain is **not required** merely to handle double taps.

Use the existing scene/run lifecycle guard, but advance the accepted/resolved terminal marker **only after** `settleRunTerminal()` returns a successful durable result.

Required live behavior:

```text
first terminal command enters settlement
successful Save V4 write returns
scene/run terminal state is marked accepted/resolved
later confirm/tap for that live run is ignored
```

On storage failure:

```text
no durable terminal state is published
the accepted/resolved marker is NOT advanced
the same live run may retry
```

Because local persistence is synchronous, two ordinary input events are processed serially; the second event observes the accepted state after the first successful call returns.

Context still re-resolves current persistent state and validates Stage/source inputs so stale caller data cannot manufacture reward truth.

Keep existing Stage first-clear and Achievement reward receipts where those contracts already require durable source replay/fingerprint evidence. Do not reuse a Stage first-clear receipt to represent repeat-run Scrap/mastery/metrics.

If a future platform introduces resumable persisted run sessions or genuinely asynchronous/concurrent terminal submission across process boundaries, add one reviewed terminal-source identity/receipt then. Do not pre-build that framework for Alpha 3.

---

# 9. Structured terminal result becomes presentation truth

Return a small immutable settlement result containing the facts the result UI needs, for example:

```ts
interface RunTerminalSettlementResult {
  readonly ok: boolean;
  readonly terminalApplied: boolean;
  readonly runScrapBanked: number;
  readonly firstClear: boolean;
  readonly bestTimeImproved: boolean;
  readonly firstClearScrap: number;
  readonly persistentGrantIds: readonly string[];
  readonly achievementIdsCompleted: readonly string[];
  readonly availabilityBefore: PersistentAvailabilitySnapshot;
  readonly availabilityAfter: PersistentAvailabilitySnapshot;
}
```

Exact shape may vary, but UI must not reconstruct terminal truth from the whole historical save or old `progression.unlocks` bag.

On storage failure the UI may show a retry/error state, but it must not present unpersisted rewards as accepted durable progress.

---

# 10. Current V4 load-time reconciliation remains a backstop

`alpha-3-achievement-reconciliation-amendment.md` still requires generic load-time reconciliation because:

- old migrated saves may contain historical gaps;
- future non-terminal durable commands may satisfy an Achievement condition;
- corrupted/older states need bounded recovery.

But normal V4 terminal play should not depend on a later load to finish its own Stage/run/mastery/Achievement consequences.

The normal path is one terminal candidate write; reconciliation is recovery/consistency, not the primary success path.

---

# 11. Interaction with historical migrations

Historical V1/V2/V3 migration runs before any new current terminal settlement.

Keep all previously frozen historical rules:

- First Victory V3 token-only +25 repair;
- condition-Achievement frozen RC1 gap settlement;
- Well Protected historical +150 when condition met/completion absent;
- Warden Mastered-Fire migration bridge;
- duplicate Equipment collapse/refund;
- Equipment capability floor;
- old best-time reset.

The new V4 terminal settlement prevents equivalent fresh splits after migration.

---

# 12. Required RED -> GREEN tests

## Stage success atomicity

Fresh V4 Crusher clear where the run also triggers First Victory/Tabby Mastery/Crusher Down:

one successful storage write produces together:

```text
Stage fact
Boss fact
current first-clear reward
run-collected Scrap bank
scrap-banked metric
runs-completed metric
mastery
First Victory completion/reward
Tabby Mastery completion/reward when eligible
Crusher Down completion/current V4 reward
all required existing receipts/outbox entries
```

No intermediate persistent snapshot is exposed.

## Storage failure matrix

Inject failure at the one terminal persistence boundary:

```text
no Stage/Boss fact
no first-clear reward
no run Scrap
no metric increment
no mastery
no Achievement completion/reward
no platform outbox addition
scene terminal accepted marker remains false
```

Retry after recovery commits once.

## Duplicate command

Two rapid terminal commands for the same live run:

```text
first successful call persists once and marks accepted
second live input is ignored
no double Scrap/mastery/metric/reward
```

A failed first persistence leaves the live run retryable.

## Stage replay

Completed Stage replay:

```text
firstClear:false
no historical reward remint
current run Scrap banks once
current mastery/metrics/Achievements settle once
new V4 best time may improve
```

## Loss

Lost run banks actual collected Scrap and scrap-banked metric once; no Stage first-clear reward/fact; current loss-eligible Achievements reconcile within same terminal write.

## Training

Training terminal uses the same run-level persistence path with no Stage first-clear semantics.

## Result truth

UI result data equals returned accepted settlement record; a failed storage attempt cannot appear as earned progress.

---

# 13. Implementation ownership

Primary implementation owner remains the existing GameContext/persistence boundary plus the current run terminal source adapter.

Expected trackers:

- #85 — Stage/Contract terminal integration;
- #90 — Save V4 / metrics / Achievement atomicity;
- #88 — mastery contribution into terminal candidate;
- #165 — result UI consumes structured settlement truth;
- #171 — current terminal reward/metric/product behavior;
- #170 — generic validation/N+1 constraints.

Do not create a second transaction service alongside GameContext.

---

# 14. PASS

This amendment passes when:

1. normal V4 terminal persistent consequences are one candidate Save write;
2. Stage/Boss facts, current first-clear reward, run Scrap, terminal metrics, win mastery and triggered Achievements cannot split across successful durability boundaries;
3. replay does not remint historical first-clear rewards but still settles current repeat-run economy;
4. loss/Training use the same run-level persistence owner without fake Stage data;
5. storage failure publishes none and remains retryable;
6. duplicate/mixed-input terminal commands settle once for the live run lifecycle without adding an unnecessary Alpha 3 terminal-receipt subsystem;
7. result UI consumes accepted settlement truth rather than reconstructing history;
8. load-time Achievement reconciliation remains a recovery backstop rather than the normal terminal completion path.