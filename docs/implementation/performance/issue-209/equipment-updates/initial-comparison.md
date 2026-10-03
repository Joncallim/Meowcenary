# Repeated comparison

Immediate baseline runtime: `251d77d9a87d2062e6cd9e7b13c66fad95a94363`.
Measured candidate runtime: `bc4b8e771c0b8bea734f214fe4796f0444432bb2`.

All times are milliseconds. Cells show median [minimum–maximum] of three repeats.
These are descriptive results, not performance acceptance thresholds.

## Action latency to the actually presented frame

| Profile | Action | Baseline | Candidate |
|---|---|---:|---:|
| desktop-1280x720 | cold-usable-home | 1021.6 [1013.1–1044.0] | 1027.1 [979.9–1052.7] |
| desktop-1280x720 | equipment-entry | 45.1 [44.6–50.1] | 48.8 [46.6–49.2] |
| desktop-1280x720 | equipment-select | 230.0 [213.6–246.7] | 187.4 [182.0–189.4] |
| desktop-1280x720 | equipment-equip | 209.8 [201.3–214.3] | 220.7 [213.9–234.3] |
| desktop-1280x720 | equipment-blueprint-select | 228.3 [203.7–238.4] | 203.2 [201.7–209.6] |
| desktop-1280x720 | equipment-fabricate | 216.3 [214.5–248.1] | 245.2 [218.0–245.3] |
| desktop-1280x720 | gunsmith-entry | 98.7 [86.9–103.9] | 97.2 [92.5–99.3] |
| desktop-1280x720 | gunsmith-build-select | 226.7 [225.3–266.8] | 216.7 [214.1–229.7] |
| desktop-1280x720 | gunsmith-part-replace | 244.2 [217.6–246.8] | 222.4 [219.9–235.6] |
| desktop-1280x720 | menu-prepared-game | 840.3 [801.9–854.7] | 866.6 [806.6–869.0] |
| desktop-1280x720 | warm-equipment-entry | 64.7 [64.5–68.6] | 69.8 [66.8–92.2] |
| desktop-1280x720 | warm-gunsmith-entry | 84.3 [83.7–89.8] | 86.2 [82.1–93.8] |
| phone-390x844-dpr3 | cold-usable-home | 1681.1 [1623.4–1690.8] | 1705.9 [1682.3–1708.4] |
| phone-390x844-dpr3 | equipment-entry | 133.0 [132.3–134.3] | 142.9 [133.5–151.9] |
| phone-390x844-dpr3 | equipment-select | 303.9 [289.7–330.3] | 182.3 [181.1–190.8] |
| phone-390x844-dpr3 | equipment-equip | 269.4 [265.6–281.3] | 279.2 [274.8–284.3] |
| phone-390x844-dpr3 | equipment-blueprint-select | 223.2 [217.3–248.7] | 237.2 [228.9–255.3] |
| phone-390x844-dpr3 | equipment-fabricate | 287.1 [276.6–296.1] | 289.1 [279.0–292.1] |
| phone-390x844-dpr3 | gunsmith-entry | 250.0 [242.9–262.1] | 255.3 [254.8–267.2] |
| phone-390x844-dpr3 | gunsmith-build-select | 305.7 [304.4–305.8] | 309.1 [308.6–313.8] |
| phone-390x844-dpr3 | gunsmith-part-replace | 306.3 [305.3–316.7] | 303.0 [300.2–306.6] |
| phone-390x844-dpr3 | menu-prepared-game | 961.3 [959.7–978.1] | 899.3 [890.2–946.2] |
| phone-390x844-dpr3 | warm-equipment-entry | 175.5 [173.8–217.1] | 196.9 [195.6–203.0] |
| phone-390x844-dpr3 | warm-gunsmith-entry | 226.0 [225.1–265.4] | 231.5 [230.8–265.9] |
| foldable-1114x720-dpr2 | cold-usable-home | 2046.7 [2003.3–2116.1] | 2010.1 [2007.0–2038.5] |
| foldable-1114x720-dpr2 | equipment-entry | 217.3 [213.5–235.8] | 228.8 [199.1–271.8] |
| foldable-1114x720-dpr2 | equipment-select | 477.0 [453.9–480.0] | 301.7 [291.9–305.4] |
| foldable-1114x720-dpr2 | equipment-equip | 408.9 [404.8–417.6] | 459.7 [443.4–487.6] |
| foldable-1114x720-dpr2 | equipment-blueprint-select | 371.8 [368.8–442.2] | 404.1 [361.6–422.2] |
| foldable-1114x720-dpr2 | equipment-fabricate | 457.9 [413.2–520.9] | 487.8 [445.8–520.5] |
| foldable-1114x720-dpr2 | gunsmith-entry | 413.1 [361.1–462.6] | 413.1 [380.4–424.2] |
| foldable-1114x720-dpr2 | gunsmith-build-select | 508.8 [498.7–538.1] | 520.8 [510.6–548.2] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | 502.4 [497.5–516.9] | 530.2 [502.5–578.2] |
| foldable-1114x720-dpr2 | menu-prepared-game | 1230.0 [1220.0–1299.4] | 1242.7 [1237.0–1308.8] |
| foldable-1114x720-dpr2 | warm-equipment-entry | 261.2 [252.6–292.3] | 296.6 [270.5–326.8] |
| foldable-1114x720-dpr2 | warm-gunsmith-entry | 395.4 [354.2–404.6] | 376.2 [339.1–383.1] |

