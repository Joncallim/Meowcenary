# Compact focus foundation: direct scroll-region synchronization

This is the first pure focus slice from the #193/#197 compact-grid contract at
PR #231 head `789b2647eb9466895d90b336abaa2cec04d20e84`. It adds an exact
scene-to-scroll-region focus synchronization API and focused unit regressions.
It does not enable grid navigation in current menus. MenuScene maps semantic
scene indices once and uses the new direct setter to synchronize its region.

`ScrollableFocusRegion.setFocusedIndex(index, { reveal? })` owns local index
validation and reveal behavior. A non-safe integer throws before mutation; a
safe out-of-range index is rejected without clamping or state changes. A valid
index sets the exact local focus, returns whether it changed, and minimally
reveals the item even when focus was already there. `{ reveal: false }` keeps
the current offset. Accepted synchronization clears a pending prefix reveal.
The empty region remains at focus `-1`.

The new tests cover those edge cases and all source/target pairs for counts
0, 1, 2, 8, 9, 10, and 50 in linear mode and grid modes with two and three
columns: 8,250 pairs for reveal suppression and another 8,250 with actual row
geometry, default reveal, nonzero viewport origin and bounded scroll checks.
Each pair uses direct index assignment rather than repeated direction presses.

Validation at the isolated worktree based on main `4f79d6210c3b028b995d67a5cc6e35318b17b2ee`:

- RED before implementation: the eight new contract tests failed because
  `setFocusedIndex` did not exist; the 12 prior `ScrollableFocusRegion` tests
  passed. Log: `/home/jon/projects/meowcenary-evidence/issue-burn-2026-10-12/prcompact-focus-red.log`.
- GREEN after implementation: `vitest run tests/scrollableFocus.test.ts`, 20
  tests passed.
- Focused strict TypeScript check of `src/ui/scrollableFocus.ts` and
  `tests/scrollableFocus.test.ts` passed.

The Menu seam adds separate RED regressions for nine-item/two-column focus
1→0 and ten-item/two-column focus 0→9. A bounded traversal guard reproduces the
old loop's inability to reach the mapped column without hanging the test
runner. Direct assignment passes both cases and the unchanged-first-action
reveal/fixed-shell/disposal checks. The final four focused files pass 199
tests, including the additional all-pairs reveal coverage.

Independent read-only review passes the pure setter contract and final Menu
seam. Complete candidate gates remain a separate requirement. No layout,
keyed-neighbor plan, input gesture, persistence, acquisition or controller
selection behavior is changed. Full repository and browser acceptance remain
unverified. This is a foundation for #193/#197, not compact-grid product closure.
