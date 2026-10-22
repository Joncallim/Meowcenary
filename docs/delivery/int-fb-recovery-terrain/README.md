# INT-FB recovery and terrain evidence

This compact browser evidence accompanies the recovery-correctness and
layered-traversal candidate. It is not a merge, deployment, physical-device,
or product-acceptance record.

- `hound-takeover-reload.png` — F01 resumes with Hound in control after a
  partial-combat reload; Tabby remains down rather than being rebuilt.
- `terrain-layered-bridge-underpass.png` — the active F01 attempt is on the
  elevated bridge above the ground underpass. The browser test checks the ramp
  transition, solid crate stop, ground-spur interaction rejection, and that
  ground enemies cannot produce a cross-layer combat event.
- `phone-touch-f01-extraction.png` — a 390×844 Chromium CDP touch-hold route
  reaches the disputed lot and extraction after recovery/retry. It uses actual
  touch contacts in the browser, but does not substitute for physical-phone
  acceptance.

Reproduce after a visual build with:

```bash
MEOWCENARY_BROWSER_EXECUTABLE=/usr/bin/chromium \
  npx playwright test browser-tests/integrated-fixture-recovery.pw.ts \
  --project=desktop-1280x720 --project=phone-390x844
```

The recorded focused run executed 6 selected project cases and skipped 4
desktop-only cases on the phone project. The pinned
software-rendered Chromium facts remain in the ordinary Playwright output;
these three PNGs are the retained review subset.

## Late fitted-HM range fixture

`?fixture=int-late-range` is a read-only, browser-only range/combat fixture.
It admits only a persisted late profile with a TAB-A fitted B-HM T3 and places
targets at the resolved full range, maximum range, and just beyond maximum.
The input-driven range check therefore exercises the persisted HM value
(Balanced T3: 12.402 m / 24.804 m) without changing either the late profile or
the earlier B1 envelope. `?fixture=int-late-same-b2` is an explicitly separate
late fixture seed for the approved same-blueprint donor branch; it never adds a
part to the canonical late seed.

This is Chromium touch/pointer evidence only. It has not been run on a
physical phone, is not a hosted-site acceptance record, and is not evidence of
an unassisted campaign playthrough.
