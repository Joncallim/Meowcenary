# Issue #201 — replaced-context achievement acknowledgements

Starting main: `2865e28f46b046b743283b8c1bcf7fc7ef2936a3`.
Owner: [#201](https://github.com/Joncallim/Meowcenary/issues/201#issuecomment-5972644514).
This is a conditional same-realm context-recreation defect, not a demonstrated
ordinary single-context browser production incident.

## Reproduction and smallest boundary

Hold context A's achievement mirror response. Create context B against the same
save, let B acknowledge its retry, then commit new Scrap/settings/stage facts.
Resolving A's old report rewrites A's whole old snapshot over B's durable state.
Both terminal-earned reporting and startup/public outbox retry have this bug.

The final regression file was run unchanged on a detached starting-main checkout:
**9 failed / 6 passed**. The original stale-save cases, replacement without a
write, browser-adapter wrappers, reset/no-extra-write and canonical-publication
checks fail there. Candidate focused result: **15/15 passed**; the three affected
persistence/context files total **94 passing tests**. Raw baseline and candidate
summaries are retained beside this record.

SaveManager now claims an opaque context owner for a backing-store scope/key.
A fresh GameContext revokes earlier asynchronous acknowledgement writers before
load/reconciliation. Two LocalStorageAdapter wrappers over one Storage share
that scope; custom adapters default to their own identity. A guarded commit
reuses the existing synchronous canonical transaction. Both ACK paths share one
helper and remove only the acknowledged ID from the active context's current
snapshot. Failed/rejected commits publish nothing; the durable outbox remains
retryable. Missing IDs cause no write/repaint after reset.

There is no save-schema migration, new durable field, extra ACK storage read,
scene lifecycle coupling, framework change, native adapter or Capacitor addition.
Ordinary synchronous writes and save-failure semantics are unchanged.

## Adversarial coverage and limits

Regressions exercise shared/separate SaveManagers, browser adapter wrappers,
replacement before any new write, newer settings/Scrap/stage/receipt preservation,
out-of-order report success, active-context intervening mutations, failed-write
retry, stale ACK during write failure, synchronous platform throw, asynchronous
rejection, independent keys/stores, reset, and false save success without a
canonical commit. An independent persistence/domain reviewer inspected guard
ordering and both call sites and verified the focused tests.

This is same-process ownership revocation, not cross-tab/process coordination,
asynchronous native durability or a lifecycle suspend implementation. Native
packaging must stop old scene/input consumers and test its actual SDK callbacks.
Direct synchronous commands explicitly invoked on obsolete contexts remain
outside this targeted asynchronous-ACK contract.

Full repository and exact-head hosted acceptance are recorded on the PR/issue;
this initial record does not claim those gates passed before they finish. #201
remains the iterative ledger. Sprite polish and draft #208 are untouched.
