# Repeated comparison

Immediate baseline runtime: `f61d1231c72e8dc69cf543b3a673c4e16400915a`.
Measured candidate runtime: `0c2afcca0303e9b891dd2724c0d79a9e9f8d87f6`.

All times are milliseconds. Cells show median [minimum–maximum] of three repeats.
These are descriptive results, not performance acceptance thresholds.

## Action latency to the actually presented frame

| Profile | Action | Baseline | Candidate |
|---|---|---:|---:|
| desktop-1280x720 | cold-usable-home | 1014.7 [987.9–1066.5] | 1004.4 [985.7–1080.7] |
| desktop-1280x720 | equipment-entry | 37.7 [37.0–40.0] | 43.7 [40.0–45.4] |
| desktop-1280x720 | equipment-select | 171.4 [162.6–172.3] | 180.7 [167.5–182.9] |
| desktop-1280x720 | equipment-equip | 199.8 [194.9–203.6] | 206.7 [205.0–219.4] |
| desktop-1280x720 | equipment-blueprint-select | 195.4 [195.3–202.0] | 191.3 [190.4–200.6] |
| desktop-1280x720 | equipment-fabricate | 212.8 [212.6–213.5] | 219.8 [196.8–224.0] |
| desktop-1280x720 | gunsmith-entry | 75.1 [69.9–91.4] | 76.0 [74.7–80.5] |
| desktop-1280x720 | gunsmith-build-switch | 197.5 [194.6–198.0] | 126.1 [117.7–162.0] |
| desktop-1280x720 | gunsmith-build-select | 200.4 [199.9–201.6] | 126.2 [124.0–128.5] |
| desktop-1280x720 | gunsmith-part-replace | 199.4 [198.6–207.6] | 143.3 [125.5–153.4] |
| desktop-1280x720 | menu-prepared-game | 843.0 [842.5–854.1] | 817.5 [794.6–848.7] |
| desktop-1280x720 | warm-equipment-entry | 68.3 [60.5–74.4] | 65.7 [62.3–69.3] |
| desktop-1280x720 | warm-gunsmith-entry | 67.3 [66.8–69.0] | 71.9 [68.9–73.2] |
| phone-390x844-dpr3 | cold-usable-home | 1583.6 [1565.2–1705.0] | 1700.4 [1632.8–1713.9] |
| phone-390x844-dpr3 | equipment-entry | 130.3 [124.9–141.4] | 131.6 [130.0–146.1] |
| phone-390x844-dpr3 | equipment-select | 215.1 [175.5–221.3] | 177.4 [176.0–188.8] |
| phone-390x844-dpr3 | equipment-equip | 257.0 [250.3–312.6] | 267.8 [264.6–298.8] |
| phone-390x844-dpr3 | equipment-blueprint-select | 224.9 [213.8–231.7] | 212.9 [203.4–252.0] |
| phone-390x844-dpr3 | equipment-fabricate | 275.2 [267.3–296.6] | 274.8 [257.9–281.9] |
| phone-390x844-dpr3 | gunsmith-entry | 229.7 [228.2–243.4] | 230.7 [225.4–237.7] |
| phone-390x844-dpr3 | gunsmith-build-switch | 295.0 [293.0–308.9] | 246.4 [242.7–260.9] |
| phone-390x844-dpr3 | gunsmith-build-select | 271.4 [261.2–323.4] | 227.1 [216.7–256.2] |
| phone-390x844-dpr3 | gunsmith-part-replace | 277.4 [271.1–284.4] | 215.1 [207.7–223.2] |
| phone-390x844-dpr3 | menu-prepared-game | 955.2 [949.6–990.5] | 904.6 [895.8–914.6] |
| phone-390x844-dpr3 | warm-equipment-entry | 194.4 [188.2–195.4] | 216.2 [210.4–234.1] |
| phone-390x844-dpr3 | warm-gunsmith-entry | 195.7 [190.6–205.8] | 197.7 [193.5–209.6] |
| foldable-1114x720-dpr2 | cold-usable-home | 2059.6 [1970.7–2121.8] | 1986.9 [1969.3–2032.8] |
| foldable-1114x720-dpr2 | equipment-entry | 181.6 [172.1–227.0] | 186.1 [163.8–213.2] |
| foldable-1114x720-dpr2 | equipment-select | 259.3 [253.8–291.5] | 266.0 [261.7–318.8] |
| foldable-1114x720-dpr2 | equipment-equip | 402.6 [385.2–404.4] | 390.2 [381.7–460.6] |
| foldable-1114x720-dpr2 | equipment-blueprint-select | 332.6 [326.6–357.9] | 375.7 [339.4–492.9] |
| foldable-1114x720-dpr2 | equipment-fabricate | 397.4 [343.3–403.9] | 446.0 [398.4–497.3] |
| foldable-1114x720-dpr2 | gunsmith-entry | 333.9 [316.8–362.1] | 319.0 [312.0–322.1] |
| foldable-1114x720-dpr2 | gunsmith-build-switch | 477.3 [432.7–489.1] | 336.3 [325.7–339.8] |
| foldable-1114x720-dpr2 | gunsmith-build-select | 428.8 [415.6–458.0] | 331.0 [319.1–335.5] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | 416.0 [372.1–455.1] | 317.6 [317.1–326.9] |
| foldable-1114x720-dpr2 | menu-prepared-game | 1335.6 [1258.4–1360.9] | 1315.2 [1262.7–1406.9] |
| foldable-1114x720-dpr2 | warm-equipment-entry | 247.0 [244.6–250.7] | 268.2 [250.3–310.6] |
| foldable-1114x720-dpr2 | warm-gunsmith-entry | 294.3 [288.2–308.4] | 317.0 [308.4–321.0] |

