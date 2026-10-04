# Repeated comparison

Immediate baseline runtime: `5c770c59f78c102465177fef680caf81320eef3e`.
Measured candidate runtime: `2ede5cad7a3c24b351c3446aa5ee101b5d1de760`.

All times are milliseconds. Cells show median [minimum–maximum] of three repeats.
These are descriptive results, not performance acceptance thresholds.

## Action latency to the actually presented frame

| Profile | Action | Baseline | Candidate |
|---|---|---:|---:|
| desktop-1280x720 | cold-usable-home | 974.8 [952.8–1049.9] | 1002.5 [968.6–1021.3] |
| desktop-1280x720 | home-contract | 48.6 [46.5–49.9] | 43.7 [42.8–45.5] |
| desktop-1280x720 | home-mercenary | 442.4 [420.1–487.1] | 441.7 [411.8–509.7] |
| desktop-1280x720 | home-career | 8.7 [8.1–9.3] | 9.0 [7.7–12.9] |
| desktop-1280x720 | loadout-entry | 1258.8 [1202.1–1264.3] | 1233.1 [1226.1–1253.7] |
| desktop-1280x720 | equipment-entry | 38.1 [38.0–41.8] | 41.5 [40.1–46.1] |
| desktop-1280x720 | equipment-select | 189.3 [170.1–204.5] | 178.8 [170.8–182.8] |
| desktop-1280x720 | equipment-equip | 201.6 [193.8–219.1] | 205.7 [205.0–206.9] |
| desktop-1280x720 | equipment-blueprint-select | 204.3 [203.5–205.8] | 199.7 [184.4–201.0] |
| desktop-1280x720 | equipment-fabricate | 202.7 [201.7–208.3] | 217.6 [210.9–231.7] |
| desktop-1280x720 | gunsmith-entry | 70.9 [70.8–73.4] | 75.7 [75.6–78.1] |
| desktop-1280x720 | gunsmith-build-switch | 120.3 [117.8–122.4] | 127.5 [115.4–130.5] |
| desktop-1280x720 | gunsmith-build-select | 116.5 [115.3–135.6] | 141.2 [123.3–159.1] |
| desktop-1280x720 | gunsmith-part-replace | 125.6 [125.6–130.7] | 119.1 [118.6–131.1] |
| desktop-1280x720 | warm-equipment-entry | 60.6 [59.8–79.5] | 64.0 [56.9–67.0] |
| desktop-1280x720 | warm-gunsmith-entry | 72.5 [66.4–75.3] | 77.5 [70.8–80.2] |
| desktop-1280x720 | warm-home-return | 14.5 [14.1–17.0] | 15.8 [14.7–18.5] |
| desktop-1280x720 | menu-prepared-game | 863.6 [806.4–871.9] | 843.3 [809.8–852.1] |
| desktop-1280x720 | pause | 68.6 [67.2–72.7] | 69.6 [69.0–71.7] |
| desktop-1280x720 | resume | 82.6 [79.8–83.2] | 79.6 [77.3–85.0] |
| desktop-1280x720 | resize-orientation-return | 693.2 [678.2–699.9] | 684.1 [660.2–692.4] |
| desktop-1280x720 | run-result-menu | 254.6 [227.2–255.3] | 230.1 [228.5–236.6] |
| desktop-1280x720 | warm-menu-prepared-game | 100.7 [99.9–116.0] | 97.9 [96.3–101.0] |
| desktop-1280x720 | warm-run-result-menu | 242.6 [239.6–249.9] | 243.3 [239.9–249.4] |
| phone-390x844-dpr3 | cold-usable-home | 1560.9 [1554.0–1620.0] | 1675.3 [1603.7–1684.6] |
| phone-390x844-dpr3 | home-contract | 133.5 [131.8–150.3] | 142.1 [138.2–166.5] |
| phone-390x844-dpr3 | home-mercenary | 506.2 [501.7–509.2] | 567.0 [513.0–569.5] |
| phone-390x844-dpr3 | home-career | 28.7 [28.7–29.9] | 32.0 [30.0–38.8] |
| phone-390x844-dpr3 | loadout-entry | 1268.1 [1223.4–1328.2] | 1153.3 [1150.5–1184.8] |
| phone-390x844-dpr3 | equipment-entry | 131.6 [122.9–132.6] | 141.5 [140.5–152.7] |
| phone-390x844-dpr3 | equipment-select | 168.7 [168.6–172.4] | 181.1 [181.0–191.8] |
| phone-390x844-dpr3 | equipment-equip | 261.4 [256.0–261.9] | 249.5 [249.3–318.1] |
| phone-390x844-dpr3 | equipment-blueprint-select | 206.6 [206.2–213.7] | 231.5 [220.8–245.6] |
| phone-390x844-dpr3 | equipment-fabricate | 272.8 [272.1–274.8] | 272.4 [272.2–274.1] |
| phone-390x844-dpr3 | gunsmith-entry | 268.0 [237.7–276.3] | 248.8 [248.4–255.7] |
| phone-390x844-dpr3 | gunsmith-build-switch | 233.3 [227.1–243.1] | 237.2 [232.0–273.1] |
| phone-390x844-dpr3 | gunsmith-build-select | 230.6 [228.6–243.4] | 218.3 [215.7–270.6] |
| phone-390x844-dpr3 | gunsmith-part-replace | 246.0 [222.0–257.7] | 213.3 [211.0–222.7] |
| phone-390x844-dpr3 | warm-equipment-entry | 189.4 [182.9–208.2] | 224.5 [187.3–245.0] |
| phone-390x844-dpr3 | warm-gunsmith-entry | 199.2 [196.8–210.9] | 211.0 [206.9–270.1] |
| phone-390x844-dpr3 | warm-home-return | 46.2 [42.4–50.3] | 48.7 [46.6–56.9] |
| phone-390x844-dpr3 | menu-prepared-game | 919.3 [908.5–1035.0] | 958.9 [946.0–970.3] |
| phone-390x844-dpr3 | pause | 56.8 [56.4–62.6] | 59.8 [59.0–60.9] |
| phone-390x844-dpr3 | resume | 46.6 [46.0–48.5] | 51.2 [49.8–51.7] |
| phone-390x844-dpr3 | resize-orientation-return | 579.0 [563.2–587.5] | 571.7 [559.8–587.3] |
| phone-390x844-dpr3 | run-result-menu | 208.0 [205.1–209.7] | 209.0 [195.1–209.0] |
| phone-390x844-dpr3 | warm-menu-prepared-game | 192.5 [191.1–196.1] | 195.9 [195.7–227.0] |
| phone-390x844-dpr3 | warm-run-result-menu | 197.8 [194.3–203.7] | 215.2 [205.5–231.1] |
| foldable-1114x720-dpr2 | cold-usable-home | 1954.5 [1909.8–1962.4] | 1955.7 [1892.0–1975.8] |
| foldable-1114x720-dpr2 | home-contract | 167.2 [161.1–171.0] | 177.9 [163.5–199.2] |
| foldable-1114x720-dpr2 | home-mercenary | 790.1 [765.2–844.8] | 795.4 [775.1–849.4] |
| foldable-1114x720-dpr2 | home-career | 33.5 [32.6–35.6] | 36.5 [33.0–39.4] |
| foldable-1114x720-dpr2 | loadout-entry | 1865.7 [1785.1–1876.6] | 1746.2 [1669.9–1764.9] |
| foldable-1114x720-dpr2 | equipment-entry | 180.7 [168.6–181.4] | 183.8 [169.7–196.0] |
| foldable-1114x720-dpr2 | equipment-select | 255.9 [254.2–278.6] | 297.0 [256.7–302.9] |
| foldable-1114x720-dpr2 | equipment-equip | 387.8 [377.7–432.8] | 429.3 [388.2–442.7] |
| foldable-1114x720-dpr2 | equipment-blueprint-select | 329.1 [321.2–381.7] | 335.2 [321.5–344.7] |
| foldable-1114x720-dpr2 | equipment-fabricate | 400.0 [395.3–417.6] | 398.7 [398.3–403.7] |
| foldable-1114x720-dpr2 | gunsmith-entry | 297.7 [293.5–303.8] | 303.1 [294.7–303.3] |
| foldable-1114x720-dpr2 | gunsmith-build-switch | 339.1 [329.5–340.7] | 329.2 [319.0–344.6] |
| foldable-1114x720-dpr2 | gunsmith-build-select | 325.6 [314.4–374.0] | 351.8 [334.7–361.8] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | 316.3 [310.3–325.9] | 311.8 [303.8–318.2] |
| foldable-1114x720-dpr2 | warm-equipment-entry | 255.0 [250.3–258.8] | 261.1 [253.5–264.7] |
| foldable-1114x720-dpr2 | warm-gunsmith-entry | 295.7 [287.2–302.8] | 301.6 [268.9–344.2] |
| foldable-1114x720-dpr2 | warm-home-return | 58.6 [55.6–62.1] | 58.3 [54.4–58.3] |
| foldable-1114x720-dpr2 | menu-prepared-game | 1345.7 [1342.6–1446.4] | 1327.7 [1323.2–1335.6] |
| foldable-1114x720-dpr2 | pause | 94.8 [93.2–123.2] | 95.8 [95.0–99.4] |
| foldable-1114x720-dpr2 | resume | 93.4 [92.2–93.7] | 93.2 [86.2–103.9] |
| foldable-1114x720-dpr2 | resize-orientation-return | 679.7 [678.8–686.4] | 691.7 [684.7–700.4] |
| foldable-1114x720-dpr2 | run-result-menu | 330.9 [320.4–349.8] | 370.8 [324.6–371.1] |
| foldable-1114x720-dpr2 | warm-menu-prepared-game | 237.7 [233.5–260.0] | 233.5 [222.5–236.2] |
| foldable-1114x720-dpr2 | warm-run-result-menu | 349.8 [338.7–349.8] | 337.4 [333.0–354.9] |

