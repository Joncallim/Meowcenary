# Repeated comparison

Immediate baseline runtime: `070ebb0942b854b7b57e8857624fb75e2d9de827`.
Measured candidate runtime: `d25a61700048edc4494a06c90a196207c2d1ce15`.

All times are milliseconds. Cells show median [minimum–maximum] of three repeats.
These are descriptive results, not performance acceptance thresholds.

## Action latency to the actually presented frame

| Profile | Action | Baseline | Candidate |
|---|---|---:|---:|
| desktop-1280x720 | cold-usable-home | 998.9 [994.5–1007.9] | 994.4 [968.0–1130.6] |
| desktop-1280x720 | home-contract | 42.9 [42.4–46.2] | 41.9 [39.1–46.4] |
| desktop-1280x720 | home-mercenary | 432.9 [424.3–459.8] | 425.7 [412.4–463.0] |
| desktop-1280x720 | home-career | 8.0 [8.0–8.7] | 8.6 [8.4–8.6] |
| desktop-1280x720 | loadout-entry | 1334.4 [1309.5–1362.0] | 1273.8 [1247.1–1331.1] |
| desktop-1280x720 | equipment-entry | 41.1 [37.3–53.2] | 38.5 [38.2–38.9] |
| desktop-1280x720 | equipment-select | 172.8 [169.7–182.0] | 173.4 [170.1–195.0] |
| desktop-1280x720 | equipment-equip | 213.1 [209.2–224.2] | 216.2 [203.4–222.3] |
| desktop-1280x720 | equipment-blueprint-select | 196.9 [194.5–200.3] | 204.8 [194.7–210.9] |
| desktop-1280x720 | equipment-fabricate | 227.4 [208.4–235.7] | 210.3 [208.0–231.9] |
| desktop-1280x720 | gunsmith-entry | 72.7 [71.7–77.3] | 74.0 [66.1–88.5] |
| desktop-1280x720 | gunsmith-build-switch | 123.3 [115.4–140.7] | 127.8 [117.7–158.3] |
| desktop-1280x720 | gunsmith-build-select | 120.2 [118.5–132.0] | 133.0 [121.6–139.9] |
| desktop-1280x720 | gunsmith-part-replace | 126.3 [122.8–135.7] | 125.1 [118.2–126.3] |
| desktop-1280x720 | warm-equipment-entry | 58.9 [54.3–60.3] | 61.4 [60.9–62.7] |
| desktop-1280x720 | warm-gunsmith-entry | 73.7 [71.0–75.3] | 70.2 [67.6–82.7] |
| desktop-1280x720 | warm-home-return | 15.2 [14.5–15.4] | 14.0 [13.9–14.2] |
| desktop-1280x720 | menu-prepared-game | 845.5 [827.3–911.6] | 842.4 [801.8–843.5] |
| desktop-1280x720 | pause | 73.4 [70.6–75.0] | 73.3 [71.1–85.1] |
| desktop-1280x720 | resume | 84.1 [76.3–90.5] | 80.2 [79.1–82.0] |
| desktop-1280x720 | resize-orientation-return | 691.5 [670.1–698.9] | 691.8 [678.1–696.8] |
| desktop-1280x720 | run-result-menu | 234.6 [226.2–236.7] | 227.6 [224.1–242.9] |
| desktop-1280x720 | warm-menu-prepared-game | 96.7 [88.7–99.7] | 97.4 [89.8–112.7] |
| desktop-1280x720 | warm-run-result-menu | 237.8 [237.4–258.4] | 241.9 [234.1–250.0] |
| phone-390x844-dpr3 | cold-usable-home | 1690.8 [1659.3–1718.8] | 1574.8 [1566.5–1641.3] |
| phone-390x844-dpr3 | home-contract | 141.0 [132.9–153.5] | 135.3 [127.9–137.8] |
| phone-390x844-dpr3 | home-mercenary | 533.6 [511.4–536.1] | 508.0 [492.1–511.9] |
| phone-390x844-dpr3 | home-career | 31.3 [30.9–32.6] | 31.2 [28.5–31.9] |
| phone-390x844-dpr3 | loadout-entry | 1308.0 [1258.3–1365.8] | 1251.0 [1218.1–1265.8] |
| phone-390x844-dpr3 | equipment-entry | 138.1 [137.4–155.7] | 132.2 [131.5–180.3] |
| phone-390x844-dpr3 | equipment-select | 177.2 [176.0–177.6] | 174.7 [172.4–208.6] |
| phone-390x844-dpr3 | equipment-equip | 293.2 [252.0–303.5] | 264.1 [257.8–266.0] |
| phone-390x844-dpr3 | equipment-blueprint-select | 214.4 [210.6–214.5] | 212.5 [206.0–215.2] |
| phone-390x844-dpr3 | equipment-fabricate | 268.6 [265.3–270.0] | 263.1 [260.2–291.0] |
| phone-390x844-dpr3 | gunsmith-entry | 227.1 [221.3–255.5] | 271.4 [231.0–274.4] |
| phone-390x844-dpr3 | gunsmith-build-switch | 229.6 [226.9–250.6] | 232.5 [216.3–234.3] |
| phone-390x844-dpr3 | gunsmith-build-select | 220.9 [218.9–234.4] | 241.2 [223.8–250.6] |
| phone-390x844-dpr3 | gunsmith-part-replace | 219.5 [215.1–260.3] | 236.7 [231.6–254.8] |
| phone-390x844-dpr3 | warm-equipment-entry | 212.6 [187.5–232.8] | 187.8 [187.4–192.1] |
| phone-390x844-dpr3 | warm-gunsmith-entry | 205.2 [199.4–206.6] | 200.4 [199.4–205.7] |
| phone-390x844-dpr3 | warm-home-return | 44.0 [42.5–47.0] | 46.9 [46.0–51.2] |
| phone-390x844-dpr3 | menu-prepared-game | 926.1 [889.9–959.9] | 958.4 [945.4–1060.0] |
| phone-390x844-dpr3 | pause | 61.4 [61.1–64.2] | 58.1 [54.3–59.1] |
| phone-390x844-dpr3 | resume | 49.4 [49.3–50.3] | 47.9 [46.4–53.4] |
| phone-390x844-dpr3 | resize-orientation-return | 576.5 [574.3–615.5] | 571.5 [561.1–584.0] |
| phone-390x844-dpr3 | run-result-menu | 206.1 [195.6–224.0] | 216.1 [202.3–220.0] |
| phone-390x844-dpr3 | warm-menu-prepared-game | 188.4 [180.2–192.0] | 183.4 [177.4–190.3] |
| phone-390x844-dpr3 | warm-run-result-menu | 196.9 [196.3–202.9] | 197.5 [194.6–213.0] |
| foldable-1114x720-dpr2 | cold-usable-home | 1984.6 [1920.4–2007.8] | 2072.6 [2067.6–2113.4] |
| foldable-1114x720-dpr2 | home-contract | 167.8 [158.6–237.7] | 187.5 [175.3–193.5] |
| foldable-1114x720-dpr2 | home-mercenary | 762.8 [734.9–857.4] | 826.2 [806.8–845.8] |
| foldable-1114x720-dpr2 | home-career | 34.5 [34.4–55.8] | 33.0 [31.9–35.6] |
| foldable-1114x720-dpr2 | loadout-entry | 1916.2 [1752.0–1982.9] | 1958.5 [1898.3–1966.9] |
| foldable-1114x720-dpr2 | equipment-entry | 180.2 [178.5–187.2] | 183.8 [183.4–203.9] |
| foldable-1114x720-dpr2 | equipment-select | 261.3 [254.8–289.4] | 274.9 [269.5–279.9] |
| foldable-1114x720-dpr2 | equipment-equip | 380.7 [371.8–385.1] | 409.4 [399.7–447.2] |
| foldable-1114x720-dpr2 | equipment-blueprint-select | 331.0 [326.3–335.2] | 360.7 [345.6–375.8] |
| foldable-1114x720-dpr2 | equipment-fabricate | 404.1 [402.8–435.6] | 432.1 [412.2–519.1] |
| foldable-1114x720-dpr2 | gunsmith-entry | 338.6 [329.5–341.4] | 370.0 [351.8–371.9] |
| foldable-1114x720-dpr2 | gunsmith-build-switch | 328.1 [326.8–335.0] | 341.4 [341.2–361.7] |
| foldable-1114x720-dpr2 | gunsmith-build-select | 337.8 [333.2–353.3] | 335.2 [313.0–403.4] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | 335.6 [311.8–359.0] | 348.0 [322.4–382.1] |
| foldable-1114x720-dpr2 | warm-equipment-entry | 248.6 [237.2–338.1] | 267.9 [242.9–283.4] |
| foldable-1114x720-dpr2 | warm-gunsmith-entry | 312.5 [299.3–331.5] | 301.2 [297.3–304.2] |
| foldable-1114x720-dpr2 | warm-home-return | 59.7 [55.4–61.1] | 60.0 [57.3–92.6] |
| foldable-1114x720-dpr2 | menu-prepared-game | 1302.2 [1255.1–1321.5] | 1398.7 [1289.2–1466.2] |
| foldable-1114x720-dpr2 | pause | 95.2 [93.4–96.0] | 95.5 [95.3–102.1] |
| foldable-1114x720-dpr2 | resume | 93.6 [90.6–98.4] | 95.1 [90.4–113.8] |
| foldable-1114x720-dpr2 | resize-orientation-return | 681.1 [680.9–727.8] | 713.2 [682.8–733.9] |
| foldable-1114x720-dpr2 | run-result-menu | 320.0 [316.3–321.0] | 363.7 [353.0–377.8] |
| foldable-1114x720-dpr2 | warm-menu-prepared-game | 246.0 [232.7–269.3] | 255.2 [244.4–259.9] |
| foldable-1114x720-dpr2 | warm-run-result-menu | 327.1 [318.9–341.4] | 351.6 [329.6–400.0] |

