# Repeated comparison

Immediate baseline runtime: `f61d1231c72e8dc69cf543b3a673c4e16400915a`.
Measured candidate runtime: `83659d2d208c1d845c2db2e13d16846202901f86`.

All times are milliseconds. Cells show median [minimum–maximum] of three repeats.
These are descriptive results, not performance acceptance thresholds.

## Action latency to the actually presented frame

| Profile | Action | Baseline | Candidate |
|---|---|---:|---:|
| desktop-1280x720 | cold-usable-home | 1014.7 [987.9–1066.5] | 1021.8 [989.7–1064.9] |
| desktop-1280x720 | equipment-entry | 37.7 [37.0–40.0] | 40.7 [36.5–55.7] |
| desktop-1280x720 | equipment-select | 171.4 [162.6–172.3] | 172.5 [166.6–179.5] |
| desktop-1280x720 | equipment-equip | 199.8 [194.9–203.6] | 205.3 [196.3–207.0] |
| desktop-1280x720 | equipment-blueprint-select | 195.4 [195.3–202.0] | 197.0 [189.9–199.2] |
| desktop-1280x720 | equipment-fabricate | 212.8 [212.6–213.5] | 209.2 [204.9–213.5] |
| desktop-1280x720 | gunsmith-entry | 75.1 [69.9–91.4] | 72.3 [71.8–73.7] |
| desktop-1280x720 | gunsmith-build-switch | 197.5 [194.6–198.0] | 123.6 [123.0–148.8] |
| desktop-1280x720 | gunsmith-build-select | 200.4 [199.9–201.6] | 120.6 [119.5–132.9] |
| desktop-1280x720 | gunsmith-part-replace | 199.4 [198.6–207.6] | 124.7 [123.8–131.6] |
| desktop-1280x720 | menu-prepared-game | 843.0 [842.5–854.1] | 811.7 [800.2–818.2] |
| desktop-1280x720 | warm-equipment-entry | 68.3 [60.5–74.4] | 65.1 [65.0–65.2] |
| desktop-1280x720 | warm-gunsmith-entry | 67.3 [66.8–69.0] | 78.8 [67.9–78.9] |
| phone-390x844-dpr3 | cold-usable-home | 1583.6 [1565.2–1705.0] | 1644.9 [1641.0–1644.9] |
| phone-390x844-dpr3 | equipment-entry | 130.3 [124.9–141.4] | 135.3 [135.3–136.4] |
| phone-390x844-dpr3 | equipment-select | 215.1 [175.5–221.3] | 188.4 [172.7–190.0] |
| phone-390x844-dpr3 | equipment-equip | 257.0 [250.3–312.6] | 296.5 [267.6–341.7] |
| phone-390x844-dpr3 | equipment-blueprint-select | 224.9 [213.8–231.7] | 223.0 [221.0–247.6] |
| phone-390x844-dpr3 | equipment-fabricate | 275.2 [267.3–296.6] | 270.7 [266.7–273.0] |
| phone-390x844-dpr3 | gunsmith-entry | 229.7 [228.2–243.4] | 238.6 [229.7–266.9] |
| phone-390x844-dpr3 | gunsmith-build-switch | 295.0 [293.0–308.9] | 261.9 [227.6–272.2] |
| phone-390x844-dpr3 | gunsmith-build-select | 271.4 [261.2–323.4] | 231.5 [218.9–235.5] |
| phone-390x844-dpr3 | gunsmith-part-replace | 277.4 [271.1–284.4] | 221.8 [212.4–225.3] |
| phone-390x844-dpr3 | menu-prepared-game | 955.2 [949.6–990.5] | 915.4 [913.8–952.1] |
| phone-390x844-dpr3 | warm-equipment-entry | 194.4 [188.2–195.4] | 224.3 [187.8–227.8] |
| phone-390x844-dpr3 | warm-gunsmith-entry | 195.7 [190.6–205.8] | 203.6 [200.2–207.5] |
| foldable-1114x720-dpr2 | cold-usable-home | 2059.6 [1970.7–2121.8] | 1979.5 [1953.4–2241.9] |
| foldable-1114x720-dpr2 | equipment-entry | 181.6 [172.1–227.0] | 178.1 [176.9–195.0] |
| foldable-1114x720-dpr2 | equipment-select | 259.3 [253.8–291.5] | 269.5 [255.8–279.4] |
| foldable-1114x720-dpr2 | equipment-equip | 402.6 [385.2–404.4] | 409.6 [382.5–437.8] |
| foldable-1114x720-dpr2 | equipment-blueprint-select | 332.6 [326.6–357.9] | 333.6 [328.1–344.8] |
| foldable-1114x720-dpr2 | equipment-fabricate | 397.4 [343.3–403.9] | 400.9 [395.1–403.8] |
| foldable-1114x720-dpr2 | gunsmith-entry | 333.9 [316.8–362.1] | 335.8 [296.3–358.0] |
| foldable-1114x720-dpr2 | gunsmith-build-switch | 477.3 [432.7–489.1] | 368.1 [324.1–373.6] |
| foldable-1114x720-dpr2 | gunsmith-build-select | 428.8 [415.6–458.0] | 334.4 [327.6–443.7] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | 416.0 [372.1–455.1] | 322.5 [315.2–352.1] |
| foldable-1114x720-dpr2 | menu-prepared-game | 1335.6 [1258.4–1360.9] | 1351.1 [1346.6–1362.6] |
| foldable-1114x720-dpr2 | warm-equipment-entry | 247.0 [244.6–250.7] | 261.3 [235.4–291.1] |
| foldable-1114x720-dpr2 | warm-gunsmith-entry | 294.3 [288.2–308.4] | 285.9 [273.4–291.2] |

