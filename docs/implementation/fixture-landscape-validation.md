# Fixture landscape validation scope

R0/#201 baseline maintenance supports the R5/#171 desktop prototype. It does
not accept the retained legacy game on additional mobile viewports.

The six established projects still run the entire browser suite: phone 360×640,
phone 390×844, tablet 768×1024, foldable 1114×720, and desktop 1280×720 / 1920×1080.
Their existing compact-landscape-to-portrait guard test also remains intact.

Commits `94ce7876` and `130bad52` added phone 640×390 and tablet 1024×768
projects for the INT-FB/late workshop and range fixtures. Those two projects
now select their fixture files explicitly. This avoids accidentally promising
the whole legacy product at those added sizes. Production code, portrait
quarantine, test assertions, deadlines and image thresholds are unchanged.

The full additional landscape audit remains available after a guarded build:

```sh
VITE_VISUAL_TEST=1 npm run build
MEOWCENARY_LEGACY_LANDSCAPE_AUDIT=1 npx playwright test --project=phone-landscape-640x390 --project=tablet-landscape-1024x768
```

## Observed gaps remain open

[Run 40483690256](https://github.com/Joncallim/Meowcenary/actions/runs/40483690256)
at `b582ba0` completed with 137 failures. Of these, 120 positive legacy flows
ran behind the intentional compact-phone portrait guard. Eleven additional
tablet-size checks exposed unresolved legacy Equipment/Gunsmith framing,
upgrade-text clipping, actor/HUD contrast and camera-bound expectations.
These are retained diagnostic failures, not approved artwork or closed bugs;
the audit command above continues to exercise their unchanged assertions.
Any remediation needs its owning UI/art issue and actual viewport evidence.

The remaining failures included an unframed late-workshop key sequence and
the already isolated long recovery/profile test. The late test now admits each
physical key edge across real browser frames and retains its exact B2+B2 donor,
T3 output, revision and save-isolation expectations. It also verifies the first
preview and cancellation before the second selection. This changes the test
driver, not donor order, costs, outcomes or the game keyboard implementation.

The Junction route remains a weapons-only desktop blockout. Native controller,
Steam packaging, mobile-port, final-art and whole-product acceptance remain open.