## Unchanged Gunsmith interaction owner (control)

| Profile | Action | Runtime | Presentation owner | Created | Destroyed | Stable objects | Textures | Owner span |
|---|---|---|---|---|---|---|---|---:|
| desktop-1280x720 | gunsmith-build-switch | baseline | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 60.3 [57.4–68.9] |
| desktop-1280x720 | gunsmith-build-switch | candidate | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 63.9 [57.4–84.3] |
| desktop-1280x720 | gunsmith-build-select | baseline | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 61.8 [60.0–68.7] |
| desktop-1280x720 | gunsmith-build-select | candidate | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 67.7 [61.0–70.1] |
| desktop-1280x720 | gunsmith-part-replace | baseline | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 61.8 [58.5–68.3] |
| desktop-1280x720 | gunsmith-part-replace | candidate | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 59.6 [57.8–63.1] |
| phone-390x844-dpr3 | gunsmith-build-switch | baseline | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 189.2 [188.4–200.4] |
| phone-390x844-dpr3 | gunsmith-build-switch | candidate | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 190.4 [174.4–192.1] |
| phone-390x844-dpr3 | gunsmith-build-select | baseline | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 180.3 [180.2–193.0] |
| phone-390x844-dpr3 | gunsmith-build-select | candidate | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 198.7 [179.6–208.7] |
| phone-390x844-dpr3 | gunsmith-part-replace | baseline | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 180.2 [173.9–219.7] |
| phone-390x844-dpr3 | gunsmith-part-replace | candidate | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 191.9 [181.7–212.4] |
| foldable-1114x720-dpr2 | gunsmith-build-switch | baseline | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 259.7 [256.7–263.5] |
| foldable-1114x720-dpr2 | gunsmith-build-switch | candidate | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 268.5 [263.6–288.2] |
| foldable-1114x720-dpr2 | gunsmith-build-select | baseline | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 262.7 [260.5–276.9] |
| foldable-1114x720-dpr2 | gunsmith-build-select | candidate | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 268.1 [244.2–325.7] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | baseline | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 268.0 [239.9–281.8] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | candidate | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 273.8 [251.0–291.9] |