## Gunsmith body ownership

| Profile | Action | Runtime | Presentation owner | Created | Destroyed | Stable objects | Textures | Owner span |
|---|---|---|---|---|---|---|---|---:|
| desktop-1280x720 | gunsmith-build-switch | baseline | menu.render | 116/116/116 | 111/111/111 | 116/116/116 | 59/59/59 | 68.2 [66.9–69.7] |
| desktop-1280x720 | gunsmith-build-switch | candidate | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 62.0 [59.1–82.3] |
| desktop-1280x720 | gunsmith-build-select | baseline | menu.render | 111/111/111 | 116/116/116 | 111/111/111 | 55/55/55 | 68.6 [68.3–70.4] |
| desktop-1280x720 | gunsmith-build-select | candidate | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 59.7 [58.6–71.6] |
| desktop-1280x720 | gunsmith-part-replace | baseline | menu.render | 111/111/111 | 111/111/111 | 111/111/111 | 55/55/55 | 65.9 [65.7–68.2] |
| desktop-1280x720 | gunsmith-part-replace | candidate | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 59.7 [58.8–61.6] |
| phone-390x844-dpr3 | gunsmith-build-switch | baseline | menu.render | 116/116/116 | 111/111/111 | 116/116/116 | 59/59/59 | 218.8 [215.8–231.8] |
| phone-390x844-dpr3 | gunsmith-build-switch | candidate | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 219.5 [182.6–222.6] |
| phone-390x844-dpr3 | gunsmith-build-select | baseline | menu.render | 111/111/111 | 116/116/116 | 111/111/111 | 55/55/55 | 201.3 [191.5–248.4] |
| phone-390x844-dpr3 | gunsmith-build-select | candidate | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 187.6 [179.6–197.1] |
| phone-390x844-dpr3 | gunsmith-part-replace | baseline | menu.render | 111/111/111 | 111/111/111 | 111/111/111 | 55/55/55 | 203.2 [194.7–209.6] |
| phone-390x844-dpr3 | gunsmith-part-replace | candidate | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 182.5 [172.7–185.2] |
| foldable-1114x720-dpr2 | gunsmith-build-switch | baseline | menu.render | 116/116/116 | 111/111/111 | 116/116/116 | 59/59/59 | 335.8 [296.8–347.5] |
| foldable-1114x720-dpr2 | gunsmith-build-switch | candidate | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 297.2 [251.7–302.2] |
| foldable-1114x720-dpr2 | gunsmith-build-select | baseline | menu.render | 111/111/111 | 116/116/116 | 111/111/111 | 55/55/55 | 293.1 [278.7–312.5] |
| foldable-1114x720-dpr2 | gunsmith-build-select | candidate | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 261.1 [254.6–370.7] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | baseline | menu.render | 111/111/111 | 111/111/111 | 111/111/111 | 55/55/55 | 299.2 [275.1–306.0] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | candidate | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 250.2 [246.7–266.9] |

## Cadence

p50/p95/p99 below are medians of each repeat’s nearest-rank percentile; they are not pooled percentiles.
Count, worst-frame and over-budget ratio retain all three repeats. The budget is 16.67ms.

