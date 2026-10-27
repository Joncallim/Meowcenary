# Ordinary production-build smoke

Candidate: `5e887013de5ee77572176c416dd0565f1b9c552c`.

Serial checks (no concurrent `dist` writer) all exited successfully:

- `npm run lint` — 0
- `npx vitest run tests/integratedFixture.test.ts tests/uiText.test.ts` — 0
- `env -u VITE_VISUAL_TEST npm run build` — 0

The resulting ordinary build was previewed at `/` in a fresh Chromium page.
`root-b1-5e88701.png` visibly shows the **B1 PROVING GROUND** root; the smoke
JSON records one canvas and confirms that `__MEOWCENARY_INT_FB__`,
`__MEOWCENARY_VISUAL_TEST__`, `__ABILITY_PAD__`, and all
`__MEOWCENARY*` globals were absent. This is a root/load smoke only, not a
claim of an ordinary-production full playthrough. The separate walkthrough
record remains explicitly labelled ordinary-input instrumented-build evidence.
