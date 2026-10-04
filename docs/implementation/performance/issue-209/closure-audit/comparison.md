# Matched performance comparison

Pristine pinned main: `26f46fb5398c7eb769fe1bffa5ed60f80f20eea5`. Instrumented baseline: `ef8d90cfca226c5595598fb74b3f699d0feb3caa`. Candidate runtime: `039534f1bba205d67938f987d2bd085d01c8f263`.

Each timing cell is median [minimum–maximum] milliseconds across three independent matched cohorts per profile. These are presentation-ready latency, not just snapshot/render CPU. Baseline and candidate use the same runner, immutable save fixture, seeded Training/combat conditions, action sequence and window. The observed end-to-end duration including input release/polling is also retained in the raw JSON. Warm Home and combat rows are fixed observation windows, not navigation latency.

## All requested journeys

| Journey | Desktop baseline → candidate | Phone DPR3 CPU4 baseline → candidate | Foldable DPR2 CPU4 baseline → candidate |
| --- | --- | --- | --- |
| cold-usable-home | 1090.2 [1041.4–1098.0] → 1049.8 [1026.3–1050.8] | 1762.2 [1747.3–1787.8] → 1710.7 [1622.7–1727.2] | 2090.5 [2075.7–2116.6] → 2004.2 [1956.2–2011.0] |
| home-contract | 54.8 [53.9–55.1] → 49.8 [48.1–64.1] | 147.4 [132.5–205.2] → 141.3 [136.0–161.1] | 237.7 [211.2–308.8] → 171.2 [171.0–173.7] |
| home-mercenary | 475.9 [473.5–481.0] → 456.1 [429.6–469.3] | 618.1 [601.5–637.3] → 509.2 [507.0–585.9] | 969.9 [967.9–1037.9] → 781.2 [769.4–789.4] |
| home-career | 8.8 [8.7–8.9] → 8.1 [7.9–8.5] | 30.7 [30.5–32.2] → 30.2 [27.9–33.0] | 36.3 [35.8–41.5] → 37.4 [34.0–38.1] |
| loadout-entry | 1276.6 [1269.3–1293.5] → 1223.3 [1218.0–1255.7] | 1237.4 [1195.0–1239.3] → 1102.0 [1063.4–1111.6] | 1891.5 [1881.6–2027.8] → 1658.6 [1639.0–1697.1] |
| equipment-entry | 47.9 [44.7–50.5] → 44.2 [43.3–44.4] | 134.2 [132.4–138.7] → 126.3 [125.7–142.5] | 218.8 [199.7–222.3] → 180.0 [166.5–199.3] |
| equipment-select | 231.9 [210.1–232.9] → 185.0 [170.1–198.3] | 308.6 [301.5–312.1] → 173.1 [172.0–191.2] | 469.0 [453.3–523.4] → 266.5 [258.5–291.3] |
| equipment-equip | 208.0 [205.0–243.2] → 234.8 [215.4–240.1] | 282.8 [263.1–309.5] → 268.2 [252.1–289.1] | 454.8 [401.8–469.9] → 392.9 [376.5–410.1] |
| equipment-blueprint-select | 205.1 [197.6–208.0] → 195.4 [193.0–208.6] | 219.4 [217.9–243.9] → 207.0 [206.2–248.7] | 408.9 [370.6–439.0] → 347.3 [334.1–348.1] |
| equipment-fabricate | 220.0 [207.1–220.8] → 204.1 [197.4–250.6] | 271.4 [266.8–271.9] → 263.4 [262.3–392.2] | 462.0 [436.3–481.1] → 418.4 [395.5–439.9] |
| gunsmith-entry | 90.8 [87.3–119.4] → 73.2 [71.3–79.2] | 261.5 [252.8–273.6] → 240.7 [240.5–296.7] | 414.9 [377.9–432.2] → 305.9 [298.0–332.2] |
| gunsmith-build-switch | 223.5 [213.0–229.9] → 135.8 [122.3–142.3] | 354.0 [327.6–374.0] → 221.6 [220.5–279.9] | 533.6 [504.8–544.4] → 361.3 [322.3–391.4] |
| gunsmith-build-select | 219.4 [218.7–241.5] → 150.9 [119.3–162.6] | 303.3 [280.9–317.7] → 221.9 [207.9–259.4] | 513.5 [498.3–523.4] → 340.7 [328.3–346.3] |
| gunsmith-part-replace | 221.9 [220.6–227.2] → 138.0 [122.0–145.5] | 316.4 [310.0–355.2] → 207.0 [201.6–262.0] | 511.3 [476.1–566.9] → 305.5 [297.8–322.2] |
| warm-equipment-entry | 69.6 [68.5–73.2] → 56.7 [56.3–67.0] | 196.9 [163.4–219.9] → 191.2 [183.1–204.2] | 277.3 [269.5–314.1] → 250.4 [242.7–293.8] |
| warm-gunsmith-entry | 86.2 [81.7–89.1] → 66.5 [63.5–68.1] | 245.9 [228.6–254.2] → 204.3 [189.0–216.5] | 366.8 [348.1–423.0] → 298.0 [290.4–308.4] |
| warm-home-return | 13.8 [12.4–14.7] → 15.8 [15.6–18.1] | 44.2 [44.1–49.2] → 46.9 [45.1–47.3] | 56.8 [56.3–58.9] → 60.2 [55.6–61.4] |
| menu-prepared-game | 1798.8 [1764.0–1855.6] → 848.7 [837.4–872.1] | 3686.7 [3609.2–3687.5] → 971.0 [907.7–1012.6] | 5839.3 [5640.3–6284.5] → 1389.0 [1337.2–1456.3] |
| pause | 73.5 [69.1–74.5] → 69.3 [68.2–79.3] | 63.3 [58.8–67.8] → 63.1 [60.3–85.4] | 96.2 [92.6–101.2] → 99.8 [94.4–109.9] |
| resume | 82.3 [76.8–87.7] → 89.6 [87.6–91.3] | 51.7 [50.4–52.8] → 49.9 [48.1–68.0] | 89.6 [89.1–95.2] → 98.6 [93.4–114.6] |
| resize-orientation-return | 706.5 [693.6–723.5] → 704.3 [685.8–705.9] | 578.4 [571.6–605.0] → 580.2 [562.8–591.3] | 743.3 [697.0–743.4] → 683.9 [680.4–708.5] |
| run-result-menu | 236.1 [223.9–249.7] → 234.1 [233.4–248.6] | 196.5 [191.2–200.9] → 242.6 [222.0–269.5] | 331.2 [327.4–339.5] → 349.7 [327.5–356.3] |
| warm-menu-prepared-game | 115.9 [103.5–118.3] → 100.6 [94.0–101.1] | 239.9 [226.7–252.1] → 187.7 [178.4–233.1] | 273.6 [270.6–282.5] → 272.2 [224.5–282.7] |
| warm-run-result-menu | 239.4 [238.3–241.7] → 249.2 [246.2–268.0] | 212.0 [197.1–216.1] → 206.7 [205.7–215.9] | 353.0 [328.4–373.5] → 325.3 [319.1–334.7] |