## Equipment selection ownership

| Profile | Runtime | Presentation owner | Created | Destroyed | Stable objects | Textures | Owner span |
|---|---|---|---|---|---|---|---:|
| desktop-1280x720 | baseline | menu.render | 118/118/118 | 96/96/96 | 118/118/118 | 57/57/57 | 74.7 [68.8–77.4] |
| desktop-1280x720 | candidate | menu.update | 41/41/41 | 19/19/19 | 118/118/118 | 57/57/57 | 34.1 [34.0–37.0] |
| phone-390x844-dpr3 | baseline | menu.render | 118/118/118 | 96/96/96 | 118/118/118 | 57/57/57 | 226.8 [210.6–249.3] |
| phone-390x844-dpr3 | candidate | menu.update | 41/41/41 | 19/19/19 | 118/118/118 | 57/57/57 | 98.5 [96.9–103.1] |
| foldable-1114x720-dpr2 | baseline | menu.render | 118/118/118 | 96/96/96 | 118/118/118 | 57/57/57 | 312.1 [291.8–326.7] |
| foldable-1114x720-dpr2 | candidate | menu.update | 41/41/41 | 19/19/19 | 118/118/118 | 57/57/57 | 136.1 [128.6–137.8] |

## Cadence

p50/p95/p99 below are medians of each repeat’s nearest-rank percentile; they are not pooled percentiles.
Count, worst-frame and over-budget ratio retain all three repeats. The budget is 16.67ms.

