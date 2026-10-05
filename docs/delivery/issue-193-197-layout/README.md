# Equipment and Gunsmith layout checkpoint

Starting implementation: `8eb45a7b4ce16475fca87e70779e84cc0effed77`.
This finishes the layout tranche requested under #197/#193. Exact candidate,
merged-main validation and deployment identities are recorded on its PR and
owning issues. Product-owner and real-device acceptance remain separate gates.

## Authority and boundaries

Figma file `LHpXaKqFKksfF2uismDws5` was traversed by page, including Menu
Screens—Premium (`28:2`), UI Chrome—Premium (`27:2`), Gunsmith—Premium (`53:2`),
Gameplay UI (`50:2`) and the art-first Loadout amendment (`129:2`).

The shared amendment [146:102](https://www.figma.com/design/LHpXaKqFKksfF2uismDws5/Meowcenary?node-id=146-102)
requires preserving integrated equip/replace/Workshop semantics while increasing
**visible artwork**, rather than transparent image canvas size. Reference frames:

| Family | Figma references | Runtime ownership |
| --- | --- | --- |
| Compact Loadout overview | `104:206`, within Complete Screen Set | Existing four inline slots, Equipment/Gunsmith routers, readiness and fixed return action |
| Equipment overview | `129:10`, `134:66`, `130:22` | Four canonical slots; two phone/tablet columns; four foldable/desktop columns |
| Equipment inspection/upgrade | `129:29`, `131:42`, `143:189`, `143:82` | Authoritative piece, cost, state, Set/scope and full before/after consequence |
| Equipment failures | `144:102`, `144:123`, `144:144` | Actual tier lock, funds deficit and unchanged publication after save failure |
| Gunsmith | `130:76`, `145:102`, `130:94`, `131:102`, `131:119`, `53:8`, `54:3`, `54:76`, `57:3` | Separate Build/Workshop/Parts; current/candidate assembled weapon; compatible slot candidates and explicit commit |

No runtime sprites were regenerated, no second tier registry was added, and no
balance, RNG, gameplay, save schema or transaction semantics changed. Existing
editable art sources, exports and logical/physical bindings remain authoritative.
Screenshot baselines describe this implementation candidate; they do not grant
human approval or promote rejected artwork to canonical authority.

## Corrected behavior and evidence

At the pinned starting main, the independent 390px browser witnesses measured
Scavenger Helmet visible alpha at **47.5px** (required144px), Pistol chassis/receiver
union at **54.078px** (required326px), and demonstrated a candidate tap saving an
occupied-slot replacement immediately. All three contracts fail there.

The new framing table derives opaque bounds offline from committed PNG/atlas
exports. Its checker pins hashes and rejects stale pixels, empty artwork, and
trimmed/rotated coordinate systems. The browser reads prepared bounds, never
scans pixels. Every assembled layer uses one union/transform; current and
candidate previews share that union. Artwork and its focus/scroll media frame
are registered together without transparent padding inflating logical bounds.

| Evidence | Result required by regression |
| --- | --- |
| Equipment artwork |128px at360,144px at390;240–264px at1114;264px at wider desktop;264/400px inspection |
| Foldable four-slot layout | All four complete slot cards inside the scroll viewport; candidate two-column capture was rejected because lower labels fell below the fold |
| Gunsmith three-family artwork |296px at360,326px at390, up to700px on wide screens; native Pistol/SMG/Shotgun frames measured independently of the production helper |
| Preview and commit | Candidate selection leaves durable save unchanged; structured resolved Damage/Fire Rate/Accuracy/etc and trait/Set/move/displacement consequences precede one explicit authoritative commit |
| Workshop/Parts | Legal merge/infusion inputs and exact output tiers/traits; destruction/unfitting warnings before confirm; catalog selection/request/cancel do not fabricate; held confirmation writes once |
| Controller and orientation | Actual navigator polling; held confirm produces one write;390DPR3 preserves preview/focus/save through blocked phone landscape and portrait restoration |
| Resource lifecycle | Rapid/stale loading, resize, shutdown, warm return and retry preserve existing semantics; delayed atlas missing a declared frame stays hidden rather than displaying an unrelated atlas fallback |
| Cold direct Gunsmith | Declares shared Figma chrome even with default backdrop and cached content; physical chrome loads once and is deduplicated on warm entry |
| Compact landscape | Fixed Gunsmith Back sits at right, clear of the title |

Pistol assembly originally shrank again when using an SMG-shaped height constraint;
a native-frame regression caught that193px intermediate candidate and corrected
the workbench height from the shared union aspect. The missing-chrome cold
captures were also rejected: visiting Equipment first had concealed an omitted
shared resource request. Both failures were reproduced before correction.

All165 existing/current Menu scene cases and16 Gunsmith surface cases retain the
save, stale command, lifecycle, focus and resource assertions. Existing Equipment
update and Loadout hydration browser source is unchanged. Gunsmith update tests
now perform preview→commit→inspect/unequip while retaining ownership, revision,
no-full-rebuild, save and resize assertions. The first integrated six-profile run
finished356 passed/64 existing skips/12 failures: two old tests per profile
expected vertical Equipment rows and an inline OWNED replacement row. Their
corrections traverse every slot in the approved grid, then preview and focus the
explicit Gunsmith replacement action. All prior scope/Set, save, local-update,
resize, full-action bounds and focus-border clearance assertions remain. The
displacement warning is checked in its new preview-detail owner. No budgets,
assertions or supported viewports were removed. The text-constructor inventory is46
rather than56 because ten repeated Gunsmith text sites now share helpers; the
symbol-resolved bypass audit and its negative probes remain intact.

The next complete run finished367 passed/64 existing skips/one desktop1920
warm-return timeout. Its final capture showed the correct returned Gunsmith;
profiling found fourteen native keyboard pulses before an eventual pointer tap,
consuming roughly ten seconds. Three repeated original runs took29.8–30.9s,
while replacing only that initial desktop keyboard walk with a real wheel
reveal and pointer click took17.9–18.2s. All cancellation, save-failure, ownership,
focus and warm-return assertions remain; touch and separate keyboard/controller
coverage are unchanged. A cheaper diagnostic getter did not materially improve
this fixture and was rejected. The screenshot itself took about1.2s. Raw repeat
results and limitations are in `evidence/pointer-journey-timings.json`; these
fixture timings do not claim a production performance improvement. Full final
candidate and merged-main runs remain the release authority.

The715a8e1 candidate passed the full local matrix368/64/0, but exact-head
hosted CI remained red361/64/7: seven desktop1920 native-input/capture journeys
exceeded their existing budgets. Hosted traces showed repeated forward focus
walks before replacement and cumulative frame/protocol cost. The correction
uses the shared navigator's existing shortest wrapping Left/Right path (including
actual D-pad polling), direct wheel/click for desktop pointer journeys, and the
existing freeze/resume seam only while PNGs encode. Family-direction, release,
held-confirm, resize, ownership and all save assertions remain on live frames.
Three consecutive seven-case desktop runs passed; raw durations and environment
are recorded in `evidence/hosted-native-driver.json`. Two-CPU affinity experiments
were materially slower than hosted timings and failed before/after correction;
they are retained as an uncalibrated limitation, not passing evidence or a new
gate. The suspected mask churn was rejected: current main already masks the
scroll content once. No runtime optimization or timeout change was justified.
Fresh full local and exact-head hosted gates remain required after this patch.

