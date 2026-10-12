# Open-issue review — 2026-10-08

Implementation baseline: `2865e28f46b046b743283b8c1bcf7fc7ef2936a3`.
All seventeen open issue bodies and their comments were reconciled with the
current sources and merged evidence. Only draft PR #208 is open; it remains
untouched. Unchecked historical boxes are not evidence that merged work is absent.

| Issue | Current remaining work / gate |
| --- | --- |
| [#191](https://github.com/Joncallim/Meowcenary/issues/191) | Mercenary fidelity first. Native source/export conformance exists, but canonical-reference versus actual-scale owner approval remains. Repair the reproduced Lynx defeat border contact separately from new visual candidates. |
| [#174](https://github.com/Joncallim/Meowcenary/issues/174) | Naked Lynx versus Tabby comparison and owner approval. Current source tests already distinguish their silhouettes; do not reimplement an old identity finding blindly or use gear/VFX to hide it. |
| [#175](https://github.com/Joncallim/Meowcenary/issues/175) | Broader animation/personality/readability after accepted base fidelity. Source dimensions and pixel overlap alone cannot close it. |
| [#167](https://github.com/Joncallim/Meowcenary/issues/167) | Whole-game art completeness and family approvals; #191/#198/#200 supply focused evidence. Human visual gate remains. |
| [#201](https://github.com/Joncallim/Meowcenary/issues/201) | Iterative defect ledger stays open. The recorded conditional delayed Achievement acknowledgement can write an old GameContext's save over a newer context; focused remediation is still required before introducing native context recreation. |
| [#194](https://github.com/Joncallim/Meowcenary/issues/194) | Authored Arena consumers exist, but opt-in immutable seeded procedural layout, dedicated RNG, connectivity validation and deterministic fallback remain implementation work. #195 camera framing repair is already integrated. |
| [#197](https://github.com/Joncallim/Meowcenary/issues/197) | Shared Equipment semantics and latest Figma layout work landed through #226. Owner visual/clarity and real-device touch/controller/mixed-input acceptance remain. |
| [#198](https://github.com/Joncallim/Meowcenary/issues/198) | Tier registry and exact Equipment/weapon presentation coverage are implemented. Type/tier readability still needs owner/device visual approval. |
| [#193](https://github.com/Joncallim/Meowcenary/issues/193) | Build/Workshop/Parts and latest layout work are integrated. Preserve authoritative atomic fitting and shared focus/scroll; remaining first-use clarity/visual/device acceptance must be supplied. |
| [#199](https://github.com/Joncallim/Meowcenary/issues/199) | Tier wearable assets exist, but the base-plus-bounded-wearables appearance resolver/composite owner and immutable launch snapshot remain implementation work. Depends on accepted base-character fidelity and #198. |
| [#196](https://github.com/Joncallim/Meowcenary/issues/196) | Existing bounded ability feedback is partial. Pre-run brief using existing intro, derived mechanical explanations, resolution facts and separate active/cooldown HUD time remain implementation work. Repair underlying mechanics through #201 first. |
| [#200](https://github.com/Joncallim/Meowcenary/issues/200) | Drop still allocates a map of four art sprites and uses generic weapon-drop art. Pure LootGrant presentation, one reusable sprite, exact weapon/tier identity and pool-reset regression remain implementation work; leave loot rules unchanged. |
| [#85](https://github.com/Joncallim/Meowcenary/issues/85) | Contract/progression foundations and correctness repairs are integrated. Final integrated extraction/reward/progression and actual play acceptance remain; focused child work supplies gaps. |
| [#88](https://github.com/Joncallim/Meowcenary/issues/88) | Roster/unlock foundations are integrated. Base identity approval and #196 comprehension plus final device/play evidence remain. |
| [#171](https://github.com/Joncallim/Meowcenary/issues/171) | Integrated fun/replayability verdict belongs after known art, Arena, ability and Equipment child gaps. Do not record a final verdict on the current incomplete set. |
| [#209](https://github.com/Joncallim/Meowcenary/issues/209) | Merged closure audit through #222/#223 reports machine completion. Real-device/subjective responsiveness acceptance remains; no further architectural extraction is justified by unchecked boxes. |
| [#98](https://github.com/Joncallim/Meowcenary/issues/98) | Deliberately future asynchronous challenge concept. Leave untouched; no accounts/network/social work in Alpha 3. |

Current code checks: `tests/characterArtDistinctness.test.ts` and
`src/entities/actorView.ts` establish native actor conformance and actual scale;
`src/entities/Drop.ts` retains the four-sprite pool presentation;
`src/systems/abilityPresentation.ts` and `GameScene.syncAbilityPresentation`
retain the partial ability feedback; there is no live
`resolveMercenaryAppearance` or `ResolvedArenaLayout` consumer.
`docs/implementation/performance/issue-209/closure-audit/acceptance-matrix.md`
records the architecture closeout boundary. #193/#197's latest issue comments
record exact-main #226 evidence and the outstanding human gates.

The owner's resumed order is Mercenary sprites first. New sprite candidates
need native editable sources, actual-scale browser comparison and explicit
owner approval before promotion; do not change goldens solely to pass CI.
After that checkpoint, prefer bounded correctness work and the remaining
focused implementations above, rather than reopening accepted architecture.
