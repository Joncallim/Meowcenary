# Issue #237 original audio source foundation — audition only

Base: protected main `4f79d6210c3b028b995d67a5cc6e35318b17b2ee`.
Branch: `codex/issue-237-audio-source-foundation`.

This bounded slice adds only new source, exporter, measurements, audition WAV,
focused tests and documentation. No existing file is edited. The main checkout,
production assets, stable catalog/map, runtime, loader, save and gameplay owners
are unchanged. The issue's newer comment of 12 October was reconciled: it records
PR #239's qualified review and remaining gates, without expanding source scope.

The isolated candidate is described in
[`assets-src/audio/music-menu/README.md`](../../assets-src/audio/music-menu/README.md).
It is a 12-second original four-bar menu sketch at 80 BPM, 24 kHz mono PCM16,
with editable JSON score, deterministic Node-built-in synthesis and explicit
`productionAccepted: false`. There are no external samples/services/packages.

Measured on Node v22.23.2: 576,044 bytes; 288,000 frames; peak 0.164093;
RMS 0.020700; DC −0.00001904; seam delta 0.0005188; maximum adjacent delta
within 10 ms either side of the seam 0.0232544; maximum offline synthesis
voices 3. Exact hashes and metrics live alongside the score. These numbers do
not certify listening quality or a runtime voice/cache cap. The exporter's decoded
sizes in metadata remain explicitly calculated. Separate actual Chromium
153.0.8010.12 `OfflineAudioContext.decodeAudioData` measurements of the exact
candidate SHA-256
`b3f74e1bdaf16266622c0cdda11f8a34a78c9601337f2990045df1940393bb5e`
confirmed 529,200 frames / 2,116,800 sample bytes at 44.1 kHz; 576,000 frames /
2,304,000 bytes at 48 kHz; and 1,152,000 frames / 4,608,000 bytes at 96 kHz.
All decoded buffers were mono, 12 seconds, finite, with RMS approximately
0.0207001. External coordinator evidence: `pr237-browser-decode.json`. This is
sample-payload measurement only, excluding decoder/backend overhead and voices;
no audible playback, listening, actual-device or production acceptance is implied.

The exporter has a single adjacent output target, bounded validated input,
non-symlink reads, complete-file atomic publication and no overwrite option.
Tests run it as a real Node subprocess, inspect encoded samples independently,
and exercise negative schema/resource/path cases and concurrent output writers.
The checked WAV and measurement record are exact source-derived artifacts.

Initial RED run before the exporter existed: 22 failures / 4 passes in the initial
26-test suite, recorded externally in `audio237-source-red.log`. These failures
establish the missing implementation, not a regression against shipped gameplay.
A subsequent 26-test source run passed before additional adversarial tests.
Final focused run: 54 tests passed in two files (30 original-source/export tests
and all 24 unchanged runtime-asset conformance tests), recorded externally in
`audio237-source-final-focused.log`; the final read-only exporter check also
passed (`audio237-source-final-check.json`). The independent source/export reviewer also passed
all 54 tests and additional filesystem failure/boundary checks; review verdict
**PASS for the bounded seven-file audition foundation**, recorded externally in
`pr237-source-independent-review.md`. Source/exporter/WAV hashes were independently
verified. The later documentation-only updates record that review and the separate
offline decode evidence above. No full-suite, interactive browser or CI evidence
is claimed here.
The repository TypeScript check passed against the final new test file;
closeout remains the coordinator's responsibility.

Outstanding: independent product/listening review; actual playback;
phone-speaker/mono/muted-play and real-device behavior; production placeholder
separation; bounded runtime resources and HTML5 autoplay refusal; full repository
gates and exact-head CI. PR #239 remains held separately. This source-only commit
does not authorize merge, production export or deployment.
