# Local fixed-layout matrix

Candidate: `46170269c953f0fe63080701345cabfcb674f865` (local only; no remote
push). The immutable visual-test artifact was built before the run and was not
rewritten while Playwright was active.

Command:

```sh
VITE_VISUAL_TEST=1 npm run build && \
MEOWCENARY_BROWSER_EXECUTABLE=/usr/bin/chromium \
npx playwright test browser-tests/integrated-fixture-recovery.pw.ts \
  --project=desktop-1280x720 --project=phone-390x844 --reporter=json
```

`final-matrix-local-4617026.json` is the unmodified machine-readable reporter
output and `final-matrix-local-4617026.exit` contains the terminal exit status
`0`. Totals: desktop 17 passed / 2 skipped; phone 4 passed / 15 skipped;
overall 21 passed / 17 skipped / 0 failed. Phone skips are the deliberate
desktop-only and synthetic/precondition routes; they are not touch-only claims.
