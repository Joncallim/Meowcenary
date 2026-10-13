# Roadmap

## Active Alpha 3 finish line — 13 October 2026

This is the **current product-delivery order and release discipline**. It supersedes the status and sequencing implications of the historical Alpha 2/early Alpha 3 milestone sections below. It does not replace the detailed domain/architecture contracts or change combat, progression or save authority.

**Outcome:** Finish a coherent, polished, replayable browser game. A working subsystem, a green PR, and a deployed build are not interchangeable with a finished player-facing feature. The aim is a game where players can understand and enjoy Contracts, loadouts, Abilities, audio, characters and combat together at real phone size. The browser game remains the canonical runtime; Android/iOS packaging follows game stabilisation.

**Authority and evidence:** This file owns cross-feature priority and acceptance sequencing. Linked GitHub issues own detailed product requirements, current merged source/tests own implementation truth, GitHub checks own exact-commit verification, and the deployed `hearth-infra` `GAME_REF` plus served build metadata own production truth. A human art/listening/fun/device verdict is separate from all of them. Current CI, merge and deployed SHA must be verified live; keep transient status in PRs/delivery records, not cached as roadmap truth.

### Release vocabulary — do not collapse the gates

| Term | Required proof |
| --- | --- |
| Foundation ready | Reviewed contracts, assets or tooling exist; they may be intentionally nonshipping. |
| Integrated | Code is merged to current `main` with complete exact-main validation. This is not automatically an accepted feature. |
| Deployed | The ordinary `hearth-infra` pin and externally served game SHA/assets match the intended `main` release. |
| Product accepted | The owning issue's complete functional, visual/listening, relevant physical-device and player-experience gates are evidenced; the owner approves subjective gates. |
| Closed | All criteria of the specific issue are met, linked, and explicitly reconciled. Do not auto-close neighbouring/umbrella issues. |

A release may contain incremental, verified foundations **without claiming that the associated feature is finished**. Keep unapproved art/audio sources outside public runtime bindings. Never make a product-completion claim from PR count, green CI, merged code, screenshot goldens, or file existence alone. If any gate is absent, say exactly which one remains.

### Immediate baseline and delivery queue

