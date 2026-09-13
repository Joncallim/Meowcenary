# Alpha 3 Test Transition Plan

**Status:** reviewed test-authority map for the V4/product implementation. Existing tests remain valuable evidence, but tests that encode temporary Alpha 3 plumbing must be replaced rather than treated as immutable product requirements.

**Baseline:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

The governing rule is:

> **Preserve tests for architectural invariants. Replace tests whose only invariant is “today’s temporary content happens to look like this.” Add RED tests for every migration/ownership/product contract before implementation.**

---

# 1. V4 condition/progression truth cleanup

## Current transitional duplication

Today:

- `ProgressionSystem` banks `achievement:first-victory` into `progression.unlocks`;
- Achievements separately owns `achievement:first-victory` completion;
- `achievement-completed` accepts either domain;
- `boss-defeated` accepts BossProgress **or** a legacy-derived progression unlock;
- Scrap Weasel’s Character definition checks `achievement:kill-milestone-100`, while that achievement also grants `unlock-character`;
- V3 has a reconciliation helper to add that redundant Character unlock token.

V4 migration provides the point at which those compatibility bridges stop being active game logic.

## Target

`ProgressionCondition` active truth:

```text
always                 -> definition itself
stage-cleared          -> save.stages
boss-defeated          -> save.bosses
achievement-completed  -> save.achievements
mastery-reached        -> save.characters
owns-content           -> progression.unlocks (only for genuinely source-owned content tokens)
scrap-total            -> progression.scrap
all / any / not        -> composition
```

Remove active V4:

```text
permanent-level
unlock-count           # first Contract becomes `always`; retain only if a real V4 use exists
```

Drop achievement/boss fallback reads from `progression.unlocks` after V1–V3 migration has normalized known legacy facts.

## Run bank

V4 `RunReward` banks Scrap only. It does not manufacture an achievement token.

First Victory completes through the already-authoritative `metric:runs-completed` achievement path. Bolt Hound becomes selectable because its `achievement-completed` condition reads the Achievement domain.

## Current achievement cleanup

`achievement:kill-milestone-100` no longer needs an `unlock-character` reward for Scrap Weasel if Scrap Weasel’s definition continues to use the achievement condition directly.

Do not maintain two routes solely to make a test green.

---

# 2. `tests/progressionIntegration.test.ts`

## Retire

The current “bank → buy Reinforced Vest → next run is stronger” test belongs to the retired permanent-stat shop.

## Replace with

### A. Run banking + first victory authority

```text
finish run
-> Scrap banks
-> runs-completed achievement fact commits
-> achievement:first-victory completed
-> Bolt Hound condition becomes true
-> progression.unlocks does NOT need achievement:first-victory
```

### B. Set fabrication integration

```text
clear Junkyard 1
-> stage fact persisted
-> Commando Set availability becomes true
-> fabricate selected piece
-> Scrap decreases + owned Equipment appears atomically
-> next run resolves its modifier
```

### C. Part fabrication/merge integration

```text
clear Part prerequisite
-> fabricate two copies
-> merge to T2
-> Scrap/serials/owned Parts survive reload
-> T2 multiplicative modifier uses delta scaling, not whole-multiplier × tier
```

### D. Boss progression integration

```text
clear Scrap Crusher
-> boss fact + stage fact persist
-> Crusher achievement completes
-> Forge 1 unlocked
-> Juggernaut/Piercing/Fire blueprint availability derives from boss fact
-> Fire Trait physical first-clear reward exists
-> no obsolete Commando Helmet reward is required
```

---

# 3. `tests/stageConformance.test.ts`

## Preserve

- stable/unique Stage IDs;
- two five-Contract chapters as the Alpha 3 release shape;
- objective variety;
- real Arena resolution;
- explicit asset-bundle resolution;
- enemy-profile references;
- one explicit defeat stage per boss;
- boss at display position 5 within each current chapter;
- ordered unlock chain;
- pure `ResolvedRunPlan` resolution;
- data-only Stage N+1 proof;
- missing bundle/manifest failures.

## Remove/replace

### Dead reward loot-table assertion

Delete:

```text
“every reward has a resolvable lootTableId”
```

because `RewardProfile.lootTableId` is removed from V4 rather than pretending it pays a post-clear reward.

### Add encounter cadence assertions

For current normal 120s content:

- Survival Contract encounter roster length ≥5 unless explicitly allow-listed with design rationale;
- non-boss encounter roster length ≥4 for the current ten-Contract pass;
- target-tag objective has at least one matching encounter archetype;
- composed target layer can produce the objective target under maxAlive/cadence bounds;
- boss encounter boss identity agrees across Stage/Profile/Objective;
- Forge stages resolve `forge-foundry` and the Forge world bundle.

These are **release-content assertions**, not universal engine limits. Synthetic Stage N+1 can still use another legal shape where its test fixture deliberately says so.

---

# 4. `tests/equipment.test.ts`

## Delete current authoring-debt assertions

Retire:

```text
set metadata lives on exactly one provider piece
effect sourceId equals owning piece ID
synthetic Set puts metadata on index === 0
all pieces of every Set are physically granted by stage reward profiles
```

Those tests currently make the implementation *less* scalable.

## Replace with

### Catalog ownership

```text
all piece setIds resolve to EquipmentSetDefinition
Set IDs unique
one complete four-slot set family per advertised Set
piece rows contain no setBonuses / upgradeUnlocks / definition tier / sourceId
```

### Global upgrade policy

```text
T2/T3/T4 gates resolve from the one Equipment upgrade-rule owner
same rule applies to synthetic Set 9 automatically
```