| Profile | Window | Runtime | Samples | p50 | p95 | p99 | Worst per repeat | Over budget per repeat |
|---|---|---|---|---:|---:|---:|---|---|
| desktop-1280x720 | warm-home | baseline | 33/31/31 | 50.0 | 66.7 | 66.7 | 66.7/66.7/66.7 | 33/33 (100.0%)/31/31 (100.0%)/31/31 (100.0%) |
| desktop-1280x720 | warm-home | candidate | 33/33/31 | 50.0 | 50.1 | 66.6 | 66.6/50.1/66.6 | 33/33 (100.0%)/33/33 (100.0%)/31/31 (100.0%) |
| desktop-1280x720 | light-combat | baseline | 50/49/49 | 66.6 | 66.8 | 83.3 | 83.3/83.4/66.8 | 50/50 (100.0%)/49/49 (100.0%)/49/49 (100.0%) |
| desktop-1280x720 | light-combat | candidate | 50/49/49 | 66.6 | 66.7 | 66.7 | 66.7/66.7/66.8 | 50/50 (100.0%)/49/49 (100.0%)/49/49 (100.0%) |
| desktop-1280x720 | heavy-combat | baseline | 47/47/46 | 66.7 | 83.3 | 83.3 | 83.3/83.3/83.4 | 47/47 (100.0%)/47/47 (100.0%)/46/46 (100.0%) |
| desktop-1280x720 | heavy-combat | candidate | 47/46/47 | 66.7 | 66.8 | 83.4 | 83.4/83.4/83.3 | 47/47 (100.0%)/46/46 (100.0%)/47/47 (100.0%) |
| phone-390x844-dpr3 | warm-home | baseline | 64/63/63 | 16.7 | 33.4 | 33.4 | 33.4/33.4/33.4 | 51/64 (79.7%)/49/63 (77.8%)/52/63 (82.5%) |
| phone-390x844-dpr3 | warm-home | candidate | 64/64/63 | 16.7 | 33.4 | 33.4 | 33.4/33.4/33.5 | 45/64 (70.3%)/50/64 (78.1%)/48/63 (76.2%) |
| phone-390x844-dpr3 | light-combat | baseline | 97/96/97 | 33.3 | 33.5 | 50.1 | 50.0/50.1/66.7 | 92/97 (94.8%)/87/96 (90.6%)/93/97 (95.9%) |
| phone-390x844-dpr3 | light-combat | candidate | 96/95/96 | 33.3 | 33.4 | 50.1 | 50.1/50.1/50.0 | 93/96 (96.9%)/89/95 (93.7%)/91/96 (94.8%) |
| phone-390x844-dpr3 | heavy-combat | baseline | 91/91/89 | 33.3 | 50.0 | 66.7 | 66.7/66.6/83.2 | 90/91 (98.9%)/90/91 (98.9%)/87/89 (97.8%) |
| phone-390x844-dpr3 | heavy-combat | candidate | 89/90/84 | 33.3 | 50.0 | 66.7 | 66.7/66.6/83.4 | 87/89 (97.8%)/89/90 (98.9%)/83/84 (98.8%) |
| foldable-1114x720-dpr2 | warm-home | baseline | 31/29/31 | 50.0 | 66.6 | 66.7 | 66.7/66.6/66.7 | 31/31 (100.0%)/29/29 (100.0%)/31/31 (100.0%) |
| foldable-1114x720-dpr2 | warm-home | candidate | 30/32/30 | 50.0 | 66.6 | 66.7 | 66.7/66.7/66.7 | 30/30 (100.0%)/32/32 (100.0%)/30/30 (100.0%) |
| foldable-1114x720-dpr2 | light-combat | baseline | 45/45/46 | 66.7 | 83.4 | 83.4 | 83.4/83.4/83.5 | 45/45 (100.0%)/45/45 (100.0%)/46/46 (100.0%) |
| foldable-1114x720-dpr2 | light-combat | candidate | 46/46/45 | 66.7 | 83.3 | 83.4 | 83.4/83.4/83.4 | 46/46 (100.0%)/46/46 (100.0%)/45/45 (100.0%) |
| foldable-1114x720-dpr2 | heavy-combat | baseline | 42/43/42 | 66.7 | 83.4 | 116.6 | 116.6/133.3/100.0 | 42/42 (100.0%)/43/43 (100.0%)/42/42 (100.0%) |
| foldable-1114x720-dpr2 | heavy-combat | candidate | 42/42/42 | 66.7 | 83.4 | 100.1 | 100.0/116.7/100.1 | 42/42 (100.0%)/42/42 (100.0%)/42/42 (100.0%) |

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
