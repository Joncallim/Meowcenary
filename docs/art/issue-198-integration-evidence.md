# Equipment and weapon tier integration — CANDIDATE

PR #205 is reconciled against main `57b47977821ee3290c153cae9e552042885e1539`.
The new art remains CANDIDATE. Technical tests and the following reference
changes do not establish owner approval, canonical art authority or #198 closure.

Native candidate masters, source digests, complete-silhouette import rules and
editable Pixelorama exports are recorded in the Equipment and weapon tier
source directories. The presentation registry resolves all 32 active Equipment
definitions at tiers 1–4; icons and wearables share 128 frames in two existing
physical atlases. Weapons retain their existing tier-specific logical IDs.

## Actual-scale inspection

`assets-src/equipment/tiers/evidence/` contains eight reproducible sheets covering
all 128 exact runtime icon frames at 44px, paired in color and grayscale. The
generator consumes active Equipment IDs and tier bindings, scales the whole
96px cell with nearest-neighbor sampling, and never maximizes individual objects.
The manifest records the exact Equipment binding/resource subset, runtime file
hashes and output hashes. Unrelated art catalog additions do not invalidate it.
The required art gate checks these sheets without repairing checked-in evidence.

The parent and an independent reviewer inspected all eight sheets. Structural
progression remains visible; some glove and helmet changes are less salient
than Armour changes. This is contact-sheet evidence, not a first-time-player
or physical-device verdict. 44px is the current menu slot illustration size;
the bindings' nominal 32px size and future smaller gameplay wearables still
need their own actual-use evaluation. #199 remains a separate dependency.

Weapon color/grayscale evidence at 44px icons and 28px held presentation is in
`assets-src/weapons/tiers/evidence/`. Its subtler small held-weapon differences
remain subject to owner judgment. No rejected candidate is promoted by these
technical checks; a rejection must invalidate the candidate reference.

## Four inspected browser reference changes

The full initial browser matrix on `04fc6d9389ca1f709c3a6dfa01637e5d5288e9dc`
had 57 passes, 59 intentional skips and four screenshot failures. Parent and
independent actual/expected/diff inspection found only these intended changes:

- Phone, foldable and desktop Mercenary: three starting-weapon T1 icons —
  Scrap Tabby and Volt Lynx use Pistol; Bolt Hound uses SMG. Actor art, copy,
  chrome and layout match the preceding references.
- Compact 844×390 Loadout: the stock Scrap Pistol I icon. Slots, geometry,
  focus, scroll clip and fixed Return footer match the preceding reference.

Only those four references changed. The adjacent review manifest records source
SHA, old/candidate digests and each delta. Other Loadout/Equipment, actor,
Gunsmith, gameplay and modal references and all comparison thresholds remain
unchanged. These are technical CANDIDATE regression references, not visual
authority. The complete matrix must rerun because an early Mercenary failure
prevents the same journey from evaluating later captures.

## Integration corrections

The resource closure now includes all always-visible Set emblems, empty slot
illustrations, compatible candidates and selected upgrade-after tier art. The
regression failed against both the stale parent and stale child closure before
passing on the reconciliation.

The Equipment importer's lexical-only path guard allowed escaping symlinks.
`04fc6d9` adds resolved containment. Six real source/output-file/output-directory
cases in export/check mode demonstrated RED, then rejected without external
reads/writes or changes to outside bytes/timestamps. All six art exports remain
byte-identical. Independent adversarial review confirmed the correction.

The fullscreen test previously inferred launch readiness from canvas visibility
and a 500ms delay. A controlled 1500ms native Boot asset delay reproduced lost
launch input. `398b1c4` observes committed Home and an installed real arena before
driving actual Pause/Fullscreen controls, and holds navigation keys through
sampled frames. The owning test passed normally and with the same temporary
delay; no delay fixture, timeout increase or new skip remains. The historical
missing-fullscreen symptom itself was not reproduced, so its exact cause is not
claimed. Fullscreen entered/exited successfully in the initial integrated matrix
and independent production-control diagnostics. Ordinary untagged main smoke
is separate evidence and does not rely on the visual-test seam.

Exact-head final/full post-main results are recorded on #205/#198/#201. Owner
approval, small-scale type/tier judgment, #193 consumption and #199 appearance
remain distinct acceptance items. #191/#167 human gates are not closed here.
