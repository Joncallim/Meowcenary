# Alpha 3 V4 — First Victory Split-Boundary Migration Amendment

**Status:** narrow Save V4 migration amendment discovered during the final RC1 terminal-order audit.

**Implementation baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Scope:** settle one legitimate V3 partial-terminal state created because RC1 banks the legacy First Victory shadow token and the Achievement completion/reward in two different durable boundaries. This is migration-only compatibility logic; V4 removes the split authority entirely.

---

# 1. RC1 ordering that creates the state

RC1 `ProgressionSystem` registers its `run:won` handler before the later GameScene Achievement handler. EventBus preserves registration order.

On a won run:

```text
1. ProgressionSystem.bankFinishedRun()
   -> computeRunReward()
   -> banks run Scrap
   -> adds legacy achievement:first-victory token to progression.unlocks
   -> persists

2. GameScene run:won achievement listener
   -> increments metric:runs-completed
   -> evaluateAchievements()
   -> First Victory completes
   -> explicit First Victory reward = 25 Scrap
   -> commitAchievementTransaction()
   -> persists completion + reward atomically
```

The scene retries a failed Achievement persistence while it remains alive, but a browser/app exit or explicit discard after the first write and before the second write can leave a legitimate V3 save with:

```text
progression.unlocks contains achievement:first-victory
save.achievements[first-victory] absent/not completed
First Victory 25 Scrap reward not paid
```

The second statement and reward cannot have diverged from each other through the normal RC1 Achievement boundary: they are in the same Achievement candidate write.

Therefore token-only V3 state is sufficient evidence of a stranded First Victory completion/reward.

---

# 2. Do not confuse V2 history with V3 split state

V2 already used the legacy First Victory token before the V3 Achievement-domain transition.

RC1 `migrateV2ToV3()` explicitly converts a V2 token into:

```text
achievements['achievement:first-victory'] = { completed: true }
```

without granting the later V3 Achievement reward.

V4 must preserve that historical meaning. A direct V2 input normalized through the frozen V2→V3 migration therefore has **completion present**, and does not satisfy the V3 token-only repair condition below.

Do not grant 25 Scrap to every old First Victory token regardless of source version/history.

---

# 3. Frozen V3 -> V4 repair

After V3 structural sanitation/canonicalization, but before removing Achievement shadow-token dependence, inspect First Victory history.

## Case A — First Victory already completed

If authoritative Achievement completion already exists:

```text
preserve completion
preserve any legitimate historical reward/receipt state
remove live dependence on the shadow token
DO NOT add another 25 Scrap
```

This includes canonicalized V2 history.

## Case B — V3 token-only split state

If all are true:

```text
source save is V3 history
progression.unlocks contains achievement:first-victory
save.achievements['achievement:first-victory'] is absent or not completed
```

then migration settles the stranded historical boundary exactly once:

```text
achievement:first-victory completed = true
completedAt absent (do not invent a timestamp)
progression.scrap += 25
safe-integer clamp
```

This is a versioned migration settlement, not a replayed current Achievement transaction.

Do not fabricate an old completion receipt/fingerprint for a transaction that never became durable.

After settlement, remove the legacy `achievement:first-victory` shadow token from the active V4 entitlement bag along with the other Achievement shadow tokens.

## Case C — neither token nor completion

Do nothing. The player has no historical First Victory evidence.

---

# 4. Why the 25 Scrap is safe

The RC1 First Victory Achievement reward is frozen historical data:

```text
grant-scrap: 25
```

The normal Achievement commit persists the completion state and reward together. Therefore:

```text
completion absent
+
legacy token already durable from the earlier ProgressionSystem write
=
reward was not durably committed through the normal First Victory Achievement transaction
```

Migration is not guessing whether the 25 was already paid.

This differs from a generic old Achievement whose condition happens to be true today: V4 does not replay old rewards merely because current facts satisfy an Achievement.

---

# 5. V4 removes the split authority

V4 `ProgressionSystem` banks run Scrap only. It no longer manufactures `achievement:first-victory` in `progression.unlocks`.

First Victory completion/reward is owned solely by the Achievement domain/atomic Achievement evaluation path.

Therefore this migration repair is finite historical compatibility and must not become normal runtime code.

No future run should be able to recreate the V3 token-only state.

---

# 6. Required tests

## V3 token-only repair

Fixture:

```text
version 3
progression.unlocks includes achievement:first-victory
achievements first-victory absent
scrap = S
```

V4 result:

```text
First Victory completed = true
completedAt absent
scrap = S + 25 (safe-int clamped)
legacy achievement token absent from active V4 entitlement bag
```

## V3 already completed

Fixture has token + completed Achievement.

Result:

```text
completion preserved
no +25 replay
shadow token removed from active entitlement bag
```

## V2 legacy token

Direct V2 fixture with First Victory token is first normalized through frozen V2→V3 meaning, producing completion evidence.

Result:

```text
completion preserved
no +25 migration repair solely because old V2 token existed
```

## No evidence

No token + no completion -> no completion, no Scrap.

## Failure/idempotency

- running the V4 migration meaning twice cannot add 25 twice;
- safe-integer Scrap clamps;
- invalid arbitrary Achievement-like tokens do not trigger compensation;
- Reset Progress produces the normal fresh V4 state with no migrated completion/token.

---

# 7. Implementation owners

- #90 — Save V4 version normalization/migration;
- #171 — historical reward/product consistency;
- `alpha-3-test-transition-plan.md` — First Victory authority regression.

---

# 8. PASS

This amendment passes when:

1. legitimate V3 First Victory token-only state becomes one canonical Achievement completion;
2. its stranded historical 25 Scrap is paid exactly once;
3. already-completed V3 history does not replay the reward;
4. V2 legacy token history does not accidentally receive a V3-era reward;
5. no timestamp/receipt history is fabricated;
6. active V4 no longer creates or consumes the First Victory shadow token as gameplay truth.