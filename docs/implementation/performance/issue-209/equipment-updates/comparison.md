# Repeated comparison

Immediate baseline runtime: `251d77d9a87d2062e6cd9e7b13c66fad95a94363`.
Measured candidate runtime: `e0c0a3f805fdac2e8eaacd01e1c0618e7ba80aa1`.

All times are milliseconds. Cells show median [minimum–maximum] of three repeats.
These are descriptive results, not performance acceptance thresholds.

## Action latency to the actually presented frame

| Profile | Action | Baseline | Candidate |
|---|---|---:|---:|
| desktop-1280x720 | cold-usable-home | 1013.0 [948.9–1050.7] | 1039.0 [969.5–1070.5] |
| desktop-1280x720 | equipment-entry | 46.2 [45.2–48.5] | 42.7 [41.9–59.1] |
| desktop-1280x720 | equipment-select | 226.8 [226.0–229.7] | 182.7 [178.5–194.9] |
| desktop-1280x720 | equipment-equip | 206.5 [196.8–231.1] | 217.9 [216.2–220.3] |
| desktop-1280x720 | equipment-blueprint-select | 203.5 [188.4–212.8] | 206.9 [196.9–210.2] |
| desktop-1280x720 | equipment-fabricate | 217.4 [203.3–235.8] | 213.0 [211.3–215.3] |
| desktop-1280x720 | gunsmith-entry | 93.9 [88.5–98.5] | 73.5 [69.5–78.3] |
| desktop-1280x720 | gunsmith-build-select | 217.2 [205.1–218.3] | 202.4 [197.6–239.5] |
| desktop-1280x720 | gunsmith-part-replace | 215.4 [208.5–218.8] | 202.6 [196.7–216.8] |
| desktop-1280x720 | menu-prepared-game | 809.5 [800.3–816.1] | 862.8 [816.8–881.9] |
| desktop-1280x720 | warm-equipment-entry | 61.0 [57.3–63.2] | 55.5 [52.6–57.3] |
| desktop-1280x720 | warm-gunsmith-entry | 82.0 [77.6–82.6] | 68.7 [68.1–71.0] |
| phone-390x844-dpr3 | cold-usable-home | 1658.2 [1616.0–1672.9] | 1615.7 [1594.8–1647.7] |
| phone-390x844-dpr3 | equipment-entry | 136.4 [128.9–150.5] | 127.4 [122.2–127.4] |
| phone-390x844-dpr3 | equipment-select | 324.3 [318.3–335.0] | 178.6 [174.1–183.1] |
| phone-390x844-dpr3 | equipment-equip | 241.1 [240.0–253.9] | 270.3 [264.4–315.5] |
| phone-390x844-dpr3 | equipment-blueprint-select | 210.2 [209.2–211.7] | 210.1 [205.0–233.7] |
| phone-390x844-dpr3 | equipment-fabricate | 270.4 [268.6–300.2] | 312.4 [290.6–324.2] |
| phone-390x844-dpr3 | gunsmith-entry | 246.5 [244.4–258.6] | 245.1 [223.6–262.6] |
| phone-390x844-dpr3 | gunsmith-build-select | 301.2 [296.2–306.4] | 325.5 [277.9–330.2] |
| phone-390x844-dpr3 | gunsmith-part-replace | 331.4 [295.7–336.6] | 322.0 [288.6–346.4] |
| phone-390x844-dpr3 | menu-prepared-game | 957.2 [948.6–974.6] | 956.5 [952.5–964.9] |
| phone-390x844-dpr3 | warm-equipment-entry | 183.1 [177.0–183.2] | 207.2 [188.8–218.0] |
| phone-390x844-dpr3 | warm-gunsmith-entry | 219.8 [216.3–228.7] | 208.7 [207.5–209.9] |
| foldable-1114x720-dpr2 | cold-usable-home | 1968.0 [1966.6–2002.6] | 2039.3 [2002.8–2393.3] |
| foldable-1114x720-dpr2 | equipment-entry | 206.2 [194.0–212.4] | 198.7 [196.7–206.0] |
| foldable-1114x720-dpr2 | equipment-select | 455.8 [439.6–460.3] | 282.9 [253.3–298.3] |
| foldable-1114x720-dpr2 | equipment-equip | 416.5 [406.0–484.9] | 388.2 [380.3–424.5] |
| foldable-1114x720-dpr2 | equipment-blueprint-select | 367.3 [363.3–429.5] | 332.6 [320.8–417.2] |
| foldable-1114x720-dpr2 | equipment-fabricate | 436.4 [418.0–466.2] | 417.9 [411.5–442.1] |
| foldable-1114x720-dpr2 | gunsmith-entry | 397.4 [365.7–414.7] | 335.2 [319.1–357.0] |
| foldable-1114x720-dpr2 | gunsmith-build-select | 499.5 [497.5–524.8] | 468.8 [450.5–470.8] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | 495.6 [490.5–535.0] | 446.7 [438.1–449.9] |
| foldable-1114x720-dpr2 | menu-prepared-game | 1293.8 [1247.8–1305.1] | 1475.4 [1372.4–1501.1] |
| foldable-1114x720-dpr2 | warm-equipment-entry | 268.0 [246.7–291.5] | 258.6 [253.0–283.0] |
| foldable-1114x720-dpr2 | warm-gunsmith-entry | 373.2 [347.2–382.0] | 300.9 [295.3–310.8] |

