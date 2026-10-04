# Supplemental phone variance check

The primary three-pair phone capture had light raw p95 33.4 → 49.9 ms. Rather than declare a regression or discard those samples, three additional same-runner/fixture/window pairs were captured serially and counterbalanced. Sources remain EF8 and 039534f. No browser errors, assertion changes or new runtime code. This supplement remains separate from the primary comparison.

| Scenario / measure | Baseline three individual values | Candidate three individual values |
| --- | --- | --- |
| light-combat / raw loop p50Ms ms | 33.3, 33.3, 33.3 | 33.3, 33.3, 33.3 |
| light-combat / raw loop p95Ms ms | 33.4, 33.4, 33.5 | 33.4, 33.5, 33.4 |
| light-combat / raw loop p99Ms ms | 50.0, 50.1, 50.0 | 50.0, 50.0, 50.0 |
| light-combat / frame CPU p95Ms ms | 8.1, 9.5, 9.0 | 8.3, 8.5, 8.5 |
| light-combat / frame CPU p99Ms ms | 19.8, 19.9, 12.3 | 14.4, 23.5, 19.8 |
| heavy-combat / raw loop p50Ms ms | 33.3, 33.3, 33.3 | 33.3, 33.3, 33.3 |
| heavy-combat / raw loop p95Ms ms | 50.0, 33.5, 50.0 | 33.4, 50.0, 50.0 |
| heavy-combat / raw loop p99Ms ms | 83.4, 66.6, 83.3 | 66.6, 66.7, 66.7 |
| heavy-combat / frame CPU p95Ms ms | 9.3, 9.6, 9.2 | 9.8, 11.5, 10.3 |
| heavy-combat / frame CPU p99Ms ms | 17.6, 14.4, 14.4 | 14.3, 15.0, 19.8 |

Supplementary light raw p95 returned to approximately 33.4 ms on both sides. The pooled six-cohort phone median of per-cohort p95 is therefore33.4 ms for both, with candidate per-cohort p95 ranging 33.4–50.0 ms. That characterizes a quantized tail excursion; it does not erase the primary slower samples or prove universal non-regression. Heavy p95 also moves between approximately 33.4 and50 ms without a runtime change. Frame CPU tails remain noisier than their central tendency.

The existing post-#221 1f30 capture also had phone light raw p95 around 33.4 ms in three repetitions and identical current gameplay/runtime owners. Combined evidence does not reproduce a persistent #209-owned gameplay bottleneck and does not justify speculative combat optimization. Adjacent camera/actor/HUD changes and unverified headless renderer/GPU/scheduling remain confounders. Physical-device peak and responsiveness acceptance remains open.
