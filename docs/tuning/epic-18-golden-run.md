# Epic 18 — Golden Run tuning record

Tracks tuning changes made against the targets in
[`docs/architecture/epic-18-build-variety-and-golden-run-pacing.md`](../architecture/epic-18-build-variety-and-golden-run-pacing.md)
§6, per §D11: every accepted balance change must cite measured local
evidence (seed, outcome, relevant metrics) — no change is made on
intuition alone.

## Status: no tuning changes accepted this slice

This slice adds the measurement instrumentation §D11 requires
(`PlaytestSummarySystem` evidence fields, `WeaponRewardSystem.issuedCount`)
but does **not** change any spawn-curve, XP, loot, or weapon-reward value.

That is a deliberate, evidence-driven decision, not an oversight: this
implementation pass runs in a headless environment with no Phaser/WebGL
runtime and no way to play a real, timed 5-minute run. §D11 requires
*measured local evidence* — "record enough repeated seeded runs to justify
changes" — and collecting that evidence means actually playing Golden Runs
in a browser with the dev build and reading the `[playtest] run summary`
console table this slice now populates. Inventing plausible-looking numbers
without that evidence would violate the same principle the section exists
to protect, so the frozen Epic 14 timing values ship unchanged:

| Value | Current | Source |
| --- | --- | --- |
| First weapon-reward window | 20 000–40 000 ms | `RuntimeConfig.gameplay.weaponRewards` |
| Repeat weapon-reward window | 30 000–45 000 ms | `RuntimeConfig.gameplay.weaponRewards` |
| Default upgrade offer count | 4 | `RuntimeConfig.gameplay.upgrades.offerCount` |
| Spawn curves / XP curve / loot tables | unchanged from Epic 13/14/17 | `src/data/*.json` |

Per the Slice 4 gate, the first guaranteed duplicate stays at 20–40s
"unless evidence shows a product-level reason to change the frozen Epic 14
teaching beat" — no such evidence exists yet.

## How to gather evidence (for the next session that plays real runs)

1. Run the dev build (`npm run dev`) and play a run to a terminal state
   (win or loss).
2. `PlaytestSummarySystem` prints `[playtest] run summary` to the browser
   console exactly once, with one row containing:
   - existing fields: `outcome`, `time`, `timeMs`, `level`, `kills`,
     `currency`, `avgDps`, `upgradesTaken`;
   - Epic 18 fields: `offersSeen`, `offerOverlapRate` (mean fraction of a
     later offer's cards that repeated the immediately prior offer),
     `firstMergeTimeMs`, `totalMerges`, `weaponsAcquired`, `pickupBlocked`,
     `weaponRewardsIssued` (scheduled rewards successfully placed — distinct
     from `weaponsAcquired`, which includes ordinary loot pickups and
     player-collection follow-through), `finalRackSize`,
     `finalRackFamilies`.
   - a second table of final `upgradeStacks` when any were taken.
3. Repeat across multiple seeds (`?seed=` or the run-start seed shown in
   dev tooling) and record each row here, in a table appended below, with
   the seed and character/arena.
4. Compare against §6's targets. Only propose a tuning change when several
   seeds agree the target is being missed, and record:
   - the metric and seeds that motivated it;
   - the specific value changed and its owning file;
   - the before/after evidence from re-running the same seeds.
5. Make one change at a time — re-measure before stacking a second change,
   so each change's effect is attributable.

### Evidence log

_(empty — no playtest sessions recorded yet)_

| Date | Seed | Character/Arena | Outcome | Key metrics | Change made | Result |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | none | — |

## Maximum shipped attack-rate / projectile fan-out (§8 Slice 4 requirement)

Computed analytically from the shipped catalog via the real engine
resolution path (`resolveWeaponStats` / `ModifierStack.resolveWeapon`),
maxing every stat-increasing card (global + that weapon family's) that
raises attack rate or projectile count — `hot-barrel`×4, `run-and-gun`×3,
`split-shot`×2, `punch-through`×2, plus family cards (`smg-overclock`×2 +
`smg-spray`×2 for SMG; `shotgun-buckshot`×2 for shotgun; pistol has no
rate/count-affecting family card). This is a theoretical ceiling for the
Slice 5 "deliberately extreme valid rack + maximum applicable card-stack"
stress case, not a claim that a real run reaches it inside 300s.

| Family (max-tier weapon) | Interval | Attacks/sec | Projectiles/shot | Pierce | Spread° | Projectiles/sec |
| --- | --- | --- | --- | --- | --- | --- |
| pistol (`scrap-pistol-t3`) | 277.5 ms | 3.60 | 3 | 3 | 8.0 | 10.81 |
| smg (`can-smg-t3`) | 46.9 ms | 21.30 | 6 | 2 | 24.0 | 127.82 |
| shotgun (`bolt-shotgun-t3`) | 480.2 ms | 2.08 | 10 | 3 | 58.0 | 20.82 |

**Sustained total with one maxed weapon per family simultaneously
equipped: ≈159.5 projectiles/sec.**

The SMG line is the clear outlier — `can-smg-t3`'s already-fast 105ms base
interval compounds with `hot-barrel`, `run-and-gun`, and `smg-overclock`
to a ~47ms interval (~21 attacks/sec). Slice 5's late-wave performance
pass should specifically stress a maxed SMG rack alongside the full
three-family sustained case above, and confirm the projectile pool /
collision pass stay within budget at that spawn rate before treating this
ceiling as acceptable.
