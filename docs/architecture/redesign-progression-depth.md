# Achievement depth and acquisition clarity (#235)

Status: implemented candidate; independent product and integrated acceptance remain separate gates.
Baseline: main `a100e053ce4e2bc48bc4b8844e7da5010d562096`.

## Authority and domain flow

This change consumes the V4 final execution handoff, achievement reconciliation amendment, and content-authoring templates. #171 supplies progression clarity and reward-density constraints; #88 fixes existing mercenary availability; #85 owns Contract outcome facts; #197/#193 own the existing equipment and weapon engineering interaction model. None is replaced by another unlock or currency system.

```text
Validated achievement definitions + canonical Save V4 facts
    -> pure achievement evaluation
    -> one candidate with completion and source-owned explicit rewards
    -> existing SaveManager commit
    -> publish read models / optional platform mirror
```

The ten existing achievement IDs, conditions, targets and rewards remain. Historical completed/retired entries remain terminal. New rows reuse the existing condition/grant vocabulary and approved semantic badge atlas; badges may be shared by a goal family. No save schema, stage content, currency source, RNG stream, input route, or resource-loading change is required.

The current 27-row candidate adds campaign coverage, mercenary breadth and specialization, timed Contract coverage, simultaneous weapon engineering, hybrid traits, and high-tier equipment. Five goals follow the authoritative optional post-Warden ladder: Nest Breaker (hunt 8 summoners), Crossfire Salvage (collect 32 Scrap), Shatterline (70 kills), Pressure Test (survive 120 seconds), and an explicit all-four finale. Each rung grants 50 Scrap; the finale grants 150. They use existing stage-cleared conditions and canonical saved completions. The mastery rows are deliberately optional accomplishments; no existing mercenary, equipment or part is moved behind a new gate.

## Derived facts

Four registered metric primitives read existing canonical snapshots:

- `contracts-cleared-under-180s`: distinct current-catalog completed non-survival stages with positive best time at most 180,000 ms. Training, fixed-duration survival, and stale IDs do not count.
- `engineered-families`: distinct current weapon families with at least three distinct compatible non-trait part definitions fitted to a saved build. Multiple builds of one family count once.
- `engineered-traits`: highest distinct effective trait count on a saved build, using the same `resolveBuildTraits` authority as runtime. Duplicate FIRE cores do not count twice.
- `equipment-tier-4`: distinct current equipment definitions owned at tier 4.

These are projections, not additional durable counters. Completed milestones remain earned when a loadout changes. An unfinished simultaneous-loadout goal displays its **current** derived value; historical saved peak progress cannot imply that removed parts remain fitted. Ordinary lifetime counters keep their existing monotonic semantics.

Workshop fitting, fabrication and equipment upgrade paths project completions into the same candidate as their underlying action. Failed persistence publishes neither action nor accomplishment/reward. Reload reconciliation recovers satisfied missing milestones generically; completed rewards never replay. Optional platform reporting starts only after accepted persistence and uses the existing outbox/acknowledgement path.

Condition goals show useful read-model progress without adding state: a single mastery target displays tiers reached, and an `all` condition displays requirements fulfilled. Completion rules remain the shared evaluator's responsibility.

## Acquisition presentation

An achievement's explicit grants and catalog consumers are shown separately: a condition can open a character/blueprint path without granting an owned item. Gunsmith sources identify fabrication, direct owned-part rewards, and permission-only grants, including the prerequisite even after ownership. Hidden achievement sources remain hidden until earned. Equipment blueprint inspection shows availability, ownership, fabrication cost, and deterministic first-clear owned-piece alternatives. Owned equipment describes blueprint cost as historical source information and explicitly states that another copy cannot be fabricated. Existing commands retain all affordability/availability checks.

## Product rationale and benchmark boundary

Primary sources checked 10 October 2026:

- [Poncle Operation Guns FAQ](https://poncle.games/operation-guns) explicitly distinguishes in-game unlocks from platform achievements and describes weapon evolution and unlockable content. The useful lesson is legible game-owned goals; its paid DLC model is outside Meowcenary scope.
- [Poncle Adventures FAQ](https://poncle.games/adventures-faq) separates adventure unlocks from main-game achievements. The useful lesson is that accomplishment and content availability need explicit semantics.
- [Brotato's publisher Steam page](https://store.steampowered.com/app/1942280/Brotato/) describes traits/items producing distinct builds and a six-weapon loadout. The useful lesson is experimentation across builds rather than a single cumulative kill ladder.

The 3-minute threshold, 5/10 mastery tiers, 2/3-trait goals, and reward amounts are **Meowcenary design targets**, not claims about those games or evidence that this build is fun. Automated correctness and screenshots cannot establish long-term enjoyment. Timed-goal challenge and the optional endgame Contract ladder need integrated playtesting with #234; fixed-duration survival stages are excluded from speed goals.

## Acceptance boundaries

Focused tests cover known/stale/corrupt-derived facts, second data-only metric fixture, completed-history preservation, partial condition progress, workshop save failure/retry/reload, once-only grant receipts, and platform mirror ordering. Phone/desktop visual evidence and independent review findings belong in the delivery record. Physical controller/device experience, final integrated endgame content, and sustained-play product acceptance are not implied by unit-test success.