## Unchanged Gunsmith interaction owner (control)

| Profile | Action | Runtime | Presentation owner | Created | Destroyed | Stable objects | Textures | Owner span |
|---|---|---|---|---|---|---|---|---:|
| desktop-1280x720 | gunsmith-build-switch | baseline | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 59.8 [59.0–60.9] |
| desktop-1280x720 | gunsmith-build-switch | candidate | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 63.8 [54.9–67.7] |
| desktop-1280x720 | gunsmith-build-select | baseline | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 57.6 [57.3–70.8] |
| desktop-1280x720 | gunsmith-build-select | candidate | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 71.0 [61.0–84.7] |
| desktop-1280x720 | gunsmith-part-replace | baseline | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 62.6 [59.2–64.3] |
| desktop-1280x720 | gunsmith-part-replace | candidate | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 58.2 [56.2–63.4] |
| phone-390x844-dpr3 | gunsmith-build-switch | baseline | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 191.8 [186.1–192.6] |
| phone-390x844-dpr3 | gunsmith-build-switch | candidate | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 196.1 [181.3–229.3] |
| phone-390x844-dpr3 | gunsmith-build-select | baseline | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 191.3 [187.1–199.4] |
| phone-390x844-dpr3 | gunsmith-build-select | candidate | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 179.7 [169.2–229.7] |
| phone-390x844-dpr3 | gunsmith-part-replace | baseline | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 201.5 [175.4–217.2] |
| phone-390x844-dpr3 | gunsmith-part-replace | candidate | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 171.9 [170.3–176.8] |
| foldable-1114x720-dpr2 | gunsmith-build-switch | baseline | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 263.5 [255.5–264.8] |
| foldable-1114x720-dpr2 | gunsmith-build-switch | candidate | menu.update | 91/91/91 | 86/86/86 | 116/116/116 | 59/59/59 | 251.6 [249.5–273.0] |
| foldable-1114x720-dpr2 | gunsmith-build-select | baseline | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 258.7 [244.9–302.7] |
| foldable-1114x720-dpr2 | gunsmith-build-select | candidate | menu.update | 86/86/86 | 91/91/91 | 111/111/111 | 55/55/55 | 279.0 [259.0–284.3] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | baseline | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 245.5 [237.9–254.6] |
| foldable-1114x720-dpr2 | gunsmith-part-replace | candidate | menu.update | 86/86/86 | 86/86/86 | 111/111/111 | 55/55/55 | 240.9 [233.4–247.5] |

