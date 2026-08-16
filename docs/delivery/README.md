# Delivery Records

This directory is for concise durable delivery evidence when an implementation needs a repository record beyond its pull-request body and hosted checks.

## Purpose

Permanent architecture documents should explain decisions, contracts, ownership, implementation slices, compatibility rules, acceptance criteria, and reviewer traps. They should not grow indefinitely by embedding full CI logs, repeated test counts, browser transcripts, or every manual observation from one delivery.

Use the following source order:

1. dedicated architecture document — durable design/implementation contract;
2. pull request — current delivery scope, checklist, review discussion, and merge gate;
3. hosted CI/checks — authoritative automated run evidence;
4. `docs/delivery/<epic-or-pr>.md` — only when a concise durable manual/delivery record is useful after the PR closes.

## What belongs in a delivery record

Keep it compact:

- epic / issue / PR references;
- final commit/merge reference where useful;
- which architecture document governed the work;
- automated validation commands and final status;
- important manual/browser/device rows that cannot be recovered from CI;
- accepted limitations/deferred follow-ups;
- final ready/not-ready decision.

Do not copy large raw logs. Link the PR/check where possible.

## Alpha 3 rule

Epics 20–26 inherit shared cross-cutting rules from:

- `docs/architecture/alpha-3-content-extensibility-contract.md`
- `docs/architecture/alpha-3-shared-foundation.md`

Their future architecture documents should not restate those contracts unless they deliberately supersede or document a justified exception.