| Profile | Window | Runtime | Samples | p50 | p95 | p99 | Worst per repeat | Over budget per repeat |
|---|---|---|---|---:|---:|---:|---|---|
| desktop-1280x720 | warm-home | baseline | 31/32/31 | 50.0 | 50.1 | 66.6 | 66.6/66.6/66.6 | 31/31 (100.0%)/32/32 (100.0%)/31/31 (100.0%) |
| desktop-1280x720 | warm-home | candidate | 32/32/32 | 50.0 | 50.1 | 66.6 | 66.7/50.1/66.6 | 32/32 (100.0%)/32/32 (100.0%)/32/32 (100.0%) |
| desktop-1280x720 | light-combat | baseline | 50/51/49 | 66.6 | 66.7 | 66.8 | 66.7/66.8/66.8 | 50/50 (100.0%)/51/51 (100.0%)/49/49 (100.0%) |
| desktop-1280x720 | light-combat | candidate | 48/49/48 | 66.7 | 66.8 | 83.3 | 83.4/83.3/83.3 | 48/48 (100.0%)/49/49 (100.0%)/48/48 (100.0%) |
| desktop-1280x720 | heavy-combat | baseline | 48/46/47 | 66.7 | 66.8 | 83.4 | 83.4/83.4/83.3 | 48/48 (100.0%)/46/46 (100.0%)/47/47 (100.0%) |
| desktop-1280x720 | heavy-combat | candidate | 46/45/45 | 66.7 | 83.3 | 83.4 | 83.3/83.4/83.4 | 46/46 (100.0%)/45/45 (100.0%)/45/45 (100.0%) |
| phone-390x844-dpr3 | warm-home | baseline | 63/64/63 | 16.7 | 33.4 | 33.5 | 33.4/33.5/33.5 | 53/63 (84.1%)/50/64 (78.1%)/49/63 (77.8%) |
| phone-390x844-dpr3 | warm-home | candidate | 64/64/64 | 16.7 | 33.4 | 33.4 | 33.4/33.5/33.4 | 52/64 (81.2%)/47/64 (73.4%)/48/64 (75.0%) |
| phone-390x844-dpr3 | light-combat | baseline | 96/95/93 | 33.3 | 33.4 | 50.1 | 50.1/50.1/50.0 | 91/96 (94.8%)/89/95 (93.7%)/89/93 (95.7%) |
| phone-390x844-dpr3 | light-combat | candidate | 93/89/94 | 33.3 | 50.0 | 50.1 | 50.0/66.7/50.1 | 89/93 (95.7%)/84/89 (94.4%)/92/94 (97.9%) |
| phone-390x844-dpr3 | heavy-combat | baseline | 85/91/86 | 33.3 | 50.0 | 66.7 | 100.0/66.7/66.6 | 84/85 (98.8%)/90/91 (98.9%)/85/86 (98.8%) |
| phone-390x844-dpr3 | heavy-combat | candidate | 82/88/84 | 33.3 | 50.0 | 66.6 | 66.6/66.6/83.4 | 82/82 (100.0%)/88/88 (100.0%)/84/84 (100.0%) |
| foldable-1114x720-dpr2 | warm-home | baseline | 31/31/32 | 50.0 | 50.1 | 50.1 | 50.1/50.1/50.1 | 31/31 (100.0%)/31/31 (100.0%)/32/32 (100.0%) |
| foldable-1114x720-dpr2 | warm-home | candidate | 30/30/31 | 50.0 | 66.6 | 66.7 | 66.7/66.8/66.7 | 30/30 (100.0%)/30/30 (100.0%)/31/31 (100.0%) |
| foldable-1114x720-dpr2 | light-combat | baseline | 46/46/46 | 66.7 | 83.3 | 100.0 | 100.0/83.4/100.0 | 46/46 (100.0%)/46/46 (100.0%)/46/46 (100.0%) |
| foldable-1114x720-dpr2 | light-combat | candidate | 46/45/45 | 66.7 | 83.3 | 83.4 | 83.4/83.4/83.4 | 46/46 (100.0%)/45/45 (100.0%)/45/45 (100.0%) |
| foldable-1114x720-dpr2 | heavy-combat | baseline | 43/43/42 | 66.7 | 83.4 | 100.1 | 116.7/99.9/100.1 | 43/43 (100.0%)/43/43 (100.0%)/42/42 (100.0%) |
| foldable-1114x720-dpr2 | heavy-combat | candidate | 41/43/42 | 66.7 | 83.4 | 100.0 | 116.7/100.0/100.0 | 41/41 (100.0%)/43/43 (100.0%)/42/42 (100.0%) |

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
- Probe object walks/polling can perturb scheduling. Local owner timing excludes its eligibility guard; whole-action latency includes it.
- Raw frame cadence includes rendering/compositor scheduling. It is distinct from smoothed gameplay delta and does not by itself establish a simulation CPU bottleneck.
- The raw historical baselineSHA field names Phase A; the immediate control is the measurementSHA pinned above.
- No Figma, physical-device, fun, economy or native-packaging acceptance is inferred from these measurements.