## Equipment selection ownership

| Profile | Runtime | Presentation owner | Created | Destroyed | Stable objects | Textures | Owner span |
|---|---|---|---|---|---|---|---:|
| desktop-1280x720 | baseline | menu.render | 118/118/118 | 96/96/96 | 118/118/118 | 57/57/57 | 73.9 [69.2–78.7] |
| desktop-1280x720 | candidate | menu.update | 41/41/41 | 19/19/19 | 118/118/118 | 57/57/57 | 26.8 [25.2–32.2] |
| phone-390x844-dpr3 | baseline | menu.render | 118/118/118 | 96/96/96 | 118/118/118 | 57/57/57 | 245.7 [243.9–258.5] |
| phone-390x844-dpr3 | candidate | menu.update | 41/41/41 | 19/19/19 | 118/118/118 | 57/57/57 | 87.0 [83.3–89.3] |
| foldable-1114x720-dpr2 | baseline | menu.render | 118/118/118 | 96/96/96 | 118/118/118 | 57/57/57 | 293.7 [277.3–300.7] |
| foldable-1114x720-dpr2 | candidate | menu.update | 41/41/41 | 19/19/19 | 118/118/118 | 57/57/57 | 100.5 [98.4–106.2] |

## Cadence

p50/p95/p99 below are medians of each repeat’s nearest-rank percentile; they are not pooled percentiles.
Count, worst-frame and over-budget ratio retain all three repeats. The budget is 16.67ms.

