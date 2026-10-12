# Issue 237: original run music and one-shot auditions

This held source candidate extends PR #245 at
`af9aa832ffc9cf5451f913a5dab2587d3a733052`; it does not adopt production audio.
Protected main and production remain `4f79d6210c3b028b995d67a5cc6e35318b17b2ee`.
Every source declares `productionAccepted: false`. No merge or deployment is
authorised. The five existing menu-source files remain byte-identical.

## Delivered boundary

The new editable run score has 99 events, six 4/4 bars at 120 BPM and a fixed
12-second, 24 kHz mono PCM16 export. The separate editable one-shot bank covers
exactly the existing 19 SFX keys. Each has a distinct original layered profile.
The two dedicated offline exporters use Node built-ins and authoring seeds;
there are no downloaded samples, paid services, new licenses or game RNG draws.

Production catalogs, event maps, shipped WAVs, scenes, saves, loader and gameplay
remain unchanged. This package introduces no ability/threat/ambience events.
Those product cues still require their owners' authoritative facts and review;
covering the existing key set does not complete every sound requested by #237.

Source/export commands and failure semantics are documented next to each source:

```sh
node assets-src/audio/music-run/export.mjs --check
node assets-src/audio/sfx/export.mjs --check
node node_modules/vitest/vitest.mjs run tests/audioOriginalCandidates.test.ts tests/audioSourceExport.test.ts tests/audioAssets.test.ts --maxWorkers=1 --minWorkers=1
```

Run `--check` verifies the source-derived WAV; its measurement sidecar is checked
by the focused suite. SFX `--check` also checks its completion metadata. Writes
are fresh-output only. The run renderer publishes via a no-clobber hard link;
the SFX renderer validates/renders before exclusive directory creation, then
writes completion metadata last. An interrupted SFX publication may leave a
partial directory that fails checking. Neither claims a multi-file transaction
or confinement against hostile replacement of trusted parent directories.

## Measured source evidence

| Audition resources | Encoded bytes | 96 kHz Float32-equivalent bytes |
| --- | ---: | ---: |
| Menu closure: menu loop + three UI SFX | 589,136 | 4,711,680 |
| Run closure: run loop + sixteen SFX | 707,548 | 5,654,400 |
| Retained union: 21 distinct keys | 1,296,684 | 10,366,080 |
| All nineteen SFX | 144,596 | 1,150,080 |

The actual audition WAVs were copied into an isolated evidence root using the
unchanged catalog's filenames, then inspected through PR #254's single policy
and parser at `6eebd2d8a072ea010f2310397177192a54d12a83`. They fit its 16 MiB
union / 2 MiB SFX authoring allowances. This is an explicit 96 kHz Float32
yardstick, not measured native/WebAudio/HTML5 memory. No parallel budget is added
to these sources. Decoder, graph and backend overhead are excluded.

The existing shipped placeholder union is 181,084 encoded bytes / 4,323,840
equivalent bytes. These longer auditions increase transfer to about 7.16 times
that size; no loading improvement or format-change benefit is claimed. The two
loops contribute 24 seconds; all SFX together contribute 2.995 seconds.

Run peak/RMS are approximately 0.12311/0.02082; the sample seam delta is 0.001373,
the maximum adjacent delta near the seam is 0.004669, and the maximum offline
voice overlap is four. SFX maximum peak is 0.17566 and absolute DC 0.000398;
their first/last 2 ms are zero. Exact source/exporter/WAV hashes and per-cue
measurements accompany the editable files. These signal measurements do not
prove musical phrasing, distinguishability, fatigue or pleasant listening.

## Validation and outstanding acceptance

The initial missing-source implementation had 27 RED checks. The final focused
suite passes 87 tests across three files: 33 new candidate checks, 30 existing
menu-source checks and all 24 unchanged placeholder-asset checks. Independent
Astra source/security review reproduced all 20 new WAV measurements and passed
publication-race, injected partial-I/O failure, FIFO refusal and source-reorder
probes. All 29 new file hashes and the five unchanged menu hashes were verified.

Full exact-head local and hosted gates, actual browser decoding of the completed
21-resource audition union, and production-backend integration remain pending
at this checkpoint. They must be recorded before engineering-ready status.

Listening remains unverified: repeated loops, menu/run contrast, family cues,
dense combat masking/cadence/fatigue, mono/headphones/phone speakers and muted
readability. Real-device unlock, pause/background/Retry/endings, active-tail
volume/mute, interruption, latency and looping still require integrated evidence
and product acceptance. The independent review approves source/export
correctness only. No public asset has been adopted and #237 remains open.

Runtime lifecycle recovery (#239/#247), generator safety (#252), voice/handle
admission (#253) and the package guard (#254) remain separate held candidates.
This source package does not certify or supersede their acceptance.
