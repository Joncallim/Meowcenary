# Original menu audition: Workbench at dusk

This is an original, editable **audition candidate**, not an accepted production
asset. `productionAccepted` is false. Issue #237 remains open. No runtime key,
catalog entry, map, loader, settings, voice policy or shipped WAV changed.
The stable intended key is `music-menu`; the game still uses its existing
`public/assets/audio/music-menu.wav` placeholder.

`score.json` contains the complete original score, patch settings, authoring
seed and provenance. `export.mjs` renders it using only Node built-ins.
`music-menu.audition.wav` is the local listening candidate. `measurements.json`
records exact source/exporter/output hashes and signal measurements; its decoded
sample-byte figures are **calculations, not browser measurements**.

The score is four 4/4 bars at 80 BPM: A minor, F, C, G/open fifth tonal anchors,
with muted plucks, rounded bass, dry mechanical ticks and sparse tuned-metal
answers. No external samples, existing song, downloaded model, paid service or
third-party license is used. Synthesis noise is deterministically seeded solely
for offline authoring; it never consumes gameplay RNG. Source values are ordinary
editable data, not a runtime music scripting engine.

## Local commands

Use the repository's CI runtime, Node 22. All commands below run from the root
of this worktree. The exporter always resolves adjacent files from its own
location, independent of the current working directory.

```sh
node assets-src/audio/music-menu/export.mjs --check
node assets-src/audio/music-menu/export.mjs --measure
node node_modules/vitest/vitest.mjs run tests/audioSourceExport.test.ts tests/audioAssets.test.ts
```

`--check` regenerates in memory and compares the exact WAV bytes without writing.
`--measure` reports the regenerated candidate's hashes, PCM metrics and calculated
sample-byte sizes without writing. Neither repairs or replaces a file.
`--write` creates exactly `music-menu.audition.wav` adjacent to the exporter only
if that path is absent. It refuses existing files and symlinks, even if the bytes
match. It publishes a fully written same-directory temporary file via atomic
no-clobber hard link, then removes the temporary. There is no output-path or force
flag. For a revision, explicitly preserve/move the old audition first, edit the
score, create the absent candidate with `--write`, and refresh the measurement
record from successful `--measure` output. Review source and output together.

The script requires local filesystem support for same-directory hard links and
`O_NOFOLLOW`; tested here on Linux. It fails rather than falling back to a
non-atomic overwrite on unsupported filesystems. This is atomic file visibility,
not a transaction spanning source, WAV and metadata or a crash-durability claim.

## Bounds and checks

The format is fixed for this candidate: 24,000 Hz, mono, PCM16, 288,000 frames,
12 seconds, 576,044 WAV bytes. Independent Chromium 153.0.8010.12
`OfflineAudioContext.decodeAudioData` measurements on 12 October 2026 confirmed
the exact audition SHA-256
`b3f74e1bdaf16266622c0cdda11f8a34a78c9601337f2990045df1940393bb5e`:

| Context sample rate | Decoded mono frames | Retained sample bytes |
| --- | ---: | ---: |
| 44,100 Hz | 529,200 | 2,116,800 |
| 48,000 Hz | 576,000 | 2,304,000 |
| 96,000 Hz | 1,152,000 | 4,608,000 |

All three decoded buffers were 12 seconds, mono, finite, with RMS approximately
0.0207001. Coordinator evidence: `pr237-browser-decode.json`. The exporter metadata
continues to label its own figures as calculations; these separately measured
values corroborate them. The measurement covers decoded sample payload only,
excluding decoder temporaries, audio nodes and browser memory. It establishes no
global audio/cache budget, HTML5 behavior, audible playback or device acceptance.

Before synthesis the exporter requires exactly the supported schema and validates
finite bounded numbers, one to four patches, one to four partials per patch,
1–128 events, valid envelope lengths and frequencies below Nyquist. Sources are
bounded to 65,536 bytes and read through non-symlink regular-file descriptors.
The mix uses a fixed Float64 accumulation array plus a fixed overlap counter and
PCM buffer; individual notes do not allocate sample arrays. Notes may last up to
0.6 seconds; tails wrap around the loop and count against the maximum of eight
**offline synthesis** voices. This limit says nothing about runtime SFX voices.
The candidate reaches three simultaneous synthesis voices.

Mix samples must be finite and have magnitude at most 0.5 before quantization;
there is no clipping or automatic normalization. The encoded loop boundary must
have an adjacent-sample jump below 0.015, and the 10 ms region on each side must
stay below 0.025 per adjacent sample. These are engineering checks for this
candidate, not perceptual proof. Exact current peak/RMS/DC/edge measurements are
in `measurements.json`. Periodic tails are exercised by a second score fixture;
file/header/signal checks read the actual WAV independently of reported metrics.
Tests also reject invalid inputs, excessive overlap including wrapped tails,
over-peak mixes, output drift, symlink paths and competing writers.

Reproducibility is verified on Node 22 in this environment. Other operating
systems and math implementations are unverified. Hashes identify the exact
candidate; changing source formatting also changes its source hash.

## Acceptance still open

No listening result is claimed. Audition repeated loops, timbre, bass translation,
UI masking and fatigue at consistent playback levels; the candidate has a
substantially lower RMS than the sustained-tone placeholder, so do not infer
perceived loudness from its larger instantaneous peak. Record headphones, mono,
actual phone speakers and device/browser evidence honestly. Automated edge checks
cannot prove a seamless musical transition or good music.

Offline Chromium decoding passed at 44.1/48/96 kHz; actual playback remains
unverified. Runtime mute/volume tails, autoplay refusal, pause, app/tab interruption, stale
loads, Retry, resource limits and destruction remain with the audio/contracts
owners. PR #239 stays a separate held lifecycle candidate; its qualified review
and inherited HTML5 promise-refusal limitation are unchanged.

Independent adversarial source/export review passed for this bounded audition
snapshot, recorded in `pr237-source-independent-review.md`. It verified exact
hashes, sample metrics, focused tests and filesystem failure boundaries without
certifying production or listening acceptance. Before any production replacement,
implement and review production-versus-placeholder ownership checks. The existing
placeholder generator is unchanged and would overwrite a copied runtime WAV.
Do not copy this audition into `public/` or call it production accepted. Production
original run music/SFX, device/listening review, full gates and exact-head CI are
outside this source-only slice. No merge or deployment is authorized here.