## Fresh real Contract launch

This supplement starts a fresh browser/save context and uses real Home Play Contract touch/pointer input without intervening panel warming. Normal menu-generated run seeds are recorded, not overridden. It measures prepared, active GameScene at POST_RENDER; it is separate from deterministic Training launch above. Three independent launches per profile per side.

| Profile | Baseline → candidate ready latency ms | Baseline → candidate full Menu rebuild count during launch |
| --- | --- | --- |
| desktop-1280x720 | 2113.6 [2093.2–2267.6] → 849.1 [833.3–859.9] | [66, 66, 66] → [1, 1, 1] |
| phone-390x844-dpr3 | 4555.8 [4460.1–4784.7] → 1100.7 [1039.1–1117.5] | [66, 66, 66] → [1, 1, 1] |
| foldable-1114x720-dpr2 | 7022.9 [7016.1–7125.2] → 1480.1 [1423.5–1509.7] | [66, 66, 66] → [1, 1, 1] |

## Combat frame distributions

Nearest-rank quantiles are retained per cohort. Below, p50/p95/p99 are the median of the three cohort quantiles (not quantiles pooled from raw frames). N and over-budget counts sum observed samples; worst is the maximum observed in the bounded three-second windows. Raw loop cadence and Phaser smoothed simulation delta are different measurements. Headless scheduling/CPU emulation is not a physical-device frame-rate verdict.

