# Roadmap

## Active Alpha 3 finish line — 13 October 2026

This is the **current product-delivery order and release discipline**. It supersedes the status and sequencing implications of the historical Alpha 2/early Alpha 3 milestone sections below. It does not replace the detailed domain/architecture contracts or change combat, progression or save authority.

**Outcome:** Finish a coherent, polished, replayable browser game. A working subsystem, a green PR, and a deployed build are not interchangeable with a finished player-facing feature. The aim is a game where players can understand and enjoy Contracts, loadouts, Abilities, audio, characters and combat together at real phone size. The browser game remains the canonical runtime; Android/iOS packaging follows game stabilisation.

**Authority and evidence:** This file owns cross-feature priority and acceptance sequencing. Linked GitHub issues own detailed product requirements, current merged source/tests own implementation truth, GitHub checks own exact-commit verification, and the deployed `hearth-infra` `GAME_REF` plus served build metadata own production truth. A human art/listening/fun/device verdict is separate from all of them. The 13 October snapshot below is historical after further merges; always recheck live GitHub and deployment before claiming status.

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

1. **R0 — Integrate the existing verified stack, once.** [PR #258](https://github.com/Joncallim/Meowcenary/pull/258) is the reconciliation route for #227, #231, #236, #239, #240 and #242–#257. Do not individually replay its incorporated PR heads or overwrite newer shared owners. At this snapshot the final candidate is `abf21da9a054`, draft/open; baseline `main` and production remain `4f79d621`; final exact-head hosted validation is in progress. The latest owner instruction specifically permits merging #258 **after both final-head local and hosted gates are green**, then deploying through the normal infrastructure pin with post-merge/release proof. This is not permission to waive product/physical-device/audio/art gates or to close owning issues. If main, CI, owner instruction or release hold changes, resolve the actual current evidence before acting.
2. **R1 — Finish Loadout, Equipment and Gunsmith together.** [#197](https://github.com/Joncallim/Meowcenary/issues/197) owns common Loadout truth, scope labels, Equipment slots, Sets and comparison; [#193](https://github.com/Joncallim/Meowcenary/issues/193) owns the weapon-first Gunsmith editor, Workshop and Parts flows. Consume the already integrated #244/#248/#250 navigation/gesture/bookmark foundations. Deliver actual compact responsive screens, not more pure-grid infrastructure. Build one shared stat/trait/target presentation resolver. Replace/fit previews must use the same authoritative pure transitions as atomic stale-safe commits; preserve failed-save state. Local inspection and merge review must retain semantic focus and scroll position. Acceptance covers touch, keyboard, controller, narrow/landscape/desktop layouts and normal/scaled inventories. **Exit:** a player can identify current gear, what each effect applies to, and the full consequences of equip/replace/fabricate/merge/infuse without navigating a prose wall. Do not declare R1 complete on isolated focus-foundation tests.
3. **R2 — Finish all eight active Abilities and control handedness.** [#241](https://github.com/Joncallim/Meowcenary/issues/241) owns this cutover. Existing pure FX plans, eight editable candidate masters, preference persistence and left/right ControlsView are foundations only. Approve production FX art, register every required frame/atlas/recipe, include selected-ability frames in launch resource closure, and bind one tokened cosmetic lifecycle to authoritative activation/result/end facts without delaying mechanics. Add the accessible Settings side toggle; capture the setting on next-run/Retry construction and preserve two-finger ownership. **Exit:** every Ability is recognisable within roughly one second in both biomes, truthful to its mechanics, reduced-motion-safe, and reliably usable on physical phone input. Candidate FX alone does not satisfy this.
4. **R3 — Finish original production audio.** [#237](https://github.com/Joncallim/Meowcenary/issues/237) owns original music and tactile SFX. Keep the reviewed AudioManager/voice/autoplay lifecycle foundations. Listen to and approve the menu/run music and SFX audition sources, finish relevant Ability/hazard/threat/progression cues, convert accepted sources into the production catalog without replacing stable IDs, and preserve editable source/export provenance. Prove bounded transfer/decoded-cache/resource closure and the existing audio-failure-is-nonfatal policy. **Exit:** cohesive loop-safe music and low-fatigue recognizable SFX in real combat, mono/phone-speaker listening approval, mute/fade/volume correctness and actual interruption/background/Retry/device recovery. The existing 21 public audio files are still the baseline until an explicitly approved production cutover.
5. **R4 — Finish Mercenary sprite composition, after visual proof.** [#232](https://github.com/Joncallim/Meowcenary/issues/232) executes [#230](https://github.com/Joncallim/Meowcenary/issues/230) and consumes [#199](https://github.com/Joncallim/Meowcenary/issues/199). Eight authored facing directions are selected (N/NE/E/SE/S/SW/W/NW), **not yet production-art accepted**. The first gate is a corrected, genuinely weapon-free/base Scrap Tabby turnaround, then a different anatomy and the four-anatomy composition proof; the rejected recoloured-cat and v1/v2/v3 Tabby studies are not reusable authority. Only after owner visual approval should the sprite/attachment/weapon/shadow renderer contract freeze and production expand to all eight canonical Mercenaries. Resolve appearance from actual equipped IDs/tiers with frame/direction-aware anchors and authored contact shadows; preserve movement/aim/physics/save semantics and resource bounds. **Exit:** distinct polished native-pixel Mercenaries at shipped size, correct facing, truthful four-slot Equipment and weapon family/tier in Menu and gameplay, no circle-shadow/primitive-production fallback, no outfit-combination explosion. Retain separate [#174](https://github.com/Joncallim/Meowcenary/issues/174), [#175](https://github.com/Joncallim/Meowcenary/issues/175), [#191](https://github.com/Joncallim/Meowcenary/issues/191) and [#167](https://github.com/Joncallim/Meowcenary/issues/167) umbrella gates until actually satisfied.
6. **R5 — Integrated game/art/fun release acceptance.** Finish canonical XP/Scrap/Chest pickup art and crowded-world recognition under [#200](https://github.com/Joncallim/Meowcenary/issues/200) (the pooled exact-weapon presentation foundation is not its art acceptance). Independently playtest seeded Arena pacing, raised cover and hazard readability under [#194](https://github.com/Joncallim/Meowcenary/issues/194)/[#233](https://github.com/Joncallim/Meowcenary/issues/233), progression/reward cadence under [#171](https://github.com/Joncallim/Meowcenary/issues/171), and the overall journey. Check current content, actual presentation and release build together. **Exit:** an independent player can start, understand, finish, improve their build and want another Contract; product owner approves remaining art/listening/device gates; no unresolved release-blocking correctness regressions.

**Performance is a standing constraint, not a new competing redesign lane.** [#209](https://github.com/Joncallim/Meowcenary/issues/209) already has merged measured menu/resource/performance architecture; its remaining actual-device gate is not a mandate to rewrite the engine. Every R1–R5 slice compares relevant cold/warm menu, launch, light/heavy combat, loading, object/texture counts and frame-time distributions against a pinned baseline. Fix a reproduced regression at its smallest owning boundary. Do not claim FPS/memory improvements without matched evidence. Keep Phaser 3, scoped resource closure, pooling, deterministic RNG, Save V4 and browser-first platform seams. Later native packaging must not bypass native async-durability and lifecycle decisions.

### Continuous playtest discovery — do not defer player evidence until R5

**Primary product authority:** [#171](https://github.com/Joncallim/Meowcenary/issues/171) and [Alpha 3 engagement benchmark](gameplay/alpha-3-engagement-benchmark.md); the [run-build pacing brief](gameplay/alpha-3-run-build-pacing.md) and [player-flow specification](gameplay/alpha-3-player-flow-and-ui-spec.md) supply detailed scenarios. This is an execution and release-evidence policy, **not a second set of gameplay rules, a new telemetry platform, or permission to expand content**. The benchmark's numeric targets are diagnostic design targets to test with people, not brittle wall-clock CI assertions.

Every milestone has two distinct reviews. **Engineering acceptance** checks that the scoped implementation is correct and has not regressed. **Player discovery** checks whether actual people can understand and enjoy the integrated change. Early discovery is provisional when known art/UI/audio gaps confound judgments; it can expose reproducible defects and prioritised product risks but **cannot grant final integrated Product PASS**. Only R5 can grant that verdict after its dependencies are production-accepted.

| Checkpoint | Player evidence required before declaring that outcome product-accepted | Guard against premature changes |
| --- | --- | --- |
| After R0 integration | Run an uncoached first-contract diagnostic session on the exact tested/deployed or labelled preview SHA; exercise one early run, loss/Retry, a clear/Next, basic movement/auto-fire, a seeded Arena, and a basic fresh-save/reload. Record usability blockers, conspicuous pacing dead zones and device crashes; label unfinished presentation as a confounder. | Do not tune all 14 Contracts or redesign visuals from this rough baseline alone; route observations to the owning issue for retest on the later complete build. |
| R1 Equipment/Gunsmith | Give a tester tasks without instructions: identify equipped slots and active weapon family, compare a replacement, fit/replace, fabricate, merge/infuse, recover from Back, explain Set changes and navigate after a failed save. Observe actions, errors, misunderstandings and context loss. | Do not add another inventory, progression or currency system because one task is confusing; correct the smallest read-model, command or UI presentation owner. |
| R2 Abilities | In actual combat, test each of eight abilities for predicted effect versus observed result; movement+Ability with two fingers, left/right choice, cooldown understanding, effect expiry, reduced motion, and clutter/hazard overlap. | Do not change gameplay radius/duration/damage to make art easier to recognise without separately accepted balance evidence. |
| R3 Audio | Listen on phone speaker/mono and headphones through menu, normal run and a prolonged repeated-combat session. Test cue distinction, warning audibility, repetition fatigue, silent/muted play, tab/background return and scene transitions. | Do not interpret a working WAV export or a synthetic voice budget as approval of the actual soundtrack. |
| R4 Sprites | Observe all eight character identities in motion at shipped scale, across facing directions, mixed gear, weapon families/tiers, authored shadows, dense enemy crowds and both biomes. Ask players to recognise identity/threat/gear without labels. | A polished turnaround sheet is not enough; rejected concept studies never become production authority by surviving code tests. |
| R5 integrated release candidate | Run uncoached, full-loop sessions **after R1–R4 plus pickup/world art** are integrated. Include a fresh player, a returning/progressed player and a challenge-focused player where practical, with at least two independent people who did not implement the game; owner review remains separate. Exercise fresh and migrated saves, early/mid/late/optional Contracts, different Mercenaries/builds, both biomes, win/loss/retry/reward and sustained play. | No final fun, readability, fairness or device verdict is inferred from unit tests, emulated viewports, one hand-picked seed, or early incomplete previews. Missing independent/device evidence is `UNVERIFIED`, not PASS. |

### R5 gameplay and release-risk matrix

Use **observed actions and unscripted player comments**, including confusion/frustration, not just a yes/no survey. Each row needs a short pass/fail/unverified disposition and a link to the current owning issue or concrete playtest evidence.

| Player/release risk | What the final playtest must establish |
| --- | --- |
| First-run comprehension / agency | A newcomer can find Play Contract, understand objective and reward, and learn movement → auto-fire → avoid → collect → improve without developer coaching, ideally within the benchmark's initial ~10-second physical-loop window. No forced tutorial carousel is prescribed. |
| Combat feel and fairness | Getting hit has an intelligible source; enemies and bosses telegraph meaningfully, movement/cover/Forge hazards affect decisions, and deaths feel avoidable/learnable rather than arbitrary. Verify safe route/seed variation, not just deterministic geometry. |
| Contract differentiation and pacing | Every current campaign and optional Contract has a recorded thesis and representative human run. Sample multiple seeds, at least the three weapon families and contrasting Mercenary archetypes across the overall test set. Check pressure changes, the benchmark's unexplained >35-second low-information stretches, and boss climaxes. |
| Power curve and meaningful choices | The player can describe their build around midpoint and identify multiple (benchmark target: at least three) actual power moments in a successful normal run. Track **collected/used** weapons, offers, merges and real outcomes rather than scheduled spawn timestamps. Investigate dead, dominated or misleading choices. |
| Progression, economy and replay motivation | After win/loss, the player understands what they earned, what unlocked and what to pursue; first clear, repeats, optional endgame and achievement/Set/Gunsmith paths feel worthwhile. Check for an easiest-Contract farm, unsatisfying grind, broken acquisition, dead-end goals and misleading blueprint-vs-owned copy. |
| Between-run flow and long-session fatigue | Observe multiple consecutive Contracts, including losing then Retry and clearing then Next or Adjust Loadout. Benchmark Retry/Next at roughly 5–10 seconds without intentional browsing; check repeated menus, audio, animation, input strain and whether players *voluntarily* choose another run. No retention manipulation. |
| Device, accessibility and comfort | Use real supported Android Chrome and iOS Safari touch plus a standard-layout controller; include portrait, landscape and foldable/large layouts when relevant. Check one-handed reach, handed Ability side, readability/contrast without colour alone, reduced motion, controller-only journey, accidental taps, pause/background/return, audio unlock, and sustained performance/thermal discomfort. Emulated browser passes do not replace physical sessions. |
| Release integrity and recovery | On the exact release candidate, validate fresh and V3→V4/mature V4 saves, interrupted/failed persistence and reload, failed optional audio, refresh/revisit/cache changes, missing required assets and user-visible recovery; exercise representative 20–30-minute sessions. Verify provenance/licence for all shipped art/audio, full exact-head CI, the deployed `GAME_REF` and served SHA/assets, rollback pin, and a clear tester bug-report route. Do not promise offline startup or native durability before those features exist. |

**Evidence discipline.** Use the existing dev-only `PlaytestSummarySystem` and small, privacy-respecting manual notes; do not add a network analytics backend or collect unnecessary personal data. Minimum record: candidate/deployed SHA, seed, Contract, Mercenary/Loadout, save origin, hardware/OS/browser/input, observer and date, outcome/duration, first usable/first power and major choice times where relevant, screenshots/video or reproducible steps when available, unprompted player interpretation, severity/confounders, issue owner, fix/retest disposition. Test both pinned reproducible seeds and unscripted exploration. For each current Contract, retain at least one human run record; distribute extra seeds/builds across risk areas rather than requiring every tester to exhaust every combination.

**Triage and stop rules.** Reproduced P0/P1 integrity, crashes, inaccessible primary journey, false gameplay consequence, unfair unavoidable death, or a serious actual-device blocker stops that release. Repeatable failure of core understanding, meaningful decisions, pacing or independent enjoyment keeps #171 Product PASS **open**, even if software correctness is green; fix the demonstrated highest-impact cause, not a speculative new feature. Meaningful P2 affecting the experience needs remediation or an explicit owner-accepted release limitation; non-blocking polish and unsolicited feature ideas stay in the existing backlog. Implementation-invariant bugs route to [#201](https://github.com/Joncallim/Meowcenary/issues/201), UX/content/fun findings to #171 or the specific owning issue, and art/audio to their current owners. **Re-test after each material fix on a new exact SHA**, rerun the full regressions, and return to the active R-number. Stop adding architecture once repeated adversarial passes and independent sessions no longer reveal material defects.

**Final release decision.** Treat R5 as (a) **integrated product acceptance** — actual-current-build independent replayability verdict and completed applicable issue/device/art/listening gates — followed by (b) **release readiness** — save/update/error/asset/licence/CI/deployment/rollback and support-route verification. A locally green build or authorized incremental deployment may be labelled a testing checkpoint, **not a final polished release**. If a required device/tester cannot be obtained, report that evidence as unverified and obtain an explicit owner release-risk decision; never silently substitute emulation or older SHA evidence.

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