### Fabrication

```text
unlocked Set + funds -> one owned definition
same definition cannot be fabricated twice
locked/poor/save-failed -> no mutation
```

### Set behavior

```text
2+2 mixed Sets
4-piece threshold stacking
Pyro FIRE
Demolition EXPLOSIVE
Set+Gunsmith duplicate trait dedupe
```

### Acquisition

Every current Equipment definition is reachable through a satisfiable Set condition + positive fabrication cost. There is no requirement for 32 reward rows.

---

# 5. `tests/gunsmith.test.ts`

## Preserve

- stable Part IDs;
- valid slots/rarity/effects/traits;
- merge exact pair semantics;
- fit compatibility;
- build identity by owned instance;
- trait infusion vocabulary;
- deterministic behavior mapping;
- data-only Part N+1 proof.

## Change tier contract

Remove static `PartDefinition.tier` expectations.

Add explicit owned-tier tests:

```text
additive +35 at T2 => +70
mult 1.12 at T2 => 1.24
mult 0.94 at T2 => 0.88
```

Validation checks all supported tier extrapolations remain legal.

## Add fabrication

- positive cost + condition -> blueprint listed/fabricable;
- absent cost -> reward-only;
- serial increments only after durable success;
- merge consumption cannot roll serial backward;
- two fabricated T1 copies merge normally.

## Mastered Fire

Prove the final reward Part has a real definition-owned difference in addition to FIRE; do not create another FIRE behavior ID.

---

# 6. `tests/achievements.test.ts`

## Preserve

- stable unique IDs;
- metric/condition validation;
- cycle rejection;
- hidden handling;
- exactly-once completion/rewards;
- stale historical save entry preservation;
- platform reconciliation;
- data-only achievement fixture.

## V4 catalog assertions

- old `achievement:permanent-reinforced-coat-3` is not an active definition;
- new `achievement:boss-forge` uses `boss-defeated: boss-forge`;
- every current boss has an appropriate milestone/achievement policy if advertised;
- no current reward duplicates the same headline item already granted by the same boss first-clear;
- Scrap Weasel availability is driven by the 100-kill Achievement domain, not a required duplicate character token.

## V4 migration assertion

A V3 save that had Reinforced Vest ≥3 preserves the retired Well Protected historical completion record even though the active registry no longer lists that definition.

---

# 7. Save tests

Add a dedicated V4 matrix rather than stretching individual feature tests to prove migration.

Required:

```text
V1 -> V4
V2 -> V4
V3 -> V4
unsupported >V4 write protection
historical storage key remains readable
V3 permanent refund schedule levels 0..5 per definition
combined safe-int refund
Well Protected historical preservation
old first-victory token -> achievement domain
old boss/stage/achievement records remain canonical
Compendium boss backfill only
ordinary enemy encounter NOT fabricated
Gunsmith fabricationSerials default/sanitize/roundtrip
active V4 save contains no permanentUpgrades
```

Pin `RuntimeConfig.storageKey` compatibility with a regression test. Schema version and storage key are deliberately independent.

---

# 8. Menu/read-model tests

## Replace current flat-menu expectations

Home should expose player concepts, not every subsystem as a peer.

Assert routes for:

```text
Play Contract
Mercenary
Loadout
Career
Training when compatibility mode is enabled
Settings
```

No Home peer labelled `Arena` or generic `Progression`.

## Shared scrolling contract

Use synthetic oversized lists rather than only eight current characters.

Test:

- 20 Mercenaries;
- 50 Compendium rows;
- wheel/drag/focus moves viewport;
- controller focus auto-scrolls;
- resize clamps scroll/focus;
- hidden/off-screen targets cannot activate;
- Back works from any scroll offset;
- same logical actions on touch/keyboard/controller.

A fixed “8 characters fit” test is explicitly insufficient.

---

# 9. Visual/resource tests

Add synthetic scale rather than a huge checked-in content fixture:

```text
500 logical icon bindings
small bounded atlas/resource count
logical IDs remain unique
named frame refs resolve
Boot loads boot bundle only
opening Loadout loads Loadout resources, not Career
run closure includes selected character + encounter + recursive summons/splits + run core + world
shared resource dedupes
```

Builder test discovers synthetic N+1 through renderer family/production metadata rather than a per-ID list.

Parity test intentionally changes one byte/normalized metadata field and proves failure names the logical/resource ID.

---

# 10. Product-content tests vs playtest evidence

Some assertions are appropriate automated release checks:

- current stage roster layer count;
- objective target/archetype compatibility;
- acquisition route coverage;
- persistent reward-density cap;
- no dead RewardProfile field;
- exact active V4 art stable-ID set equality.

The following must **not** be reduced to unit tests:

```text
“stage is fun”
“boss feels climactic”
“build feels powerful”
“menu is cute”
“character is readable at phone scale”
```

Those require the manual/visual/fun evidence matrix from the engagement benchmark.

A test can prove there is a new enemy layer at 24s. It cannot prove that 24s feels good.

---

# 11. Whole-suite checkpoint

At the end of each implementation slice:

1. focused RED turned green;
2. `npm run content:validate` when affected;
3. `npm run art:validate` when affected;
4. full `npm test`;
5. `npm run lint`;
6. `npm run build`;
7. inspect the integrated diff for tests that were weakened merely to make the suite pass;
8. run the next-item synthetic fixture for the affected domain;
9. record unavailable manual/device evidence as **UNVERIFIED**, never inferred green.

The objective of the test transition is not fewer tests. It is to make the suite defend the **final ownership/product contracts** instead of temporary implementation history.