| Profile / scenario / measure | Side | N | p50 ms | p95 ms | p99 ms | Bounded worst ms | >16.667 ms samples / ratio |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| desktop-1280x720 / light-combat / raw loop | baseline | 147 | 66.60 | 66.70 | 83.40 | 83.40 | 147/147 (100.0%) |
| desktop-1280x720 / light-combat / raw loop | final | 150 | 66.60 | 66.70 | 66.80 | 83.30 | 150/150 (100.0%) |
| desktop-1280x720 / light-combat / simulation delta | baseline | 147 | 61.67 | 95.00 | 105.00 | 108.33 | 147/147 (100.0%) |
| desktop-1280x720 / light-combat / simulation delta | final | 150 | 61.66 | 73.33 | 75.00 | 76.67 | 150/150 (100.0%) |
| desktop-1280x720 / light-combat / frame CPU | baseline | 147 | 1.50 | 2.50 | 3.20 | 3.40 | 0/147 (0.0%) |
| desktop-1280x720 / light-combat / frame CPU | final | 150 | 1.60 | 2.80 | 3.90 | 4.00 | 0/150 (0.0%) |
| desktop-1280x720 / light-combat / render CPU | baseline | 147 | 1.00 | 1.70 | 2.20 | 2.30 | 0/147 (0.0%) |
| desktop-1280x720 / light-combat / render CPU | final | 150 | 1.10 | 1.70 | 1.80 | 2.20 | 0/150 (0.0%) |
| desktop-1280x720 / heavy-combat / raw loop | baseline | 140 | 66.70 | 66.80 | 83.40 | 83.40 | 140/140 (100.0%) |
| desktop-1280x720 / heavy-combat / raw loop | final | 138 | 66.70 | 83.40 | 83.40 | 83.40 | 138/138 (100.0%) |
| desktop-1280x720 / heavy-combat / simulation delta | baseline | 140 | 65.00 | 69.99 | 73.34 | 75.00 | 140/140 (100.0%) |
| desktop-1280x720 / heavy-combat / simulation delta | final | 138 | 66.66 | 70.00 | 70.01 | 73.33 | 138/138 (100.0%) |
| desktop-1280x720 / heavy-combat / frame CPU | baseline | 140 | 2.10 | 3.50 | 4.40 | 4.70 | 0/140 (0.0%) |
| desktop-1280x720 / heavy-combat / frame CPU | final | 138 | 1.90 | 3.60 | 5.50 | 5.70 | 0/138 (0.0%) |
| desktop-1280x720 / heavy-combat / render CPU | baseline | 140 | 1.20 | 2.20 | 2.40 | 3.20 | 0/140 (0.0%) |
| desktop-1280x720 / heavy-combat / render CPU | final | 138 | 1.10 | 1.90 | 2.60 | 4.10 | 0/138 (0.0%) |
| phone-390x844-dpr3 / light-combat / raw loop | baseline | 296 | 33.30 | 33.40 | 50.10 | 66.70 | 277/296 (93.6%) |
| phone-390x844-dpr3 / light-combat / raw loop | final | 285 | 33.30 | 49.90 | 50.10 | 66.60 | 265/285 (93.0%) |
| phone-390x844-dpr3 / light-combat / simulation delta | baseline | 296 | 30.00 | 38.33 | 79.99 | 86.67 | 296/296 (100.0%) |
| phone-390x844-dpr3 / light-combat / simulation delta | final | 285 | 31.67 | 41.67 | 56.67 | 63.34 | 285/285 (100.0%) |
| phone-390x844-dpr3 / light-combat / frame CPU | baseline | 296 | 5.10 | 8.30 | 10.00 | 20.10 | 1/296 (0.3%) |
| phone-390x844-dpr3 / light-combat / frame CPU | final | 285 | 5.70 | 9.30 | 24.90 | 36.80 | 3/285 (1.1%) |
| phone-390x844-dpr3 / light-combat / render CPU | baseline | 296 | 3.50 | 5.30 | 7.80 | 16.30 | 0/296 (0.0%) |
| phone-390x844-dpr3 / light-combat / render CPU | final | 285 | 3.80 | 5.50 | 19.30 | 29.40 | 3/285 (1.1%) |
| phone-390x844-dpr3 / heavy-combat / raw loop | baseline | 274 | 33.30 | 50.00 | 66.70 | 66.70 | 264/274 (96.4%) |
| phone-390x844-dpr3 / heavy-combat / raw loop | final | 268 | 33.30 | 50.00 | 66.60 | 66.70 | 265/268 (98.9%) |
| phone-390x844-dpr3 / heavy-combat / simulation delta | baseline | 274 | 33.33 | 38.33 | 40.00 | 41.67 | 274/274 (100.0%) |
| phone-390x844-dpr3 / heavy-combat / simulation delta | final | 268 | 33.34 | 46.66 | 50.00 | 53.34 | 268/268 (100.0%) |
| phone-390x844-dpr3 / heavy-combat / frame CPU | baseline | 274 | 6.90 | 9.80 | 14.60 | 15.00 | 0/274 (0.0%) |
| phone-390x844-dpr3 / heavy-combat / frame CPU | final | 268 | 7.70 | 11.30 | 17.70 | 20.20 | 2/268 (0.7%) |
| phone-390x844-dpr3 / heavy-combat / render CPU | baseline | 274 | 4.20 | 6.00 | 7.80 | 8.80 | 0/274 (0.0%) |
| phone-390x844-dpr3 / heavy-combat / render CPU | final | 268 | 4.70 | 6.70 | 7.90 | 9.20 | 0/268 (0.0%) |
| foldable-1114x720-dpr2 / light-combat / raw loop | baseline | 138 | 66.70 | 83.30 | 83.40 | 83.40 | 138/138 (100.0%) |
| foldable-1114x720-dpr2 / light-combat / raw loop | final | 136 | 66.70 | 83.30 | 100.00 | 116.70 | 136/136 (100.0%) |
| foldable-1114x720-dpr2 / light-combat / simulation delta | baseline | 138 | 66.66 | 104.99 | 128.32 | 131.65 | 138/138 (100.0%) |
| foldable-1114x720-dpr2 / light-combat / simulation delta | final | 136 | 68.33 | 91.67 | 95.00 | 98.34 | 136/136 (100.0%) |
| foldable-1114x720-dpr2 / light-combat / frame CPU | baseline | 138 | 6.00 | 9.30 | 10.90 | 13.20 | 0/138 (0.0%) |
| foldable-1114x720-dpr2 / light-combat / frame CPU | final | 136 | 6.90 | 11.70 | 18.10 | 21.20 | 3/136 (2.2%) |
| foldable-1114x720-dpr2 / light-combat / render CPU | baseline | 138 | 3.80 | 5.20 | 5.80 | 8.00 | 0/138 (0.0%) |
| foldable-1114x720-dpr2 / light-combat / render CPU | final | 136 | 4.40 | 6.90 | 7.80 | 13.60 | 0/136 (0.0%) |
| foldable-1114x720-dpr2 / heavy-combat / raw loop | baseline | 129 | 66.70 | 83.40 | 100.00 | 116.80 | 129/129 (100.0%) |
| foldable-1114x720-dpr2 / heavy-combat / raw loop | final | 127 | 66.70 | 83.40 | 116.60 | 116.70 | 127/127 (100.0%) |
| foldable-1114x720-dpr2 / heavy-combat / simulation delta | baseline | 129 | 70.00 | 73.34 | 75.00 | 75.00 | 129/129 (100.0%) |
| foldable-1114x720-dpr2 / heavy-combat / simulation delta | final | 127 | 71.66 | 78.33 | 80.00 | 81.66 | 127/127 (100.0%) |
| foldable-1114x720-dpr2 / heavy-combat / frame CPU | baseline | 129 | 7.90 | 13.20 | 15.90 | 17.40 | 1/129 (0.8%) |
| foldable-1114x720-dpr2 / heavy-combat / frame CPU | final | 127 | 7.90 | 12.60 | 16.40 | 17.10 | 1/127 (0.8%) |
| foldable-1114x720-dpr2 / heavy-combat / render CPU | baseline | 129 | 4.30 | 6.30 | 7.70 | 8.50 | 0/129 (0.0%) |
| foldable-1114x720-dpr2 / heavy-combat / render CPU | final | 127 | 4.30 | 5.50 | 6.20 | 7.30 | 0/127 (0.0%) |