A laterbc2032f2 full local run passed every gate, including strict browser
typing, but hosted CI failed362/64/6. All failures exceeded30s with correct
observed states; tablet/foldable Parts and desktop Equipment also failed on this
slower runner. Three paired constrained-renderer measurements against starting
main found Home unchanged (~400ms median), Gunsmith517–533→900–917ms, and
Equipment650→750–767ms. JS owner spans stayed below11ms atp95; the difference
was primarily rendering cadence, not a loader or save race. This environment is
not a calibrated CI proxy or physical-device performance claim.

The native-size Gunsmith submitted large transparent source-canvas quads.
A three-repeat transient crop experiment reduced Gunsmith900→~700ms while
keeping the same source pixels, full placement/scale and shared layer transform.
Equipment showed little reliable benefit. The owning correction prepares a
separate **alpha>0** rectangle offline, pads it by two native pixels, and crops
only transparent padding after actual texture/frame binding on eager/lazy paths.
The >=16 visible-size bounds remain unchanged and cannot serve as rendering
crops. RED eager/lazy hydration and faint-alpha regressions precede the fix.

The experimental raster differed on2192 of2073600 Gunsmith desktop pixels
(0.106%) and3564 Equipment pixels (0.172%), along one-pixel nearest-sampling texel-boundary lines caused by changed quad/UV
interpolation. It did not recenter or rescale artwork, omit nonzero source alpha,
or change textures. This difference is explicitly inspectable; no golden is
refreshed and no existing image threshold is relaxed. Complete unchanged visual
gates and final actual-scale capture inspection remain required. Method, frame
percentiles, geometry, rejected hypotheses and limitations are preserved in
`evidence/render-submission.json`.

