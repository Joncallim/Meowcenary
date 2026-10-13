# Original run audition: Bolts on the move

This is an editable **audition candidate**, with `productionAccepted: false`.
The intended stable key is `music-run`. Nothing is copied into `public/`;
the game continues to use its existing placeholder. The existing menu audition
and its dedicated exporter are unchanged.

`score.json` contains the entire original score, patches, provenance and offline
seed. `export.mjs` is a dedicated sibling of the menu renderer, fixed to six
4/4 bars at 120 BPM: 12 seconds, 24 kHz mono PCM16. It deliberately keeps the
reviewed bounded renderer small instead of introducing a shared runtime music
engine. The 99 events combine short syncopated plucks, rounded bass, alternating
mechanical ticks and three tuned-metal answers. E minor, C, G, D, A minor and
B tonal anchors give the run a different pulse and phrase from the menu sketch.
This is a compositional intention, not an accepted listening result.

No samples, quotations from existing songs, downloaded models, external services
or third-party sources are used. Deterministic synthesis noise uses an authoring
seed only; it does not touch gameplay RNG. The existing synthesis algorithm is
reused, while the score, rhythms, patches and candidate audio are newly authored.

From the repository root, using the CI runtime **Node 22**:

```sh
node assets-src/audio/music-run/export.mjs --check
node assets-src/audio/music-run/export.mjs --measure
node node_modules/vitest/vitest.mjs run tests/audioOriginalCandidates.test.ts tests/audioSourceExport.test.ts tests/audioAssets.test.ts --maxWorkers=1 --minWorkers=1
```

The exporter resolves its own adjacent files independently of the caller's
working directory. `--measure` renders and reports without writes. `--check`
compares exact source-derived WAV bytes without repairing anything. `--write`
creates only an absent `music-run.audition.wav`, using a complete same-directory
temporary file and atomic no-clobber hard link. There is no path/force override.
To revise, first explicitly preserve the previous candidate outside its output
path, then regenerate and update `measurements.json` from successful output.
Source and output reads require bounded non-symlink regular files. Linux
`O_NOFOLLOW` and same-filesystem hard links are required; unsupported filesystems
fail rather than overwrite. Publication is not a source/WAV/metadata transaction
or crash-durability guarantee.

The fixed renderer validates all JSON fields, finite values, 1–128 events,
1–4 patches/partials, MIDI pitch bounds, envelopes and sub-Nyquist partials.
It rejects more than eight simultaneous synthesis voices, including periodic
tails, and any sample exceeding magnitude 0.5. There is no clipping or automatic
normalization. Rounded frames are shared by synthesis and overlap checks.
Loop-boundary sample delta must be below 0.015, and adjacent deltas in the
10 ms edge regions below 0.025. These numerical guards do not prove musical
continuity or an acceptable mix.

The checked candidate has 288,000 frames / 576,044 WAV bytes. Exact hashes and
measurements are in `measurements.json`: peak approximately 0.12311, RMS 0.02082,
seam delta 0.001373, edge delta 0.004669 and at most four synthesis voices.
5,400 synthesized tail frames wrap into the next loop; first/last 10 ms RMS
measurements are included. These are offline signal measurements; calculated
decoded sample-byte figures are explicitly not browser-memory measurements.
The separate package-budget owner checks the completed asset union.

Original source/export correctness, listening quality and production adoption
remain distinct gates. Repeated-loop listening, contrast with the menu, masking,
fatigue, headphones, mono/phone speakers, actual browser/device interruption and
latency are unverified here. No production acceptance, issue closure, merge or
deployment is claimed. The placeholder generator must not be run against an
adopted production original; production ownership and format migration remain
with the coordinator.