| Profile | Window | Runtime | Samples | p50 | p95 | p99 | Worst per repeat | Over budget per repeat |
|---|---|---|---|---:|---:|---:|---|---|
| desktop-1280x720 | warm-home | baseline | 34/32/32 | 50.0 | 50.1 | 50.1 | 50.1/66.7/50.1 | 34/34 (100.0%)/32/32 (100.0%)/32/32 (100.0%) |
| desktop-1280x720 | warm-home | candidate | 33/33/31 | 50.0 | 50.1 | 50.1 | 50.1/50.1/66.7 | 33/33 (100.0%)/33/33 (100.0%)/31/31 (100.0%) |
| desktop-1280x720 | light-combat | baseline | 48/50/50 | 66.6 | 66.8 | 83.4 | 83.4/83.4/66.8 | 48/48 (100.0%)/50/50 (100.0%)/50/50 (100.0%) |
| desktop-1280x720 | light-combat | candidate | 48/48/48 | 66.6 | 66.7 | 83.3 | 83.4/83.3/83.2 | 48/48 (100.0%)/48/48 (100.0%)/48/48 (100.0%) |
| desktop-1280x720 | heavy-combat | baseline | 48/47/47 | 66.7 | 83.3 | 83.4 | 83.4/83.4/83.4 | 48/48 (100.0%)/47/47 (100.0%)/47/47 (100.0%) |
| desktop-1280x720 | heavy-combat | candidate | 46/44/45 | 66.7 | 83.3 | 83.4 | 83.4/83.4/83.4 | 46/46 (100.0%)/44/44 (100.0%)/45/45 (100.0%) |
| phone-390x844-dpr3 | warm-home | baseline | 65/65/65 | 16.7 | 33.4 | 33.4 | 33.4/33.4/33.4 | 50/65 (76.9%)/55/65 (84.6%)/52/65 (80.0%) |
| phone-390x844-dpr3 | warm-home | candidate | 61/63/63 | 16.7 | 33.4 | 33.4 | 33.5/33.4/33.4 | 46/61 (75.4%)/56/63 (88.9%)/49/63 (77.8%) |
| phone-390x844-dpr3 | light-combat | baseline | 97/98/99 | 33.3 | 33.4 | 50.1 | 50.0/50.1/50.1 | 88/97 (90.7%)/91/98 (92.9%)/94/99 (94.9%) |
| phone-390x844-dpr3 | light-combat | candidate | 94/97/95 | 33.3 | 33.4 | 50.0 | 50.1/50.0/50.0 | 90/94 (95.7%)/91/97 (93.8%)/93/95 (97.9%) |
| phone-390x844-dpr3 | heavy-combat | baseline | 91/91/89 | 33.3 | 50.0 | 66.7 | 66.7/83.3/66.6 | 89/91 (97.8%)/87/91 (95.6%)/89/89 (100.0%) |
| phone-390x844-dpr3 | heavy-combat | candidate | 88/88/87 | 33.3 | 50.0 | 66.7 | 66.7/66.7/66.6 | 86/88 (97.7%)/87/88 (98.9%)/85/87 (97.7%) |
| foldable-1114x720-dpr2 | warm-home | baseline | 32/32/32 | 50.0 | 50.1 | 66.7 | 66.7/66.7/66.8 | 32/32 (100.0%)/32/32 (100.0%)/32/32 (100.0%) |
| foldable-1114x720-dpr2 | warm-home | candidate | 31/27/31 | 50.0 | 66.7 | 66.7 | 66.7/66.8/66.7 | 31/31 (100.0%)/27/27 (100.0%)/31/31 (100.0%) |
| foldable-1114x720-dpr2 | light-combat | baseline | 47/47/41 | 66.7 | 83.3 | 83.4 | 83.4/83.4/100.0 | 47/47 (100.0%)/47/47 (100.0%)/41/41 (100.0%) |
| foldable-1114x720-dpr2 | light-combat | candidate | 45/44/45 | 66.7 | 83.4 | 83.4 | 116.6/83.4/83.4 | 45/45 (100.0%)/44/44 (100.0%)/45/45 (100.0%) |
| foldable-1114x720-dpr2 | heavy-combat | baseline | 43/43/40 | 66.7 | 83.4 | 116.6 | 100.0/116.7/116.6 | 43/43 (100.0%)/43/43 (100.0%)/40/40 (100.0%) |
| foldable-1114x720-dpr2 | heavy-combat | candidate | 39/43/42 | 66.7 | 83.4 | 133.3 | 133.3/133.4/116.7 | 39/39 (100.0%)/43/43 (100.0%)/42/42 (100.0%) |

## Environment and limitations

```json
{
  "platform": "linux",
  "arch": "x64",
  "release": "7.0.0-31-generic",
  "cpu": "AMD Ryzen 7 7735HS with Radeon Graphics",
  "logicalCPUs": 16,
  "totalMemory": 30717067264,
  "node": "v22.23.2",
  "browser": "153.0.8010.12"
}
```

- Three fresh contexts per profile; identical catalog/save/seed fixtures and runner, sequential baseline then candidate.
- Local Vite preview and unthrottled transfer; CPU4x is emulation, not a calibrated physical phone.
- Three-second combat windows are bounded comparisons, not long-run playtests. Sparse foldable samples limit percentile precision.
- Background host load and baseline-first ordering are uncontrolled; timing differences outside the changed action are not attributed to this implementation.
- Final-candidate diagnostics derive Equipment once rather than four times. Keyboard focus setup precedes timed actions; observer-work differences may still perturb scheduling.
- Probe object walks/polling can perturb scheduling. Local owner timing excludes its eligibility guard; whole-action latency includes it.
- Raw frame cadence includes rendering/compositor scheduling. It is distinct from smoothed gameplay delta and does not by itself establish a simulation CPU bottleneck.
- The raw historical baselineSHA field names Phase A; the immediate control is the measurementSHA pinned above.
- No Figma, physical-device, fun, economy or native-packaging acceptance is inferred from these measurements.