## Meaningful gameplay owner attribution

Heavy scenario p95: median [min–max] of per-cohort nearest-rank quantiles. Diagnostic measurement resolution/overhead limits interpretation near zero. No per-frame production instrumentation is enabled by this issue.

| Owner | Desktop baseline → candidate p95 ms | Phone baseline → candidate p95 ms | Foldable baseline → candidate p95 ms |
| --- | --- | --- | --- |
| input | 0.1 [0.1–0.2] → 0.1 [0.1–0.1] | 0.8 [0.8–0.9] → 0.8 [0.7–0.8] | 0.8 [0.7–1.0] → 0.7 [0.7–0.8] |
| stage | 0.0 [0.0–0.0] → 0.0 [0.0–0.1] | 0.1 [0.1–0.1] → 0.0 [0.0–0.0] | 0.0 [0.0–0.0] → 0.0 [0.0–0.0] |
| player | 0.1 [0.1–0.1] → 0.1 [0.1–0.1] | 0.4 [0.3–0.6] → 0.5 [0.4–0.6] | 0.3 [0.1–0.4] → 0.6 [0.5–0.7] |
| spawning | 0.6 [0.6–0.7] → 0.6 [0.6–0.9] | 2.2 [1.6–2.3] → 2.0 [2.0–2.3] | 2.5 [2.3–3.7] → 2.9 [2.5–3.2] |
| passives | 0.0 [0.0–0.0] → 0.0 [0.0–0.0] | 0.0 [0.0–0.0] → 0.0 [0.0–0.0] | 0.0 [0.0–0.0] → 0.0 [0.0–0.0] |
| hazards | 0.0 [0.0–0.0] → 0.0 [0.0–0.0] | 0.0 [0.0–0.0] → 0.0 [0.0–0.0] | 0.0 [0.0–0.0] → 0.0 [0.0–0.1] |
| weapons | 0.1 [0.1–0.1] → 0.1 [0.1–0.1] | 0.5 [0.3–0.5] → 0.4 [0.1–0.5] | 0.7 [0.1–0.9] → 0.6 [0.6–0.6] |
| drops | 0.0 [0.0–0.0] → 0.0 [0.0–0.1] | 0.0 [0.0–0.1] → 0.0 [0.0–0.1] | 0.0 [0.0–0.1] → 0.1 [0.0–0.1] |
| feedback | 0.1 [0.1–0.1] → 0.1 [0.1–0.1] | 0.1 [0.1–0.3] → 0.6 [0.1–0.7] | 0.2 [0.1–0.7] → 0.4 [0.1–0.5] |
| hud | 0.3 [0.3–0.4] → 0.4 [0.4–0.5] | 0.7 [0.7–0.8] → 0.9 [0.9–0.9] | 1.1 [0.8–1.3] → 2.0 [1.2–2.0] |
| audio | 0.0 [0.0–0.0] → 0.0 [0.0–0.0] | 0.0 [0.0–0.0] → 0.0 [0.0–0.0] | 0.0 [0.0–0.1] → 0.0 [0.0–0.0] |

