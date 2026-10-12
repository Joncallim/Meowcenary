# #237 — preserve production audio when using the placeholder tool

Starting authority is protected main `4f79d6210c3b028b995d67a5cc6e35318b17b2ee`.
This candidate changes offline tooling and its tests/documentation only. Main,
the public game, all 21 shipped audio files, stable keys, the manifest, synthesis
profiles, runtime loading and AudioManager are unchanged.

## Reproduction and correction

The legacy generator ignores arguments and unconditionally writes every
declared placeholder into `public/assets/audio`. An isolated copied fixture
with an authored `music-menu.wav` demonstrates actual hash replacement through
both the legacy command and `--check`. No reproduction modifies the real game.
The original focused RED result is 15 failed / 2 passed after correcting the
test's argument-table shape; it includes missing read-only/export capabilities,
not fifteen distinct runtime defects.

The default command and `--check` now compare bytes read-only and fail on
missing, differing, symlinked or nonregular assets. Size is checked before
reading content; nonblocking opens reject a FIFO without waiting for a writer.
No default command creates or repairs shipped files.

Explicit `--output FRESH_DIRECTORY` renders and validates the complete frozen
inventory before creating output. It rejects malformed arguments/catalogs,
existing destinations, missing parents, symlinked ancestors and public paths.
It uses exclusive no-follow file creation and flushes writes. Provenance with
`productionAccepted: false` precedes the first WAV; a distinct unaccepted
completion marker follows all successful WAV writes. A failed WAV export has
no completion marker; completion requires a successful command exit and valid
`complete: true` metadata. No force/overwrite/import-to-production switch exists.

Independent source/filesystem review found two cases in the first correction:
a FIFO could block the read-only checker, and a write interruption could leave
partial WAV output without its unaccepted label. Both have separate RED
regressions, then owning-boundary corrections. The tests inject write failure
only into a temporary child process; ordinary game modules are never patched.

## Validation and limits

Focused validation covers the 19 generator cases and all 24 existing exact
placeholder asset assertions. Full repository gates, independent final review
and hosted CI are recorded separately at the final candidate SHA; this document
does not infer their completion from focused tests.

The filesystem contract rejects observed symlinks and never overwrites an
existing destination. It is not a sandbox against another process with the
same privileges moving filesystem ancestors concurrently. FIFO coverage uses
the repository's Linux/Node 22 acceptance environment.

This is the safe-tooling prerequisite for #237, not original-production-format
adoption. The exact 8 kHz shipped-placeholder tests remain intact. Adopting
original audio still needs its authoritative source, export parity, production
format/duration checks, resource/decoded-memory and voice budgets, native audio
lifecycle coverage and actual listening/device acceptance. Held #245 audition
source and #247 lifecycle recovery are separate candidates; neither is merged
here. No #201 runtime defect or issue closure is claimed.