Touch and pointer activation fixtures now reveal with real drag/wheel gestures
and tap/click rather than prerequisites from another input method. The separate
keyboard family navigation, release sampling, controller polling and held-confirm
assertions remain. Desktop Equipment preview uses actual hover focus followed by
keyboard confirmation; save-failure and exactly-one-write assertions are retained.
Native activation passed all78 targeted cases across the six profiles. The
DPR3 fixture uses pointer mode from its outer profile: touch profiles use actual
touch drags, desktop copies use mouse/wheel. CDP cleanup releases/detaches even
on failure. No new framework, culling subsystem, FPS cap or timeout was introduced.

## Screenshot changes and release checks

Only22 existing baseline files may change. `snapshot-review.json` records each
path, previous/current hash, Figma owner and explanation:

- Equipment: `menu-equipment-*` and `loadout-equipment-*` at390/1114/1280;
  enlarged media, slot grid, useful header and removal of redundant Set hero.
- Loadout: `menu-loadout-*` and `compact-loadout-*`; readable shared chrome,
  consistent compact slots and lane sizing. Its four-slot router remains compact.
- Gunsmith: `menu-gunsmith-*`, `loadout-gunsmith-*`, `gunsmith-assembled-*`,
  `gunsmith-parts-*`; approved dark chrome, family/state rail, separate tabs,
  real assembled media and actual Parts navigation rather than nine row presses.

Every changed image must be inspected. Missing chrome, overlapping Back and the
foldable two-column candidate are rejected intermediate evidence, never final
visual authority. Other menu/actor/arena/Upgrade baselines and all pixel limits,
timeouts, retries and pre-existing skips remain unchanged.

Full release gates run at exact final candidate and merged main: lint/typecheck,
ordinary units, nine allocation gates, nine runner self-audits/probes, content,
complete art/source/export validation, ordinary build/resource identity and
production diagnostics absence, strict browser typecheck, six-profile browser
matrix, and diff checks. Hosted CI must pass before merge/deploy. The live site
must expose the exact verified main SHA and pass ordinary phone/desktop menu,
loadout operation, run-launch and naturally-earned Upgrade checks.

## Acceptance reconciliation

| Requirement | Machine evidence / remaining gate |
| --- | --- |
| #197 slots, state, scopes and selected-slot candidates | Structured existing read models; enlarged slot/inspection rendering; scene/controller/browser regressions |
| #197 replaced piece, Set gain/loss, mixed Sets, global traits/dedupe | Preserved immutable comparison through existing pure equip/persistent-run truth; no rules moved to MenuScene |
| #197 fabrication, stored/equipped upgrade, actual lock/funds and failed save | Existing authoritative commands; separate acquisition/equip; exact100Scrap upgrade and same-instance/set browser fixture; failure leaves save unchanged |
| #193 Build/Workshop/Parts and compatible slot/trait sockets | Surface flow regressions and real browser navigation, including large50-Part inventory |
| #193 actual before/after mechanics and visuals | Shared resolved stat formatter; one current/candidate union; existing atomic fit/move/persistence tests plus real separate preview/commit |
| #193 Workshop consequences and Parts acquisition | Exact tier/trait/input/output facts and warnings; request/confirm/cancel separation; generation-guarded stale callbacks |
| #193/#197 shared input, focus, scrolling, resource closure | Shared owners retained; browser matrix, controller-held edge, DPR3 blocked orientation, warm navigation and late art regressions |
| First-time player comprehension / genuine device/controller use | **HUMAN/DEVICE GATE**: no synthetic browser or unit assertion proves subjective clarity or physical-device behavior |
| Product-owner actual-scale visual acceptance | **HUMAN GATE**: Figma amendment approval is not approval of every runtime capture |
| #198/#199/#175/#165/#167/#171 and art umbrellas | Deliberately remain with their owning issues; no closure implied by this layout checkpoint |
| #201 delayed stale-context achievement acknowledgement | Untouched; remains a bounded correctness tranche before introducing actual native lifecycle/context recreation |

The requested stop is deployment followed by a development pause. Remaining
owner/device checks are recorded honestly; they do not justify another design
or architecture tranche in this checkpoint.
