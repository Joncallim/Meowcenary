# #237: bounded audio authoring payload

Protected implementation baseline:
`4f79d6210c3b028b995d67a5cc6e35318b17b2ee`.
Branch: `codex/issue-237-audio-package-budget`.
This is a held content-validation candidate. It does not change playback,
the catalog, shipped sounds, save state or resource-loader ownership.

## Owning gap and policy

The current game loads four Menu audio keys and another seventeen run keys.
Phaser's game-scoped cache retains their union after run preparation. Existing
catalog validation bounds key counts, but does not reject an arbitrarily large
audio payload. Current placeholders are small; this audit does not reproduce
a memory-pressure incident and does not add a #201 runtime finding.

The authoring policy in `assets-src/audio/package-budget.json` limits the
complete cache-key union to **16 MiB**, and its SFX subset to **2 MiB**, measured
as **96 kHz Float32-equivalent sample payload**. This is an offline content
yardstick, not a literal WebAudio/native/HTML5 memory cap or a quality verdict.
`scripts/content-validate.mjs` invokes the guard before its existing gates.

The guard reads each actual PCM16 WAV header. Its per-key accounting is
`ceil(sourceFrames × 96000 / sourceRate) × channels × 4`, with exact integer
arithmetic. It rejects malformed/unsupported headers and conflicting cache
identities. It accounts for the retained Menu-plus-run union, rather than
allowing each closure an independent 16 MiB allowance. Encoded file bytes are
reported separately. No hand-authored duration or decoded-byte assertion
becomes asset truth.

## Pinned current catalog

The following figures describe the unchanged, committed 8 kHz mono PCM16
placeholders; they are not a final original-audio pack.

| Closure | Keys | Encoded bytes | 96 kHz equivalent bytes |
| --- | ---: | ---: | ---: |
| Menu | 4 | 68,976 | 1,651,200 |
| Run addition | 17 | 112,108 | 2,672,640 |
| Retained union | 21 | 181,084 | 4,323,840 |
| SFX subset | 19 | 52,996 | 1,251,840 |

Two prospective twelve-second mono loops would consume 9,216,000 equivalent
bytes. Together with the full SFX allowance, that is 11,313,152 bytes, below
the union ceiling. This is a production planning envelope, not permission to
adopt the unaccepted #245 audition. The SFX ceiling permits about 5.46 seconds
of mono material in total; intended stinger and ability tails still need a
listening/design check. Future ambience must count within the same full
catalog budget, rather than acquire an exemption.

## Limits and remaining acceptance

- Decoder temporaries, graphs, voices and backend overhead are excluded.
  Actual final assets still require decode measurements at 44.1/48/96 kHz.
  Higher actual context rates can exceed these equivalent byte figures.
- HTML5 stores native media elements; equivalent sample bytes do not measure
  their native memory. No cache eviction or platform-rate preflight is added.
- The voice/retained-handle work in held #253 is separate. Count ceilings do
  not bound decoded buffers; this content guard does not bound live voices.
- Safe read-only file admission is not an adversarial same-user filesystem
  sandbox. Existing supported authoring/runtime format remains PCM16 WAV;
  a future format change requires an explicit parser/policy decision.
- #237 still requires the complete original production pack, editable-source
  and export provenance, independent listening/mono/phone-speaker review,
  real-device interruption/autoplay/latency, and final backend/resource proof.
  No issue, release, deployment or visual acceptance is inferred from this
  guard. Main and public production remain protected.

## Validation

The initial missing-guard regression failed before implementation. Independent
review then reproduced four high-bit-corrupted RIFF tags being admitted by
ASCII decoding. Byte-exact tag comparisons repair that owning boundary; all
four failing cases remain as regressions. The independent external fixture
also changes from four incorrect acceptances to four rejections, with its
valid control preserved. This candidate authoring defect is not a runtime
#201 finding.

Focused checks pass: **15 guard tests plus all 24 unchanged audio-asset
tests**, independently repeated with Node 22 and one worker. The actual content
command is exercised in an isolated temporary root from another working
directory: an over-budget WAV must produce the specific guard error and exit
one, rather than succeed or merely fail at a missing downstream validator.
Independent adversarial review is **PASS for the offline content scope**;
lint/typecheck and diff checks pass.

Exact final-head full gates and hosted CI are recorded at the candidate
checkpoint. Pending checks are not claimed complete by this document.