## Gunsmith body ownership

| Profile | Action | Runtime | Presentation owner | Created | Destroyed | Stable objects | Textures | Owner span |
|---|---|---|---|---|---|---|---|---:|
| desktop-1280x720 | gunsmith-build-switch | baseline | menu.render | 116/116/116 | 111/111/111 | 116/116/116 | 59/59/59 | 68.2 [66.9–69.7] |
| desktop-1280x720 | gunsmith-build-switch | candidate | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 64.0 [58.0–91.2] |
| desktop-1280x720 | gunsmith-build-select | baseline | menu.render | 111/111/111 | 116/116/116 | 111/111/111 | 55/55/55 | 68.6 [68.3–70.4] |
| desktop-1280x720 | gunsmith-build-select | candidate | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 62.2 [61.7–65.5] |
| desktop-1280x720 | gunsmith-part-replace | baseline | menu.render | 111/111/111 | 111/111/111 | 111/111/111 | 55/55/55 | 65.9 [65.7–68.2] |
| desktop-1280x720 | gunsmith-part-replace | candidate | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 73.0 [60.0–82.1] |
| phone-390x844-dpr3 | gunsmith-build-switch | baseline | menu.render | 116/116/116 | 111/111/111 | 116/116/116 | 59/59/59 | 218.8 [215.8–231.8] |
| phone-390x844-dpr3 | gunsmith-build-switch | candidate | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 200.4 [198.1–212.5] |
| phone-390x844-dpr3 | gunsmith-build-select | baseline | menu.render | 111/111/111 | 116/116/116 | 111/111/111 | 55/55/55 | 201.3 [191.5–248.4] |
| phone-390x844-dpr3 | gunsmith-build-select | candidate | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 184.9 [175.1–218.5] |
| phone-390x844-dpr3 | gunsmith-part-replace | baseline | menu.render | 111/111/111 | 111/111/111 | 111/111/111 | 55/55/55 | 203.2 [194.7–209.6] |
| phone-390x844-dpr3 | gunsmith-part-replace | candidate | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 170.6 [167.7–177.8] |
| foldable-1114x720-dpr2 | gunsmith-build-switch | baseline | menu.render | 116/116/116 | 111/111/111 | 116/116/116 | 59/59/59 | 335.8 [296.8–347.5] |
| foldable-1114x720-dpr2 | gunsmith-build-switch | candidate | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 260.8 [256.5–263.5] |
| foldable-1114x720-dpr2 | gunsmith-build-select | baseline | menu.render | 111/111/111 | 116/116/116 | 111/111/111 | 55/55/55 | 293.1 [278.7–312.5] |
| foldable-1114x720-dpr2 | gunsmith-build-select | candidate | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 261.9 [246.8–264.6] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | baseline | menu.render | 111/111/111 | 111/111/111 | 111/111/111 | 55/55/55 | 299.2 [275.1–306.0] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | candidate | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 244.0 [242.9–255.9] |

## Cadence

p50/p95/p99 below are medians of each repeat’s nearest-rank percentile; they are not pooled percentiles.
Count, worst-frame and over-budget ratio retain all three repeats. The budget is 16.67ms.