## Cold hydration ownership

| Profile | Journey | Runtime | Full renders per repeat | Art updates per repeat | Created per repeat | Destroyed per repeat | Stable objects | Textures | Hydration CPU total |
|---|---|---|---|---|---|---|---|---|---|
| desktop-1280x720 | cold-usable-home | baseline | 2/2/2 | 0/0/0 | 99/99/99 | 47/47/47 | 52/52/52 | 23/23/23 | 12.6 [12.5–12.8] |
| desktop-1280x720 | cold-usable-home | candidate | 2/2/2 | 0/0/0 | 99/99/99 | 47/47/47 | 52/52/52 | 23/23/23 | 14.1 [13.7–15.9] |
| desktop-1280x720 | loadout-entry | baseline | 4/4/4 | 0/0/0 | 302/302/302 | 271/271/271 | 83/83/83 | 47/47/47 | 67.9 [63.7–68.5] |
| desktop-1280x720 | loadout-entry | candidate | 2/2/2 | 2/2/2 | 155/155/155 | 124/124/124 | 83/83/83 | 47/47/47 | 21.9 [20.6–22.5] |
| phone-390x844-dpr3 | cold-usable-home | baseline | 2/2/2 | 0/0/0 | 99/99/99 | 47/47/47 | 52/52/52 | 23/23/23 | 45.1 [41.4–46.5] |
| phone-390x844-dpr3 | cold-usable-home | candidate | 2/2/2 | 0/0/0 | 99/99/99 | 47/47/47 | 52/52/52 | 23/23/23 | 47.3 [44.4–49.2] |
| phone-390x844-dpr3 | loadout-entry | baseline | 4/4/4 | 0/0/0 | 302/302/302 | 271/271/271 | 83/83/83 | 47/47/47 | 212.9 [205.9–259.1] |
| phone-390x844-dpr3 | loadout-entry | candidate | 2/2/2 | 2/2/2 | 155/155/155 | 124/124/124 | 83/83/83 | 47/47/47 | 70.3 [67.5–89.0] |
| foldable-1114x720-dpr2 | cold-usable-home | baseline | 2/2/2 | 0/0/0 | 99/99/99 | 47/47/47 | 52/52/52 | 23/23/23 | 57.2 [52.8–61.5] |
| foldable-1114x720-dpr2 | cold-usable-home | candidate | 2/2/2 | 0/0/0 | 99/99/99 | 47/47/47 | 52/52/52 | 23/23/23 | 53.8 [51.6–78.8] |
| foldable-1114x720-dpr2 | loadout-entry | baseline | 4/4/4 | 0/0/0 | 302/302/302 | 271/271/271 | 83/83/83 | 47/47/47 | 270.9 [229.1–279.1] |
| foldable-1114x720-dpr2 | loadout-entry | candidate | 2/2/2 | 2/2/2 | 155/155/155 | 124/124/124 | 83/83/83 | 47/47/47 | 82.0 [75.0–82.3] |

