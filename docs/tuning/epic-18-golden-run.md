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
   - Slice 4 identity fields: `seed`, `characterId`, `arenaId` (the actual
     generated-run identity required for evidence citation);
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
3. Record each generated run's terminal identity in a table appended below,
   with its `seed` and character/arena. Slice 4 records generated-seed
   identity only: it does not provide `?seed=`, show a seed elsewhere, select
   a seed, or replay a seed.
4. Compare against §6's targets. Only propose a tuning change when several
   seeds agree the target is being missed, and record:
   - the metric and seeds that motivated it;
   - the specific value changed and its owning file;
   - the before/after evidence from newly generated runs; do not claim paired
     same-seed replay without separately implemented support.
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

## Slice 5 closeout — what was and was not verified

Verified in this headless environment (no browser/Phaser runtime
available):

- Full automated suite green, plus two independently shuffled full-suite
  reruns green; `tsc --noEmit` (lint), `vite build`, `npm run
  art:validate`, and `git diff --check` all clean.
- Two orthogonal review passes across upgrade ownership, modifier scope,
  determinism, UI lifecycle, validation, weapon-reward placement, and
  pacing. Every defect below was fixed, each with a regression test
  verified to fail without its fix:

  | # | Defect | Impact |
  | --- | --- | --- |
  | 1 | Canonical `presentation`/`effects[].scope` not deep-copied at `UpgradeSystem` construction | A caller mutating its own definitions could retarget an active offer's family scope or icon |
  | 2 | `ModifierStack.resolve()` applied family-scoped modifiers globally | Latent: contradicts D4; `resolve('damage', …)` would have leaked pistol-scoped damage to every family |
  | 3 | Read-model build sat outside the offer unwind guard | A throw there leaked the level-up pause, deadlocking the run with no offer to resolve |
  | 4 | `focusPrevious`/`focusNext` guarded only on `destroyed` | The Epic 19 seam could move focus during an in-flight submission, where the keyboard path is inert |
  | 5 | Stack-state row had no containment clamp or visibility guard | In the 4/5-card modes this epic enables, it rendered outside its card at small viewports |
  | 6 | Weapon-reward candidate ring fixed at `spawnOffset` | Scrap Tabby's +15 passive plus 4× `scrap-magnet` (~110px) exceeded both rings, so rewards auto-collected instead of staying physical pickups |
  | 7 | Recorded playtest detail never emitted | Level cadence, per-offer IDs, and acquisition timestamps were collected then dropped, leaving D11's evidence unusable |
  | 8 | 10 of 18 card icons pixel-identical to another card | 4 accent colors for an 8-card category; defeats §10's "recognizable placeholder icon" |
  | 9 | Card icons sized from the old number-badge box | Rendered ~21px against a 36px binding and D8's 36–40px logical spec |

  Defects 5, 6, 8 and 9 were introduced by this epic; 2 and 3 were latent
  contract violations it made reachable. Note that 8 was invisible to every
  existing gate — `validate-visual-art.mjs` checks dimensions and metadata
  but never pixel content — so a test now asserts pairwise-distinct icons.
- A seeded offer simulation over the real 18-card catalog (5 seeds ×
  12 picks, pistol-only and full-rack) holds offers at 4 cards, yields
  7–9 distinct chosen IDs against §6's ">=5" target, shows 0.16–0.41
  consecutive-offer overlap, never offers a family card without that
  family equipped, and degrades 4→3→2→1 only on true pool exhaustion
  (43 picks pistol-only, far beyond a 300s run's 8–12).
- The extreme max-card-stack build cannot produce non-finite weapon stats:
  `checkRunUpgradeEffects` enforces `mult > 0` and a finite aggregate
  across `maxStacks` for every card at data-load time, so stacked
  multiplication/addition chains stay finite by construction.
- `WeaponRewardSystem`'s live-pickup-radius placement is bounded (a fixed
  set of deterministic candidate positions plus a guaranteed fallback) and
  cannot infinite-loop even under a maxed `scrap-magnet` pickup radius.

**Not verified — genuinely unverified, not merely untested**, because they
require playing the game in a browser, which this implementation session
cannot do:

- §10's player-experience matrix (readability at 390×844/desktop, "two
  runs producing visibly different builds," "the final minute feels denser
  and the build feels stronger," etc.) — these are player-facing claims
  about lived experience, not code properties, and nothing here should be
  read as confirming them.
- The reduced-motion regression and portrait/desktop chooser/rack/combat
  smoke passes — the existing automated reduced-motion test coverage is
  unchanged by this epic (no new tweens/animations were added), but a
  human visual pass was not performed.
- Any real-seed Golden Run timing evidence (first level-up, first merge,
  Rusher/Brute pressure windows, etc.) — see "Status: no tuning changes
  accepted this slice" above.

A future session with browser access should run the player-experience
matrix and record real seeded evidence in the log above before this epic
is considered fully closed on its player-facing claims.