## Cold hydration ownership

| Profile | Journey | Runtime | Full renders per repeat | Created per repeat | Destroyed per repeat | Stable objects | Textures | Hydration CPU total |
|---|---|---|---|---|---|---|---|---|
| desktop-1280x720 | cold-usable-home | baseline | 3/3/3 | 151/151/151 | 99/99/99 | 52/52/52 | 23/23/23 | 34.1 [23.7–35.4] |
| desktop-1280x720 | cold-usable-home | candidate | 2/2/2 | 99/99/99 | 47/47/47 | 52/52/52 | 23/23/23 | 11.8 [11.7–19.9] |
| desktop-1280x720 | loadout-entry | baseline | 5/5/5 | 378/378/378 | 347/347/347 | 83/83/83 | 47/47/47 | 80.4 [77.3–82.1] |
| desktop-1280x720 | loadout-entry | candidate | 4/4/4 | 302/302/302 | 271/271/271 | 83/83/83 | 47/47/47 | 61.6 [59.1–67.0] |
| phone-390x844-dpr3 | cold-usable-home | baseline | 3/3/3 | 151/151/151 | 99/99/99 | 52/52/52 | 23/23/23 | 86.9 [78.2–115.1] |
| phone-390x844-dpr3 | cold-usable-home | candidate | 2/2/2 | 99/99/99 | 47/47/47 | 52/52/52 | 23/23/23 | 44.8 [42.1–45.6] |
| phone-390x844-dpr3 | loadout-entry | baseline | 5/5/5 | 378/378/378 | 347/347/347 | 83/83/83 | 47/47/47 | 290.0 [251.0–328.8] |
| phone-390x844-dpr3 | loadout-entry | candidate | 4/4/4 | 302/302/302 | 271/271/271 | 83/83/83 | 47/47/47 | 200.6 [197.8–211.1] |
| foldable-1114x720-dpr2 | cold-usable-home | baseline | 3/3/3 | 151/151/151 | 99/99/99 | 52/52/52 | 23/23/23 | 101.0 [98.0–138.0] |
| foldable-1114x720-dpr2 | cold-usable-home | candidate | 2/2/2 | 99/99/99 | 47/47/47 | 52/52/52 | 23/23/23 | 56.9 [56.5–63.6] |
| foldable-1114x720-dpr2 | loadout-entry | baseline | 5/5/5 | 378/378/378 | 347/347/347 | 83/83/83 | 47/47/47 | 332.3 [301.0–382.4] |
| foldable-1114x720-dpr2 | loadout-entry | candidate | 4/4/4 | 302/302/302 | 271/271/271 | 83/83/83 | 47/47/47 | 256.0 [249.4–266.9] |