| Profile | Window | Runtime | Samples | p50 | p95 | p99 | Worst per repeat | Over budget per repeat |
|---|---|---|---|---:|---:|---:|---|---|
| desktop-1280x720 | warm-home | baseline | 33/31/31 | 50.0 | 66.7 | 66.7 | 66.7/66.7/66.7 | 33/33 (100.0%)/31/31 (100.0%)/31/31 (100.0%) |
| desktop-1280x720 | warm-home | candidate | 32/32/32 | 50.0 | 50.1 | 66.8 | 50.1/66.8/66.8 | 32/32 (100.0%)/32/32 (100.0%)/32/32 (100.0%) |
| desktop-1280x720 | light-combat | baseline | 50/49/49 | 66.6 | 66.8 | 83.3 | 83.3/83.4/66.8 | 50/50 (100.0%)/49/49 (100.0%)/49/49 (100.0%) |
| desktop-1280x720 | light-combat | candidate | 49/48/49 | 66.6 | 66.8 | 83.3 | 83.3/83.3/83.3 | 49/49 (100.0%)/48/48 (100.0%)/49/49 (100.0%) |
| desktop-1280x720 | heavy-combat | baseline | 47/47/46 | 66.7 | 83.3 | 83.3 | 83.3/83.3/83.4 | 47/47 (100.0%)/47/47 (100.0%)/46/46 (100.0%) |
| desktop-1280x720 | heavy-combat | candidate | 47/44/46 | 66.7 | 83.3 | 83.4 | 83.3/83.4/83.4 | 47/47 (100.0%)/44/44 (100.0%)/46/46 (100.0%) |
| phone-390x844-dpr3 | warm-home | baseline | 64/63/63 | 16.7 | 33.4 | 33.4 | 33.4/33.4/33.4 | 51/64 (79.7%)/49/63 (77.8%)/52/63 (82.5%) |
| phone-390x844-dpr3 | warm-home | candidate | 61/62/63 | 16.7 | 33.4 | 33.4 | 33.4/33.4/33.4 | 50/61 (82.0%)/50/62 (80.6%)/49/63 (77.8%) |
| phone-390x844-dpr3 | light-combat | baseline | 97/96/97 | 33.3 | 33.5 | 50.1 | 50.0/50.1/66.7 | 92/97 (94.8%)/87/96 (90.6%)/93/97 (95.9%) |
| phone-390x844-dpr3 | light-combat | candidate | 96/95/93 | 33.3 | 49.9 | 50.1 | 50.1/50.1/50.1 | 88/96 (91.7%)/89/95 (93.7%)/88/93 (94.6%) |
| phone-390x844-dpr3 | heavy-combat | baseline | 91/91/89 | 33.3 | 50.0 | 66.7 | 66.7/66.6/83.2 | 90/91 (98.9%)/90/91 (98.9%)/87/89 (97.8%) |
| phone-390x844-dpr3 | heavy-combat | candidate | 90/89/87 | 33.3 | 50.0 | 83.3 | 83.4/83.3/83.3 | 89/90 (98.9%)/87/89 (97.8%)/86/87 (98.9%) |
| foldable-1114x720-dpr2 | warm-home | baseline | 31/29/31 | 50.0 | 66.6 | 66.7 | 66.7/66.6/66.7 | 31/31 (100.0%)/29/29 (100.0%)/31/31 (100.0%) |
| foldable-1114x720-dpr2 | warm-home | candidate | 31/32/31 | 50.0 | 50.1 | 66.7 | 66.7/50.1/66.7 | 31/31 (100.0%)/32/32 (100.0%)/31/31 (100.0%) |
| foldable-1114x720-dpr2 | light-combat | baseline | 45/45/46 | 66.7 | 83.4 | 83.4 | 83.4/83.4/83.5 | 45/45 (100.0%)/45/45 (100.0%)/46/46 (100.0%) |
| foldable-1114x720-dpr2 | light-combat | candidate | 45/46/45 | 66.7 | 83.3 | 83.4 | 83.4/83.4/83.4 | 45/45 (100.0%)/46/46 (100.0%)/45/45 (100.0%) |
| foldable-1114x720-dpr2 | heavy-combat | baseline | 42/43/42 | 66.7 | 83.4 | 116.6 | 116.6/133.3/100.0 | 42/42 (100.0%)/43/43 (100.0%)/42/42 (100.0%) |
| foldable-1114x720-dpr2 | heavy-combat | candidate | 43/42/42 | 66.7 | 83.4 | 100.0 | 99.9/116.6/100.0 | 43/43 (100.0%)/42/42 (100.0%)/42/42 (100.0%) |

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
- Both runtimes use the same strengthened runner: actual Pistol → SMG → Pistol durable switches, then receiver replacement. Earlier reports measured reselection; timings are not compared across that changed method.
- Probe object walks/polling can perturb scheduling. Local owner timing excludes its eligibility guard; whole-action latency includes it.
- Raw frame cadence includes rendering/compositor scheduling. It is distinct from smoothed gameplay delta and does not by itself establish a simulation CPU bottleneck.
- The raw historical baselineSHA field names Phase A; the immediate control is the measurementSHA pinned above.
- No Figma, physical-device, fun, economy or native-packaging acceptance is inferred from these measurements.