1. **R0 — Integrate the existing verified stack, once.** [PR #258](https://github.com/Joncallim/Meowcenary/pull/258) reconciled #227, #231, #236, #239, #240 and #242–#257. Its final candidate `abf21da9a054` passed [exact-head hosted CI](https://github.com/Joncallim/Meowcenary/actions/runs/38381641450) and merged to `main` on 13 October 2026 (`a8e702375004`); **this proves integration, not deployment or finished player features**. Do not individually replay those heads or overwrite newer shared owners. The normal `hearth-infra` `GAME_REF` release, post-merge CI and externally served SHA/assets must be verified and recorded on the PR/delivery record before claiming a deployed checkpoint. The R0 diagnostic playtest below is still a separate human gate. No unapproved audio/FX/sprite art cutover or issue auto-closure follows from this merge; keep the owning art/listening/device/product gates open.
2. **R1 — Finish Loadout, Equipment and Gunsmith together.** [#197](https://github.com/Joncallim/Meowcenary/issues/197) owns common Loadout truth, scope labels, Equipment slots, Sets and comparison; [#193](https://github.com/Joncallim/Meowcenary/issues/193) owns the weapon-first Gunsmith editor, Workshop and Parts flows. Consume the already integrated #244/#248/#250 navigation/gesture/bookmark foundations. Deliver actual compact responsive screens, not more pure-grid infrastructure. Build one shared stat/trait/target presentation resolver. Replace/fit previews must use the same authoritative pure transitions as atomic stale-safe commits; preserve failed-save state. Local inspection and merge review must retain semantic focus and scroll position. Acceptance covers touch, keyboard, controller, narrow/landscape/desktop layouts and normal/scaled inventories. **Exit:** a player can identify current gear, what each effect applies to, and the full consequences of equip/replace/fabricate/merge/infuse without navigating a prose wall. Do not declare R1 complete on isolated focus-foundation tests.
3. **R2 — Finish all eight active Abilities and control handedness.** [#241](https://github.com/Joncallim/Meowcenary/issues/241) owns this cutover. Existing pure FX plans, eight editable candidate masters, preference persistence and left/right ControlsView are foundations only. Approve production FX art, register every required frame/atlas/recipe, include selected-ability frames in launch resource closure, and bind one tokened cosmetic lifecycle to authoritative activation/result/end facts without delaying mechanics. Add the accessible Settings side toggle; capture the setting on next-run/Retry construction and preserve two-finger ownership. **Exit:** every Ability is recognisable within roughly one second in both biomes, truthful to its mechanics, reduced-motion-safe, and reliably usable on physical phone input. Candidate FX alone does not satisfy this.
4. **R3 — Finish original production audio.** [#237](https://github.com/Joncallim/Meowcenary/issues/237) owns original music and tactile SFX. Keep the reviewed AudioManager/voice/autoplay lifecycle foundations. Listen to and approve the menu/run music and SFX audition sources, finish relevant Ability/hazard/threat/progression cues, convert accepted sources into the production catalog without replacing stable IDs, and preserve editable source/export provenance. Prove bounded transfer/decoded-cache/resource closure and the existing audio-failure-is-nonfatal policy. **Exit:** cohesive loop-safe music and low-fatigue recognizable SFX in real combat, mono/phone-speaker listening approval, mute/fade/volume correctness and actual interruption/background/Retry/device recovery. The existing 21 public audio files are still the baseline until an explicitly approved production cutover.
5. **R4 — Finish Mercenary sprite composition, after visual proof.** [#232](https://github.com/Joncallim/Meowcenary/issues/232) executes [#230](https://github.com/Joncallim/Meowcenary/issues/230) and consumes [#199](https://github.com/Joncallim/Meowcenary/issues/199). Eight authored facing directions are selected (N/NE/E/SE/S/SW/W/NW), **not yet production-art accepted**. The first gate is a corrected, genuinely weapon-free/base Scrap Tabby turnaround, then a different anatomy and the four-anatomy composition proof; the rejected recoloured-cat and v1/v2/v3 Tabby studies are not reusable authority. Only after owner visual approval should the sprite/attachment/weapon/shadow renderer contract freeze and production expand to all eight canonical Mercenaries. Resolve appearance from actual equipped IDs/tiers with frame/direction-aware anchors and authored contact shadows; preserve movement/aim/physics/save semantics and resource bounds. **Exit:** distinct polished native-pixel Mercenaries at shipped size, correct facing, truthful four-slot Equipment and weapon family/tier in Menu and gameplay, no circle-shadow/primitive-production fallback, no outfit-combination explosion. Retain separate [#174](https://github.com/Joncallim/Meowcenary/issues/174), [#175](https://github.com/Joncallim/Meowcenary/issues/175), [#191](https://github.com/Joncallim/Meowcenary/issues/191) and [#167](https://github.com/Joncallim/Meowcenary/issues/167) umbrella gates until actually satisfied.
6. **R5 — Integrated game, visual-fidelity and release acceptance.** Finish canonical XP/Scrap/Chest pickup art and crowded-world recognition under [#200](https://github.com/Joncallim/Meowcenary/issues/200) (the pooled exact-weapon presentation foundation is not its art acceptance). Close the **whole-game** art/fidelity gaps in [#167](https://github.com/Joncallim/Meowcenary/issues/167)/[#191](https://github.com/Joncallim/Meowcenary/issues/191), not just R4 Mercenaries: actual production enemy/boss identity and animation, honest shadows/telegraphs/feedback, current Home/menu/chrome/HUD/action/scroll/result art, world props, distinct weapon/equipment tiers, upgrades, pickups and effect layering. Required final assets must not silently fall back to primitive geometry; inspect the shipped game at phone size against approved visual references. Independently playtest seeded Arena pacing, raised cover and hazard readability under [#194](https://github.com/Joncallim/Meowcenary/issues/194)/[#233](https://github.com/Joncallim/Meowcenary/issues/233), progression/reward cadence under [#171](https://github.com/Joncallim/Meowcenary/issues/171), and the full campaign/endgame journey. **Exit:** an independent player can start, understand, finish, improve their build and voluntarily want another Contract; product owner approves current integrated visual/listening/device gates and no release-blocking correctness or material experience regressions remain.

**Performance is a standing constraint, not a new competing redesign lane.** [#209](https://github.com/Joncallim/Meowcenary/issues/209) already has merged measured menu/resource/performance architecture; its remaining actual-device gate is not a mandate to rewrite the engine. Every R1–R5 slice compares relevant cold/warm menu, launch, light/heavy combat, loading, object/texture counts and frame-time distributions against a pinned baseline. Fix a reproduced regression at its smallest owning boundary. Do not claim FPS/memory improvements without matched evidence. Keep Phaser 3, scoped resource closure, pooling, deterministic RNG, Save V4 and browser-first platform seams. Later native packaging must not bypass native async-durability and lifecycle decisions.

### Continuous playtest discovery — do not defer player evidence until R5

[#171](https://github.com/Joncallim/Meowcenary/issues/171) owns the integrated **fun, comprehension, pacing and replayability** verdict. The [engagement benchmark](gameplay/alpha-3-engagement-benchmark.md), [run-build pacing brief](gameplay/alpha-3-run-build-pacing.md) and [player-flow contract](gameplay/alpha-3-player-flow-and-ui-spec.md) already own the detailed product targets. **Do not duplicate their gameplay rules or invent a new telemetry system.** This section specifies when to test, how feedback changes delivery, and what constitutes release evidence.

Review **engineering correctness** and **player experience** separately at every R milestone. Early tests may reveal genuine defects and product risks; with unfinished UI/art/audio they remain **diagnostic**, not a verdict on final visual quality or final Product PASS. R5 retests the complete integrated build.

| Checkpoint | What real players must try | Interpretation |
| --- | --- | --- |
| R0 diagnostic | Uncoached Home → first Contract, movement/auto-fire/loot, an actual loss/Retry and clear/Next where feasible, basic seed variation and save/reload on an exact-SHA preview/deployment. | Log obvious confusion, unfair damage, dead time and crashes; unfinished art/menus/audio are confounders. Do not reorder feature work or claim final fun acceptance from this rough build. |
| R1 Loadout/Equipment/Gunsmith | Without coaching: identify current gear/active weapon, compare and replace, fabricate, merge/infuse, interpret Set changes, use local Back, and recover from cancel/save failure. | Verify the decision is *understood*, not only that buttons and transactions work. Fix the shared presentation/command owner before adding systems. |
| R2 Abilities | Predict then observe all eight effects in real combat; activate while moving, vary left/right handedness, test reduced motion, expiry and dense-world/hazard overlap on real touch hardware. | An effect that looks attractive but misstates radius, targeting, duration or outcome is not accepted. Do not alter balance to suit art. |
| R3 Audio | Phone-speaker/mono and headphone audition during menus, boss warnings and a sustained repeated-combat session; mute, interruptions, Retry and background/return. | Original exported WAVs and green lifecycle tests do not prove cue usefulness, loop quality or non-fatiguing mix. |
| R4 Sprites | At actual gameplay scale across all eight directions: distinct Mercenaries, anatomy-specific shadows, gear/mixed Sets, weapon family/tier, motion and front/back occlusion in both biomes and crowded combat. | Native turnaround sheets alone cannot approve the composed renderer; rejected studies remain nonshipping. |
| R5 integrated release candidate | Uncoached complete loops **after R1–R4 and pickup/world art** are integrated, with fresh, returning/progressed and challenge-oriented perspectives. Target at least two independent testers who did not implement the feature, including one newcomer, plus separate owner review. | Only this current integrated build may receive the overall fun/replayability verdict. Record unavailable independent/physical-device evidence as **UNVERIFIED**, not PASS. |

### Final player and release-risk coverage

- **Onboarding and agency.** Can a new player discover Play Contract and understand move → auto-fire → evade → collect → improve without a developer explanation? Test the benchmark's first-10-second physical loop and one-handed comfort rather than assuming UI text is sufficient.
- **Combat fairness and differentiation.** Record a human playthrough for every currently active Contract, including optional endgame, with a one-sentence distinct thesis. Across the overall sample, vary seeds, Mercenary archetypes, all three weapon families and both biomes. Test readable hit/death causes, movement decisions, safe routes, cover, Forge hazards, encounter pacing, learnable boss climaxes and unexpected boring segments. The benchmark's unexplained >35-second low-information gap is a diagnostic red flag.
- **Power, balance and build choices.** Observe the actual time of collected/useful weapon rewards, upgrade choices, merges and changes in combat, not merely scheduled spawns. A successful run should normally show several noticeable power beats (benchmark target: three), and a player should describe the build around midpoint. Look for ineffective or dominant combinations, generic characters, unavoidable difficulty spikes and progression that only raises numbers.
- **Progression and replay.** Use fresh, midway, advanced and migrated-save journeys; cover first clears, repeat farming, post-Warden goals, achievements, fabrication and Set/Gunsmith purchases. Can the player explain what was earned, what opened and what to try next? Check for misleading blueprint-vs-owned states, dead-end rewards, grind walls and easiest-Contract exploitation. Observe voluntary replay and at least one genuine return session after a break, not only immediate retests using prefilled saves.
- **Between-run speed and fatigue.** Exercise win → Next/Adjust Loadout and loss → Retry over several consecutive Contracts; compare to the benchmark's approximate 5–10-second Retry/Next target excluding intentional browsing. Check repeated animation, music, menu input, overload, frustration and physical comfort over a representative 20–30-minute session.
- **Whole-game art and comprehension.** Compare final live actor/enemy/boss silhouettes, animation, authored contact shadows, threat cues, visual effects, pickups, Equipment/Part/tier distinctions, UI chrome, readable action glyphs and result screens against approved references at actual phone and desktop scale. The game must look coherent as one system; a finished Mercenary roster does not automatically close #167/#191.
- **Device/readability/accessibility.** Include real Android Chrome and iOS Safari phone input, desktop keyboard/mouse and a standard-layout controller, narrow portrait and landscape, and foldable/large viewports where supported. Verify one-handed reach, colour-independent icons/telegraphs, reduced motion, visual clutter, audio-off comprehension, switching input devices, background return, and sustained frame/thermal behaviour. Emulator-only evidence does not close a physical-device gate.
- **Release integrity.** On the exact candidate, check fresh and migrated V3/V4 saves, interrupted/failed writes and return-to-game recovery, browser refresh/revisit/cache changes, silent optional-audio failure, required-art availability, and repeat play. Verify approved art/music provenance/licences, full exact-head gates, the released `GAME_REF` and externally served SHA/assets, rollback to the last good pin, and a discoverable bug-report route. No implicit promise of offline cold boot or native OS-level durability.

**Evidence and sampling:** Use existing dev-only `PlaytestSummarySystem` plus brief human notes, not a production analytics platform. Record the actual SHA, seed/Contract, Mercenary/Loadout, fresh/migrated/progressed save, hardware/browser/input, observer/date, win/loss/time, important build/power events, unprompted confusion/delight/frustration, and concrete reproduction/media when available. Include pinned repeatable seeds and exploratory unscripted play. Distribute depth across the sample; do not require every tester to exhaust every combination or present a small convenience sample as statistical proof of retention.

**Findings and decision discipline:** A reproduced P0/P1 crash, data loss, inaccessible primary path, false gameplay consequence or serious physical-device blocker halts release. Repeatable failure of core clarity, meaningful choice, pacing, fair agency or an independent **fun now** verdict keeps #171 Product PASS open even if CI is green; re-test after the smallest demonstrated correction. Meaningful P2 experience failures require a fix or explicit owner-accepted release limitation; polish requests and unconfirmed feature ideas do not automatically change R0–R5. Route code-invariant defects to [#201](https://github.com/Joncallim/Meowcenary/issues/201), user-experience/product findings to #171 or the focused issue, and art/audio findings to their own owners. Repeat full regressions at the corrected exact SHA.

**Two separate R5 decisions:** (a) **Product accepted** requires the independent whole-game playtest verdict and current applicable owner/device/visual/listening gates; (b) **Ready for public release** additionally requires save/update/error recovery, licensing/provenance, packaging/assets, CI, deployment/rollback and tester-support checks. Incremental hosted/merged builds may be designated *testing checkpoints* but must never be reported as the polished final release. If real testers or devices are unavailable, retain UNVERIFIED status and request an explicit owner risk decision rather than silently waiving evidence.

### Codex steering and anti-derailment rules

- **Maintain the queue.** Work the next incomplete R0→R5 outcome; split it into independently reviewable PRs as needed. A small green PR is a checkpoint within its parent outcome, **not permission to switch priorities, declare the feature finished or invent a new epic**. Art/audio can develop in parallel without shared-file contention; a single coordinator owns `GameScene`, `MenuScene`, resource registration/loading, save and cross-feature integration at a time.
- **Roadmap changes need owner direction.** Codex may refine a local slice or correct factual status with evidence, but must not reorder outcomes, expand to native packaging/new systems, or waive visual/listening/fun/device acceptance without an explicit newer maintainer decision. Log a material proposed priority change rather than acting on it. Current maintainer instructions override this roadmap.
- **Defect exception is narrow.** A reproduced P0/P1 correctness, data-loss, lifecycle or security defect blocks an unsafe release and may interrupt the queue. Record failing evidence under [#201](https://github.com/Joncallim/Meowcenary/issues/201) or its true owner, make the smallest fix, rerun the full suite, then return to the interrupted outcome. P2/P3 cosmetic or hypothetical findings are triaged, not treated as automatic programme pivots. Repeated independent clean reviews are a stop condition, not an invitation to broaden architecture.
- **Every PR and handoff states:** (a) R-number and owning issue, (b) implementation `main` SHA and candidate SHA, (c) player-visible delta versus nonshipping foundation, (d) exact local/hosted tests plus unchanged skips/failures, (e) missing art/listening/device/product gates, (f) merge and deployed `GAME_REF`/served SHA if applicable, (g) next bounded work item in the **same** R-number unless that milestone is accepted. Never substitute one branch's CI for another SHA.
- **Release discipline:** For each authorized incremental merge, reconcile current `main`, preserve shared-file owners, run complete exact-head gates and independent adversarial review where risk warrants, and record production deployment separately. No unapproved candidate art/audio or unfinished half-catalog runtime cutover. No auto-closure of original/umbrella issues. Maintain a known-good deploy pin and verify served metadata/assets after each release. Stop or roll back on serious regression rather than shipping to keep a schedule.
- **Owner gates stay visible.** Automated browser/viewport captures are engineering evidence, not physical-device playtests or subjective art, listening or fun approval. Record such gates as **open** until actually reviewed; do not turn a user-visible preview into a fictitious acceptance.

### Historical milestone context

The sections below preserve earlier epic scope and architecture decisions. Their statements about what is currently pending are historical, not live status authority. The active R0–R5 programme above owns the finish-line sequence. Detailed conflicts are resolved against current owner instruction, current source, and the specific issue's most recent accepted requirements.

---

## Current Position (historical Alpha 2 / initial Alpha 3)

### Complete foundations / MVP systems

- Epics 0–18 are complete; Epic 19 Slices 1–4 are merged and Slice 5 is the active gate closeout.
- Epic 13 merged in PR #79.
- Epic 14 merged in PR #80.
- Epic 15 merged in PR #81.
- Epic 16 merged in PR #83.
- Epic 17 merged in PRs #96–#102.

### Alpha 2 — Golden Run

Alpha 2 finishes **one genuinely good Golden Run** before broad content expansion. It proves combat/build feel, visual identity, touchscreen ergonomics, controller parity, replayability, and a readable player journey.

#### Epic 16 — Visual Identity and Junkyard World (#75)

Complete — architecture/art direction merged in PR #82; runtime merged in PR #83: one
validated 46-binding visual manifest, explicit actor/weapon/pickup art references,
pooled projectile/drop/defeat presentation, authored world data, and a
camera-traversable Junkyard Lot; architecture and delivery record in
[`architecture/epic-16-visual-identity-and-junkyard-world.md`](architecture/epic-16-visual-identity-and-junkyard-world.md).

#### Epic 17 — Combat Feel and Weapon Identity (#76)

Complete — architecture merged in PR #96; runtime merged in PRs #97–#102
across five slices, plus a post-merge orthogonal closeout review. Pistol/SMG/
shotgun tiers and current enemy threats are now perceptually distinct
through code-drawn presentation (muzzle flash, recoil, impact, tier-up pulse,
enemy telegraph/weight cues) and family/tier audio identity, plus the SMG
tier-3 double-tap data change; architecture and delivery record in
[`architecture/epic-17-combat-feel-and-weapon-identity.md`](architecture/epic-17-combat-feel-and-weapon-identity.md).

Additional cross-epic constraint:

- if Epic 17 introduces gameplay-affecting behavioral weapon effects, create a **small reusable combat-effect vocabulary** and one authoritative resolution path;
- do not hard-code family/tier/content IDs in `GameScene`;
- do not create an Epic-17-only effect system that Epic 18 cards or Epic 23 Gunsmith parts later have to replace;
- generalize only effects actually needed by Alpha 2 content—do not implement speculative Gunsmith traits early.

#### Epic 18 — Build Variety and Golden Run Pacing (#77)

Complete — merged in PR #106; the delivered card expansion and Golden Run
pacing are recorded in the Epic 18 architecture record. Delivered the rotating
upgrade-card experience (larger meaningful pool, normally 4–5 visible choices,
owned/current/max-stack read models, placeholder imagery metadata) and tuned
Golden Run pacing through approved shared effect contracts; temporary cards
remain separate from persistent Gunsmith progression.

Input boundary with Epic 19:

- the upgrade engine may offer 4–5 cards;
- touch may select a visible card directly;
- keyboard/controller use generic focus/navigation + confirm;
- number keys may remain optional shortcuts, but do **not** make `1`–`5` the ownership model for card selection.

#### Epic 19 — Player UX and Alpha 2 Gate (#78)

The frozen contract is [`architecture/epic-19-player-ux-and-alpha-2-gate.md`](architecture/epic-19-player-ux-and-alpha-2-gate.md).
Slices 1–4 delivered the logical core/adapters, focus/controller journey, and
touch diagnostics/evidence scaffold. Slice 5 closes the automated gate and
evidence record in [`delivery/epic-19-player-experience-gate.md`](delivery/epic-19-player-experience-gate.md).
Current status is NOT READY while D10 remains PENDING and P-late-wave is
unverified; controller coverage remains unverified until a real standard-layout
controller session is recorded.

Delivered state:

- auto-fire stays primary across touch, keyboard, and controller; floating
  touch is production and anchored is config-only diagnostic;
- one platform-neutral logical input/action layer is frozen; the full
  launch → menu → run → upgrade → rack/merge → settings → summary →
  Retry/Menu journey works controller-only, with deadzones, focus
  navigation, disconnect/reconnect, mixed-input switching, and
  duplicate-command suppression automated and gated;
- the dash/evade decision remains evidence-gated by the maintainer's D10
  judgment; `ability` stays reserved without implementing the full character
  ability system;
- no required right-stick/manual aiming.

Epic 19 ends only when the Golden Run passes a real player-experience gate on touch and controller, not merely automated tests.

### Mandatory Alpha 2 repository certification — Issue #94

After Epic 19 is merged and its player-experience gate passes, complete **Alpha 2 Closeout: Full Repository Architecture, Quality, and Maintainability Audit (#94)** against the fully merged `main` branch.

#94 is deliberately broader than an Alpha 3 readiness check. It is a whole-codebase certification and remediation gate covering implementation **and** planning across architecture, coding practice, modularity, cohesion/coupling, reusability/extensibility, TypeScript/API quality, state ownership, persistence, determinism, input, UI/accessibility, gameplay/physics, lifecycle/leaks, performance/memory, error recovery, testing quality, CI/build/configuration, dependencies/security, browser/mobile/native-wrapper portability, asset pipelines, documentation truth, dead code/duplication, naming/IDs, developer/agent ergonomics, and cross-system interactions.

Default rule:

> **Findings with credible downstream implications are fixed here, not merely recorded or deferred.**

A finding is downstream-relevant if it creates credible future cost to correctness, maintainability, modularity, reusability, testability, performance, portability, security, agent/developer quality, debugging, content authoring, or future refactoring—even if it does not directly affect Alpha 3's first slices.

Deferral is exceptional and requires evidence that the finding is genuinely isolated/local, creates no credible downstream cost, and would be disproportionately risky/costly to fix now.

#94 requires multiple independent orthogonal passes, a finding ledger, remediation, full regression/manual/lifecycle validation, and a final independent re-review. It closes only with no unresolved P0/P1 or downstream-relevant P2 findings and an explicit **PASS** verdict that the repository is a trusted baseline for any subsequent development phase.

**Architecture #92 followed the #94 PASS** and is now implementation-locked on the certified Alpha 2 codebase.

---

## Alpha 3 — Depth & Progression

Alpha 3 expands the certified Alpha 2 combat/build baseline into a stage/progression game.

### Mandatory shared architecture gate — Issue #92

After #94 passes, complete **Architecture: Alpha 3 Shared Foundation Contracts (#92)** before any Epic 20 runtime implementation.

Authoritative shared documents:

- [`architecture/alpha-3-shared-foundation.md`](architecture/alpha-3-shared-foundation.md)
- [`architecture/alpha-3-content-extensibility-contract.md`](architecture/alpha-3-content-extensibility-contract.md)

#92 freezes shared concerns once so Epics 20–26 do not independently invent competing versions of them:

- Stage/Contract as the Alpha 3 content-composition root;
- explicit evolution from current `{ characterId, arenaId, seed }` run requests to stage-oriented resolved run plans;
- Stage/Objective state—not Arena/SpawnCurve duration—as the normal Alpha 3 victory owner;
- Save V3 domain ownership and V2 migration, including preservation of `achievement:first-victory` / Bolt Hound access;
- preservation of existing shipped bare content IDs rather than aesthetic mass-renaming;
- one shared unlock/condition vocabulary;
- one shared durable reward/grant vocabulary;
- catalog/registry/conformance registration patterns;
- modular future Alpha 3 validators while preserving the aggregate descriptor boundary;
- explicit deterministic content pools;
- save-schema version separate from content/catalog/balance version;
- future chapter asset-bundle seam built on the validated manifest approach;
- future `content:validate` command contract, implemented only when enough real Alpha 3 catalogs exist;
- architecture documents kept durable/lean, with large execution evidence kept in PR/checks or concise `docs/delivery/` records.

Default extensibility rule:

> **Adding another instance of an existing content type should require validated data + assets, not core gameplay-system source changes.**

Every Epic 20–26 retains its required **data-only second fixture** proof.

### Epic 20 — Contracts, Objectives, and Stage Progression (#85)

Replace the single endurance-format structure with a stage/contract ladder.

Core direction:

- stage selection becomes the normal Alpha 3 run entry point;
- a stage composes reusable arena + objective + encounter + difficulty + reward + unlock references;
- Arena remains the physical world definition, not the owner of stage encounter/victory/reward semantics;
- Stage/Objective owns success/failure state;
- objective families initially include kill, collect, survive, and elite/target contracts;
- frontier stages become severely hostile around the intended ~3-minute clear window;
- initial chapter cadence targets four normal stages + boss Stage 5;
- stage facts feed Epic 22 rather than maintaining duplicate achievement counters;
- another stage using existing primitives must be data/assets-only.

Epic 20 consumes the completed #92 foundation.

### Epic 21 — Enemy Roster Expansion and Boss Framework (#86)

Expand toward roughly eight behaviorally distinct archetypes:

1. Grunt / swarm.
2. Runner / flanker.
3. Brute.
4. Shooter / projectile enemy.
5. Charger.
6. Spawner.
7. Shielded enemy.
8. Splitter / disruptor.

Bosses are unique milestone encounters with small readable movesets, not inflated normal enemies. Enemy/boss definitions reference reusable registered behaviors/abilities and explicit encounter pools. New variants/boss compositions using existing primitives must be data/assets-only.

### Epic 22 — Achievements, Mastery, and Platform Sync (#91)

Create one game-owned achievement/mastery system:

- standard, incremental, hidden, and mastery achievements;
- sparse persistent local progress;
- exactly-once completion/rewards;
- in-game gallery/progress read models;
- achievement-triggered unlocks through the shared #92 grant vocabulary;
- optional Game Center / Google Play Games mirrors;
- native services never become progression authority;
- ordinary new achievements using existing metric/condition/grant primitives are data-only.

Epic 21 architecture must expose authoritative combat/boss facts for Epic 22 rather than forcing achievement-specific counters into boss code.

### Epic 23 — Persistent Gunsmith and Weapon-Part Crafting (#87)

Persistent weapon engineering outside combat:

- modular receiver/core, barrel, optic, stock, trigger, magazine, underbarrel/specialist slots;
- persistent part inventory/builds;
- bounded merge/upgrade/trait infusion;
- hybrid behavior such as an incendiary conventional barrel;
- reuse the approved combat-effect semantics established by real Epic 17/18 needs rather than creating a parallel damage/effect model;
- explicit part/reward pools;
- ordinary new parts using existing slot/effect/trait primitives are data/assets-only.

Any weapon-registry immutability/validation inconsistency that remains after Epic 19 belongs in #94 and should be fixed there rather than deliberately carried into #92/Epic 23.

### Epic 24 — Mercenary Roster Expansion (#88)

Expand beyond three characters; initial target ~8:

- distinct base/passive/start identities;
- one simple active ability using Epic 19 logical actions;
- progression/boss/achievement/mastery unlocks;
- data-defined characters referencing registered passive/ability primitives;
- ordinary new characters using existing primitives are data/assets-only.

### Epic 25 — Armour Sets and Equipment Progression (#89)

Persistent Helmet / Armour / Gloves / Boots system:

- target ~8 set families;
- 2-piece + 4-piece bonuses;
- coins improve owned equipment;
- progression/boss/achievement/mastery unlocks higher tiers;
- registered effect/set-bonus primitives;
- ordinary new items/sets are data/assets-only;
- no required drag/touch-only management flow.

### Epic 26 — Meta Progression Rebalance and Depth Integration (#90)

Integrate all persistent systems into one clear economy/progression model:

- give each resource/system one purpose;
- consume the shared #92 condition/grant contracts rather than inventing a second progression grammar;
- simplify/retire redundant legacy permanent-upgrade paths;
- prevent easiest-stage grinding from being dominant;
- ensure boss/milestone rewards are meaningfully stronger than ordinary farming;
- all between-run progression remains controller navigable.

---

## Input / Platform Boundary

```text
Touch ───────┐
Keyboard ────┼─> shared logical actions ─> gameplay/UI commands
Controller ──┘
```

Native iOS/Android wrappers may provide additional device adapters later, but do not fork gameplay rules. Controller players use the same automatic combat model; required right-stick/manual aiming remains out of scope.

## Achievement / Platform Boundary

```text
Gameplay facts
      ↓
Meowcenary Achievement/Mastery State  ← authoritative
      ↓
web/local | Game Center mirror | Google Play Games mirror
```

Platform sync failure never blocks/revokes a local achievement, stage unlock, blueprint, character, or equipment unlock.

## Progression Boundaries

Keep these roles distinct:

- **Upgrade cards:** temporary run build direction.
- **Run rack/merges:** temporary combat escalation.
- **Stages/bosses:** content milestones + authoritative accomplishment facts.
- **Achievements/mastery:** game-owned accomplishment/unlock primitive.
- **Gunsmith:** persistent weapon engineering.
- **Armour/equipment:** persistent loadout/set progression.
- **Mercenaries:** persistent playable identities/passives/abilities.
- **Coins/scrap:** improve appropriate owned content; never universal milestone bypass.

## Milestone History

- Milestone 0 — Foundation.
- Milestone 1 — Playable combat slice.
- Milestone 2 — Weapon/upgrade depth.
- Milestone 3 — Meta progression shell.
- Milestone 4 / Alpha 2 — Golden Run presentation, acquisition/merge UX, combat feel, build variety, touch/controller gate, then full repository certification #94.
- Milestone 5 / Alpha 3 — shared foundation #92, stage ladder, enemy/boss expansion, achievements/mastery, Gunsmith, larger roster, equipment, integrated progression.

## Explicitly Later

- Native iOS/Android packaging/store delivery after input + persistent-state contracts stabilize.
- Online accounts / cloud saves.
- Leaderboards.
- Co-op.
- Cosmetic store / any monetisation.