## Stable Menu objects, textures and local churn

Cells are median created/destroyed object counts; stable final object/texture counts follow in parentheses. Created/destroyed include all measured full renders and local updates during each action, including cold art hydration. These are bounded deterministic diagnostics rather than wall-clock CI thresholds. Ordinary production builds do not expose these seams.

| Journey | Desktop baseline → candidate | Phone baseline → candidate | Foldable baseline → candidate |
| --- | --- | --- | --- |
| cold-usable-home | 151/99 (O52/T23; R3/U0) → 99/47 (O52/T23; R2/U0) | 151/99 (O52/T23; R3/U0) → 99/47 (O52/T23; R2/U0) | 151/99 (O52/T23; R3/U0) → 99/47 (O52/T23; R2/U0) |
| warm-home | 0/0 (O52/T23; R0/U0) → 0/0 (O52/T23; R0/U0) | 0/0 (O52/T23; R0/U0) → 0/0 (O52/T23; R0/U0) | 0/0 (O52/T23; R0/U0) → 0/0 (O52/T23; R0/U0) |
| loadout-entry | 373/343 (O82/T47; R5/U0) → 155/124 (O83/T47; R2/U2) | 373/343 (O82/T47; R5/U0) → 155/124 (O83/T47; R2/U2) | 373/343 (O82/T47; R5/U0) → 155/124 (O83/T47; R2/U2) |
| equipment-entry | 95/52 (O95/T45; R1/U0) → 96/52 (O96/T45; R1/U0) | 95/52 (O95/T45; R1/U0) → 96/52 (O96/T45; R1/U0) | 95/52 (O95/T45; R1/U0) → 96/52 (O96/T45; R1/U0) |
| equipment-select | 117/95 (O117/T57; R1/U0) → 41/19 (O118/T57; R0/U1) | 117/95 (O117/T57; R1/U0) → 41/19 (O118/T57; R0/U1) | 117/95 (O117/T57; R1/U0) → 41/19 (O118/T57; R0/U1) |
| equipment-equip | 115/117 (O115/T55; R1/U0) → 116/118 (O116/T55; R1/U0) | 115/117 (O115/T55; R1/U0) → 116/118 (O116/T55; R1/U0) | 115/117 (O115/T55; R1/U0) → 116/118 (O116/T55; R1/U0) |
| equipment-blueprint-select | 102/115 (O102/T48; R1/U0) → 103/116 (O103/T48; R1/U0) | 102/115 (O102/T48; R1/U0) → 103/116 (O103/T48; R1/U0) | 102/115 (O102/T48; R1/U0) → 103/116 (O103/T48; R1/U0) |
| equipment-fabricate | 114/102 (O114/T55; R1/U0) → 115/103 (O115/T55; R1/U0) | 114/102 (O114/T55; R1/U0) → 115/103 (O115/T55; R1/U0) | 114/102 (O114/T55; R1/U0) → 115/103 (O115/T55; R1/U0) |
| gunsmith-entry | 110/52 (O110/T55; R1/U0) → 111/52 (O111/T55; R1/U0) | 110/52 (O110/T55; R1/U0) → 111/52 (O111/T55; R1/U0) | 110/52 (O110/T55; R1/U0) → 111/52 (O111/T55; R1/U0) |
| gunsmith-build-switch | 115/110 (O115/T59; R1/U0) → 91/86 (O116/T59; R0/U1) | 115/110 (O115/T59; R1/U0) → 91/86 (O116/T59; R0/U1) | 115/110 (O115/T59; R1/U0) → 91/86 (O116/T59; R0/U1) |
| gunsmith-build-select | 110/115 (O110/T55; R1/U0) → 86/91 (O111/T55; R0/U1) | 110/115 (O110/T55; R1/U0) → 86/91 (O111/T55; R0/U1) | 110/115 (O110/T55; R1/U0) → 86/91 (O111/T55; R0/U1) |
| gunsmith-part-replace | 110/110 (O110/T55; R1/U0) → 86/86 (O111/T55; R0/U1) | 110/110 (O110/T55; R1/U0) → 86/86 (O111/T55; R0/U1) | 110/110 (O110/T55; R1/U0) → 86/86 (O111/T55; R0/U1) |
| warm-equipment-entry | 114/110 (O114/T55; R1/U0) → 115/111 (O115/T55; R1/U0) | 114/110 (O114/T55; R1/U0) → 115/111 (O115/T55; R1/U0) | 114/110 (O114/T55; R1/U0) → 115/111 (O115/T55; R1/U0) |
| warm-gunsmith-entry | 110/114 (O110/T55; R1/U0) → 111/115 (O111/T55; R1/U0) | 110/114 (O110/T55; R1/U0) → 111/115 (O111/T55; R1/U0) | 110/114 (O110/T55; R1/U0) → 111/115 (O111/T55; R1/U0) |
| warm-home-return | 52/110 (O52/T33; R1/U0) → 52/111 (O52/T33; R1/U0) | 52/110 (O52/T33; R1/U0) → 52/111 (O52/T33; R1/U0) | 52/110 (O52/T33; R1/U0) → 52/111 (O52/T33; R1/U0) |
| warm-run-result-menu | 52/0 (O52/T93; R1/U0) → 52/0 (O52/T93; R1/U0) | 52/0 (O52/T93; R1/U0) → 52/0 (O52/T93; R1/U0) | 52/0 (O52/T93; R1/U0) → 52/0 (O52/T93; R1/U0) |