## Cadence

p50/p95/p99 below are medians of each repeat’s nearest-rank percentile; they are not pooled percentiles.
Count, worst-frame and over-budget ratio retain all three repeats. The budget is 16.67ms.

| Profile | Window | Runtime | Samples | p50 | p95 | p99 | Worst per repeat | Over budget per repeat |
|---|---|---|---|---:|---:|---:|---|---|
| desktop-1280x720 | warm-home | baseline | 33/32/31 | 50.0 | 50.1 | 50.1 | 50.1/50.1/66.7 | 33/33 (100.0%)/32/32 (100.0%)/31/31 (100.0%) |
| desktop-1280x720 | warm-home | candidate | 34/32/32 | 50.0 | 50.1 | 66.6 | 50.1/66.6/66.6 | 34/34 (100.0%)/32/32 (100.0%)/32/32 (100.0%) |
| desktop-1280x720 | light-combat | baseline | 51/49/49 | 66.6 | 66.7 | 66.8 | 66.8/83.3/66.7 | 51/51 (100.0%)/49/49 (100.0%)/49/49 (100.0%) |
| desktop-1280x720 | light-combat | candidate | 50/49/49 | 66.6 | 66.7 | 66.8 | 83.3/66.8/66.8 | 50/50 (100.0%)/49/49 (100.0%)/49/49 (100.0%) |
| desktop-1280x720 | heavy-combat | baseline | 48/47/47 | 66.7 | 66.8 | 83.3 | 83.3/83.3/66.8 | 48/48 (100.0%)/47/47 (100.0%)/47/47 (100.0%) |
| desktop-1280x720 | heavy-combat | candidate | 46/47/47 | 66.7 | 66.8 | 83.4 | 83.4/83.4/83.4 | 46/46 (100.0%)/47/47 (100.0%)/47/47 (100.0%) |
| phone-390x844-dpr3 | warm-home | baseline | 63/62/64 | 16.7 | 33.4 | 33.4 | 33.4/33.4/33.4 | 49/63 (77.8%)/48/62 (77.4%)/52/64 (81.2%) |
| phone-390x844-dpr3 | warm-home | candidate | 64/62/63 | 16.7 | 33.4 | 33.4 | 33.4/33.4/33.4 | 49/64 (76.6%)/49/62 (79.0%)/48/63 (76.2%) |
| phone-390x844-dpr3 | light-combat | baseline | 96/98/95 | 33.3 | 50.0 | 50.1 | 50.1/50.1/50.1 | 91/96 (94.8%)/92/98 (93.9%)/88/95 (92.6%) |
| phone-390x844-dpr3 | light-combat | candidate | 93/94/94 | 33.3 | 33.4 | 50.0 | 66.6/50.0/50.0 | 87/93 (93.5%)/89/94 (94.7%)/91/94 (96.8%) |
| phone-390x844-dpr3 | heavy-combat | baseline | 90/91/82 | 33.3 | 50.0 | 66.7 | 66.7/66.7/66.6 | 89/90 (98.9%)/88/91 (96.7%)/82/82 (100.0%) |
| phone-390x844-dpr3 | heavy-combat | candidate | 83/90/87 | 33.3 | 50.0 | 66.7 | 66.6/66.7/100.0 | 82/83 (98.8%)/88/90 (97.8%)/86/87 (98.9%) |
| foldable-1114x720-dpr2 | warm-home | baseline | 31/31/31 | 50.0 | 66.7 | 66.7 | 66.7/66.8/66.7 | 31/31 (100.0%)/31/31 (100.0%)/31/31 (100.0%) |
| foldable-1114x720-dpr2 | warm-home | candidate | 31/30/31 | 50.0 | 66.6 | 66.7 | 66.7/66.8/66.7 | 31/31 (100.0%)/30/30 (100.0%)/31/31 (100.0%) |
| foldable-1114x720-dpr2 | light-combat | baseline | 46/46/45 | 66.7 | 83.3 | 83.4 | 83.4/83.4/83.3 | 46/46 (100.0%)/46/46 (100.0%)/45/45 (100.0%) |
| foldable-1114x720-dpr2 | light-combat | candidate | 46/45/45 | 66.7 | 83.4 | 100.0 | 100.0/83.4/100.0 | 46/46 (100.0%)/45/45 (100.0%)/45/45 (100.0%) |
| foldable-1114x720-dpr2 | heavy-combat | baseline | 41/43/42 | 66.7 | 83.4 | 116.7 | 99.9/149.9/116.7 | 41/41 (100.0%)/43/43 (100.0%)/42/42 (100.0%) |
| foldable-1114x720-dpr2 | heavy-combat | candidate | 43/43/43 | 66.7 | 83.4 | 116.7 | 116.7/133.4/100.0 | 43/43 (100.0%)/43/43 (100.0%)/43/43 (100.0%) |

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
- Background host load and baseline-first ordering are uncontrolled; timing differences outside Loadout art hydration are not attributed to this implementation.
- Both runtimes use the same strengthened runner: actual Pistol → SMG → Pistol durable switches, then receiver replacement. Earlier reports measured reselection; timings are not compared across that changed method.
- Probe object walks/polling can perturb scheduling. Local owner timing excludes its eligibility guard; whole-action latency includes it.
- Raw frame cadence includes rendering/compositor scheduling. It is distinct from smoothed gameplay delta and does not by itself establish a simulation CPU bottleneck.
- The raw historical baselineSHA field names Phase A; the immediate control is the measurementSHA pinned above.
- No Figma, physical-device, fun, economy or native-packaging acceptance is inferred from these measurements.
