# R3 / Issue #237 continuation ledger — 2026-10-17

This records an engineering checkpoint only. It does not approve, adopt, merge,
deploy, or close the original-audio work.

## Reconciled scope

- Review branch: `r3-issue-237-audio-review`, based on remote `main`
  `08b28a33d2994f1c9131e9537c21d9f6680dac00`.
- The editable run score, one-shot bank, measurement sidecars, and exporters
  remain the held candidate described by `issue-237-original-auditions-20261013.md`.
- Candidate metadata still declares `productionAccepted: false`; the public
  21-key placeholder catalog, runtime audio map, loader, scenes, saves, and
  gameplay bindings were not changed.

## Exact bounded checks

Pinned Node `22.23.3`, one worker:

```text
node assets-src/audio/music-run/export.mjs --check
node assets-src/audio/sfx/export.mjs --check
node node_modules/vitest/vitest.mjs run \
  tests/audioOriginalCandidates.test.ts tests/audioSourceExport.test.ts \
  tests/audioAssets.test.ts tests/audioPackageBudget.test.ts \
  tests/audioManager.test.ts tests/audioPhaserLifecycle.test.ts \
  tests/audioResources.test.ts tests/gameSceneAudio.test.ts \
  --maxWorkers=1 --minWorkers=1 --reporter=dot
```

Both exporter checks passed. The focused suite passed `254/254` tests across
eight files on this branch. The candidate measurements remain offline source
evidence; they are not browser decode, backend, listening, or device evidence.

The exact branch lint and production build also passed on Node `22.23.3`. With
the repository-pinned setup (`Pillow 12.1.1`, `CairoSVG 2.9.1`, Node
`22.23.3`, and system Chromium), the full local suite passed `235` files and
`4,078/4,078` tests, including the audio files above. The earlier two art
failures were reproduced on the unchanged baseline with the container's
default Pillow `12.3.0` and disappear under the pinned Pillow; the broader
gun-art gate remains separately unable to invoke its required `lua` executable
in this cloud image. No audio/runtime source was changed to accommodate either
setup issue.

## Open acceptance gates

- Owner listening approval remains open for repeated loops, menu/run contrast,
  cue identity, dense-combat masking/cadence/fatigue, mono, headphones, and
  phone speakers.
- Runtime adoption remains blocked pending approved production sources, stable
  IDs/provenance, full relevant Ability/hazard/threat/progression cues, actual
  browser decode/resource closure, and production-backend integration.
- Real-device unlock, mute/fade/volume, interruption, background/return,
  Retry/endings, latency, and loop behavior remain unverified.
- Full exact-head and hosted CI results for this separate review branch remain
  pending. GitHub Actions status queries from this cloud session return
  `403 Forbidden`; remote ref presence is not CI completion.

No merge, deploy, issue closure, or production-audio cutover is authorized by
this ledger.