## Boot owner durations and warm Home CPU

Owner timing cells are median [min–max] ms for the same three cold contexts per profile. Audio, visual and font barriers can overlap; adding their durations would double-count cold time. Four Nunito weights remain required before Phaser text creation. Warm Home is a fixed 1.5-second observation window; its idle frame CPU and zero action churn are the responsiveness evidence, not a fabricated 1.5-second entry time.

| Owner / action | Desktop baseline → candidate | Phone baseline → candidate | Foldable baseline → candidate |
| --- | --- | --- | --- |
| boot.audio / cold-usable-home | 70.7 [64.1–90.2] → 53.8 [51.6–54.4] | 151.7 [147.6–166.8] → 104.0 [103.1–111.1] | 178.3 [173.2–183.1] → 127.1 [126.5–134.3] |
| boot.visual / cold-usable-home | 109.5 [92.7–125.0] → 83.3 [81.6–85.9] | 279.5 [255.8–306.4] → 214.4 [208.5–229.7] | 297.1 [284.5–306.1] → 240.3 [237.5–265.9] |
| boot.fonts / cold-usable-home | 10.9 [10.6–11.4] → 11.7 [11.2–12.4] | 45.1 [44.8–50.6] → 49.0 [48.9–49.4] | 48.2 [48.1–50.7] → 49.0 [47.8–52.1] |
| frame.cpu / warm-home | 0.5 [0.4–0.5] → 0.5 [0.5–0.5] | 1.8 [1.6–1.9] → 1.8 [1.8–1.8] | 1.9 [1.9–2.2] → 2.3 [2.2–2.6] |
