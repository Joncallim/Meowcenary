# AI Workflow

## Feature Lifecycle

1. **Opus Supercode: Architecture**
   - Define interfaces and boundaries.
   - Identify state flow.
   - Specify data files and schema changes.
   - Write acceptance criteria.

2. **GPT-5.5: Implementation**
   - Implement only the agreed feature slice.
   - Keep balance data in JSON where possible.
   - Add focused tests for pure rules and data validation.
   - Avoid unrelated refactors.

3. **Review**
   - Check architecture compliance.
   - Check whether scene code stayed thin.
   - Check mobile and desktop assumptions.
   - Identify balance risks.

4. **Playtest**
   - Confirm the mechanic is legible.
   - Confirm it is fun enough to keep.
   - Record tuning follow-ups separately from architecture defects.

## Feature Prompt Template

```text
You are implementing a Meowcenary feature.

Repository: joncallim/Meowcenary
Feature:
Epic:
Goal:

Read:
- README.md
- docs/architecture.md
- docs/ai-workflow.md
- relevant src/data files

Constraints:
- Browser-first Phaser 3 + TypeScript + Vite.
- No ads, paid upgrades, or account requirements.
- Combat should remain low-skill and auto-targeted.
- Prefer data-driven gameplay definitions.
- Keep scene files thin.

Deliver:
- Architecture note if missing.
- Implementation.
- Tests where rules are pure enough to test.
- Manual playtest checklist.
```
