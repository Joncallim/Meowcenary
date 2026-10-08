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

## Hosted browser deadline reconciliation

[Hosted run 37799571553](https://github.com/Joncallim/Meowcenary/actions/runs/37799571553)
on `8239d190d5b5eb4773f15b2cf008cb436753eff1` passed every earlier gate but
finished the browser matrix at **367 passed / 64 scoped skips / 1 failure**.
The unchanged 1920×1080 Gunsmith combined cancellation/failed-save/warm-return
journey exceeded its default 30-second test budget, matching the previously
observed #227 failure. This is a cumulative journey deadline, not a reproduced
persistence or loader assertion failure.

Both hosted screenshots and the saved facts were inspected: the failure message
was presented, Heavy stayed fitted and Compact stayed stored; the timeout
capture had already returned from the failed preview to the current assembled
weapon. The later warm-return assertions were not completed and are not claimed
as passed. No screenshot golden is replaced or promoted by this correction.

Following #220's bounded-journey precedent, preview cancellation now owns one
independent test with the original unchanged-save, semantic-focus and zero-write
assertions. The second test keeps **failed commit → cancel → real Back → warm
return** contiguous, with a fresh copy of the same fixture. A first two-test draft accidentally
introduced a second cold scroll: two-CPU probes measured foldable ready at
5.594s and preview at 26.607s, versus the original second preview's already
revealed position. Real keyboard reveal reduced foldable warm return to
20.895s, but desktop still spent 11.764s on cold preparation and reached failure
assertions at 29.467s before recovery could begin.

The final independent recovery test therefore prepares its actual original
warm checkpoint in a default-budget `beforeAll`, copying every project context
option as the established Upgrade chooser helper does. Preparation performs the
same asserted real launch/resource readiness and keyboard reveal, with no
candidate and zero writes. Its single test performs pointer/touch preview,
failed keyboard commit, screenshot/facts, cancellation, Back and warm re-entry
continuously under the unchanged default test budget. It is independent of the
cold cancellation test and its result. The owned context closes in `afterAll`;
after-failure screenshots remain available. Touch-only scrolling remains in the
cold cancellation journey. No temporary timing logs enter the final test.
Every original assertion, command gesture, failure screenshot and durable
comparison remains; the pre-fault zero-write assertion is additive. Budgets, polling bounds, retries, screenshots, thresholds,
project coverage and scoped skips are unchanged. Full final-head validation is
reported on the PR/issue after it finishes.
