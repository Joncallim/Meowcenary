# Original one-shot audition bank

All 19 effects are editable **audition candidates**, with
`productionAccepted: false`. `bank.json` contains complete original layered
profiles and provenance. `export.mjs` renders them using Node built-ins;
`auditions/` contains 19 mono PCM16 WAVs and exact `measurements.json`.
Stable IDs are read from `src/data/audio-assets.json`; missing, extra, duplicate
or unsafe source keys fail. The exporter does not change the catalog, event map,
loader, settings, game RNG or shipped WAVs. No ambience, ability or threat event
is invented in this source-only package.

The palette is newly authored additive/swept tone and filtered deterministic
noise, without the placeholder generator's profiles, external samples, song
quotes, models, services or third-party sources. Its seed belongs only to offline
authoring. Each cue has a distinct profile rather than a renamed shared WAV:

| Existing key suffix | Intended character |
| --- | --- |
| weapon-fired | Dry general-purpose breech |
| weapon-fired-pistol | Compact brass snap |
| weapon-fired-smg | Shorter, muted bolt |
| weapon-fired-shotgun | Broad low thump and slide |
| projectile-hit | Soft scrap contact |
| projectile-hit-pistol | Single brass fleck |
| projectile-hit-smg | Small dry scatter |
| projectile-hit-shotgun | Low dent with loose grit |
| enemy-killed | Settling rattle |
| player-damaged | Rounded body knock, without alarm |
| drop-collected | Small tuned washer |
| level-up | Three rising tuned bolts |
| weapon-merged | Mechanical latch followed by paired metal |
| card-chosen | Paper flick and warm pluck |
| run-won | Brief ascending pocket cadence |
| run-lost | Quiet descending cadence |
| ui-navigate | Felt selector tick |
| ui-confirm | Double warm detent |
| ui-back | Low reverse detent |

All keys above have the `sfx-` prefix. These are design intentions, not listening
acceptance or proof of distinguishability during dense combat.

From the repository root, using **Node 22**:

```sh
node assets-src/audio/sfx/export.mjs --check
node assets-src/audio/sfx/export.mjs --measure
node node_modules/vitest/vitest.mjs run tests/audioOriginalCandidates.test.ts tests/audioSourceExport.test.ts tests/audioAssets.test.ts --maxWorkers=1 --minWorkers=1
```

`--measure` renders all cues without writing. `--check` requires exact output
inventory, WAV bytes and measurement metadata, including source, exporter and
catalog hashes. It never repairs drift. Inputs are bounded to 65,536 bytes,
opened through non-symlink regular-file descriptors; output checks reject
symlink directories/files, extra outputs and missing completion metadata.
The script resolves its source/catalog paths from its own location, not the
current working directory.

`--write` requires an absent adjacent `auditions/` directory. Every cue is
validated and rendered before the exclusive directory creation elects one
writer. Files use exclusive no-follow creation; metadata is written last.
There is no arbitrary output path, force, overwrite or production-copy mode.
An I/O failure after directory creation may leave an incomplete fresh directory;
the process exits unsuccessfully, emits no success report, and `--check` rejects
the incomplete package. This is not atomic visibility of a multi-file package
or a crash-durability guarantee. Preserve an old candidate elsewhere before an
explicit revision; never delete or overwrite someone else's output to retry.

Each cue is bounded to 0.03–0.6 seconds at 24 kHz mono PCM16, with 1–8 layers and
1–4 partials per layer. The validator rejects nonfinite values, unknown fields,
unsafe frequency/partial combinations, invalid envelopes, and layers extending
beyond the declared tail. Chirp endpoint frequencies and every partial remain
below Nyquist. First and last 48 frames (2 ms) must be zero. Samples must stay
within magnitude 0.5, with absolute DC below 0.005, non-silent peak/RMS and no
clipping or auto-normalization. Maximum offline layer overlap and adjacent-sample
delta are measured; these do not establish runtime voice limits or loudness.

The current candidates total **71,880 frames / 2.995 seconds / 144,596 encoded
WAV bytes**. Maximum peak is approximately 0.17566; maximum absolute DC is
0.000398. Exact per-cue lengths, peaks, RMS, hashes and provenance are recorded
in `auditions/measurements.json`. No package-memory allowance is defined here;
the separate package-budget owner measures the complete menu/run/SFX union.
No decoded browser or native-memory claim follows from these source metrics.

Human review remains necessary for family distinctions, event masking, dense
combat cadence, relative level, short-tail quality, fatigue, mono/headphones,
actual phone speakers, browser/device interruption and muted-play readability.
Audio must remain supplemental. Candidates are not accepted production assets;
there is no public asset adoption, issue closure, merge or deployment here.
