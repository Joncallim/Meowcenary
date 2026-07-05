# Epic Architecture Index

This file gives a simple overview of the Meowcenary backlog. The GitHub issues are the source of truth for each epic's implementation plan.

## Documentation Standard

Every epic should use the same structure:

1. **Plain-English Goal** — what the epic is for.
2. **Owns** — what this epic is responsible for.
3. **Does Not Own** — what belongs somewhere else.
4. **Architecture Rules** — boundaries that keep the code simple.
5. **Implementation Plan** — the order Codex/GPT-5.5 should build in.
6. **Tests and Checks** — how to verify the work.
7. **Done When** — the definition of done.
8. **Codex Handoff** — short instructions for the implementation agent.

Keep documentation practical. Avoid long theory, duplicated design notes, or vague wording.

## Epic Order

| Epic | Issue | Purpose |
| --- | --- | --- |
| Epic 0 | #1 Project Foundation | Prepare config, data validation, save/settings, input, debug, audio shell, tests, and CI. |
| Epic 1 | #2 Core Gameplay Loop | Build the first playable loop: move, auto-shoot, survive, level up, win or lose. |
| Epic 2 | #3 Weapons and Merge System | Build automatic weapons, projectile behaviour, inventory state, and pure merge rules. |
| Epic 3 | #4 Upgrade Cards | Add readable run-only level-up choices and modifier hooks. |
| Epic 4 | #5 Enemy AI and Spawn Director | Add simple enemy behaviours and data-driven wave pressure. |
| Epic 5 | #6 Meta Progression | Add earned permanent progress without ads, payments, timers, or energy systems. |
| Epic 6 | #7 Characters | Add selectable characters with starting stats, loadouts, passives, and unlock hooks. |
| Epic 7 | #8 Maps and Arenas | Add data-defined arenas, spawn regions, obstacles, and hazard hooks. |
| Epic 8 | #9 Loot and Economy | Add XP, currency, loot tables, rewards, and pickup behaviour. |
| Epic 9 | #10 UI and UX | Make the game readable and controllable on phone-sized screens and desktop browsers. |
| Epic 10 | #11 Audio | Add respectful, muteable sound feedback and music support. |
| Epic 11 | #12 Balancing and Developer Tooling | Make tuning fast through data, validation, debug tools, and local playtest helpers. |
| Epic 12 | #13 Polish and Performance | Add feedback, animation polish, object pooling, reduced motion, and browser performance checks. |

## Cross-Epic Rules

- Keep code modular, easy to read, and as simple as possible.
- Keep Phaser scenes thin; scenes coordinate systems rather than owning game logic.
- Keep gameplay tuning in data wherever practical.
- Prefer pure helpers for rules that can be tested without Phaser.
- No ads, paid power, subscriptions, energy systems, or manipulative reward pacing.
- Implement each epic in small PRs rather than one large rewrite.

## Suggested Build Sequence

1. Finish Epic 0 first.
2. Build Epic 1 until the game is playable.
3. Add Epic 2 and Epic 3 for weapon/upgrades depth.
4. Add Epic 4 and Epic 8 to improve combat pressure and rewards.
5. Add Epic 5 and Epic 6 for replayability.
6. Add Epic 7, Epic 9, and Epic 10 once the core loop is stable.
7. Use Epic 11 throughout tuning.
8. Save Epic 12 for late-stage polish and performance.