## Cadence

p50/p95/p99 below are medians of each repeat’s nearest-rank percentile; they are not pooled percentiles.
Count, worst-frame and over-budget ratio retain all three repeats. The budget is 16.67ms.

| Profile | Window | Runtime | Samples | p50 | p95 | p99 | Worst per repeat | Over budget per repeat |
|---|---|---|---|---:|---:|---:|---|---|
| desktop-1280x720 | warm-home | baseline | 34/32/32 | 50.0 | 50.1 | 66.7 | 50.1/66.7/66.7 | 34/34 (100.0%)/32/32 (100.0%)/32/32 (100.0%) |
| desktop-1280x720 | warm-home | candidate | 34/32/33 | 50.0 | 50.1 | 50.1 | 50.1/66.7/50.1 | 34/34 (100.0%)/32/32 (100.0%)/33/33 (100.0%) |
| desktop-1280x720 | light-combat | baseline | 50/48/49 | 66.6 | 66.7 | 66.8 | 66.7/83.2/66.8 | 50/50 (100.0%)/48/48 (100.0%)/49/49 (100.0%) |
| desktop-1280x720 | light-combat | candidate | 51/50/50 | 66.6 | 66.8 | 83.3 | 83.2/83.3/83.3 | 51/51 (100.0%)/50/50 (100.0%)/50/50 (100.0%) |
| desktop-1280x720 | heavy-combat | baseline | 47/46/46 | 66.7 | 66.8 | 83.4 | 83.3/83.4/83.4 | 47/47 (100.0%)/46/46 (100.0%)/46/46 (100.0%) |
| desktop-1280x720 | heavy-combat | candidate | 47/46/44 | 66.7 | 83.4 | 83.4 | 83.4/83.3/83.4 | 47/47 (100.0%)/46/46 (100.0%)/44/44 (100.0%) |
| phone-390x844-dpr3 | warm-home | baseline | 59/63/65 | 16.7 | 33.4 | 33.4 | 33.4/33.4/33.4 | 47/59 (79.7%)/50/63 (79.4%)/49/65 (75.4%) |
| phone-390x844-dpr3 | warm-home | candidate | 63/64/64 | 16.7 | 33.4 | 33.4 | 33.4/33.4/33.4 | 51/63 (81.0%)/57/64 (89.1%)/47/64 (73.4%) |
| phone-390x844-dpr3 | light-combat | baseline | 93/94/94 | 33.3 | 50.0 | 50.1 | 50.1/50.1/66.7 | 89/93 (95.7%)/88/94 (93.6%)/90/94 (95.7%) |
| phone-390x844-dpr3 | light-combat | candidate | 96/94/98 | 33.3 | 33.4 | 50.0 | 50.0/50.0/50.0 | 90/96 (93.8%)/89/94 (94.7%)/90/98 (91.8%) |
| phone-390x844-dpr3 | heavy-combat | baseline | 89/91/89 | 33.3 | 50.0 | 66.6 | 83.3/66.6/66.6 | 87/89 (97.8%)/90/91 (98.9%)/89/89 (100.0%) |
| phone-390x844-dpr3 | heavy-combat | candidate | 89/90/86 | 33.3 | 50.0 | 66.7 | 66.7/66.6/66.7 | 87/89 (97.8%)/89/90 (98.9%)/86/86 (100.0%) |
| foldable-1114x720-dpr2 | warm-home | baseline | 31/32/31 | 50.0 | 66.7 | 66.7 | 66.7/66.7/66.8 | 31/31 (100.0%)/32/32 (100.0%)/31/31 (100.0%) |
| foldable-1114x720-dpr2 | warm-home | candidate | 31/30/31 | 50.0 | 66.7 | 66.7 | 66.8/66.7/66.7 | 31/31 (100.0%)/30/30 (100.0%)/31/31 (100.0%) |
| foldable-1114x720-dpr2 | light-combat | baseline | 46/45/45 | 66.7 | 83.3 | 83.4 | 99.9/83.4/83.4 | 46/46 (100.0%)/45/45 (100.0%)/45/45 (100.0%) |
| foldable-1114x720-dpr2 | light-combat | candidate | 42/43/45 | 66.7 | 83.4 | 100.0 | 100.0/100.1/83.4 | 42/42 (100.0%)/43/43 (100.0%)/45/45 (100.0%) |
| foldable-1114x720-dpr2 | heavy-combat | baseline | 43/42/42 | 66.7 | 83.4 | 100.1 | 99.9/116.8/100.1 | 43/43 (100.0%)/42/42 (100.0%)/42/42 (100.0%) |
| foldable-1114x720-dpr2 | heavy-combat | candidate | 41/39/43 | 66.7 | 83.4 | 116.6 | 116.6/116.7/99.9 | 41/41 (100.0%)/39/39 (100.0%)/43/43 (100.0%) |

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
- Background host load and baseline-first ordering are uncontrolled; timing differences outside cold hydration are not attributed to this implementation.
- Both runtimes use the same strengthened runner: actual Pistol → SMG → Pistol durable switches, then receiver replacement. Earlier reports measured reselection; timings are not compared across that changed method.
- Probe object walks/polling can perturb scheduling. Local owner timing excludes its eligibility guard; whole-action latency includes it.
- Raw frame cadence includes rendering/compositor scheduling. It is distinct from smoothed gameplay delta and does not by itself establish a simulation CPU bottleneck.
- The raw historical baselineSHA field names Phase A; the immediate control is the measurementSHA pinned above.
- No Figma, physical-device, fun, economy or native-packaging acceptance is inferred from these measurements.
