# Contracts candidate browser recovery

Authority: main/production `4f79d6210c3b028b995d67a5cc6e35318b17b2ee`;
failed PR #240 head `d2dedffbcac9568ca81e9d5e667eb41d1890e569`;
[hosted run 38137074154](https://github.com/Joncallim/Meowcenary/actions/runs/38137074154).
This is candidate recovery evidence, not merge, deployment or product approval.
PR #242 and its preserved playtest head are untouched.

## Failure classification and owning corrections

The complete job log separates 122 failures into 100 CDP error-classification
failures, 19 desktop-1920 journey deadlines, and three Contract screenshots.
The 112 Ability failures include 98 CDP failures and 14 deadlines; they are not
112 instances of the same protocol problem.

### Owned touch cancellation

The diagnostic proxy invokes Playwright through `Reflect.apply`, changing the
call prefix from `cdpSession.send` to `cdpSession.apply`. The Chromium method and
no-contact message remain identical. One shared exact-message classifier accepts
only those two complete forms. It is used only when the thrown value is an
`Error` from owned cancellation. Creation, operation, transport and detach errors
remain failures, including an identical message thrown at the wrong boundary.

No-contact is a statement about that CDP session, not page neutrality. The
physical input owner still admits the command only after released keys,
cancelled owned touches, released pointer input, a real sampled input frame,
and neutral/unquarantined state. Another session's held contact or a held pad
still blocks admission. Interrupted gestures cancel through their original
session, with exactly one detach and retained primary/cleanup failures.

Focused RED: 12 failures / 65 passes against the original helpers. GREEN:
91 tests plus 32 real phone-390/desktop-1280 browser ownership cases. Independent
read-only review passed. Unexpected prefixes, methods, appended text, newline,
non-Error values and teardown failures fail closed.

### Independent physical key releases

The unchanged desktop-1920 event record measured sequential fourteen-key release
from 6161 to 8133 ms: 1972 ms before pointer/touch cleanup or neutral admission.
Each protocol call took approximately 130–150 ms on the software-rendered page.
The helper now dispatches all distinct, non-modifier key-ups and joins every
result before continuing. Single errors retain identity; multiple errors remain
an AggregateError. No input/frame admission occurs after a failed release.

Focused RED: six failures / 91 passes. GREEN: 97 tests. The pending-release
regression proves that even one outstanding physical release blocks the next
frame and command. The browser and performance helpers share this boundary.
This reduces harness overhead; it is not a claimed gameplay performance fix.
Before this batching correction, 15 Ability and five other affected desktop
journeys passed locally at their existing budgets. Hosted deadline resolution
requires the corrected exact-head run; local success alone does not establish it.

### Contract screenshot ownership and platform fonts

Each current-main control matches its committed full screenshot with zero
different pixels. Local candidate/main title crops and natural backing canvases
are identical. Bundled Nunito, CSS, theme and text helper bytes are unchanged;
Nunito does not contain U+2713. The hosted title's fallback checkmark advance is
13.40625 px, versus 13 px in the controls. That shifts following Nunito letters
by 0.40625 px and changes exactly 659 title pixels per profile.

An isolated Chromium process with FONTCONFIG_FILE excluding Noto reproduces
the hosted candidate's **entire** phone screenshot with zero different pixels.
No runtime, font, viewport or drawing command was changed. Its natural title
RGBA crop SHA256 is
`a72c0256311fc99ab9e36b49cb3f3c1dc881ca5ff297285f1a78f8d76ad94c28`,
identical to the hosted observation. Explicit Noto/DejaVu fallback probes also
reproduce the respective natural backing hashes. CI now installs
`fonts-noto-core`, matching the Linux baseline environment. Actual hosted
font selection and screenshot success remain exact-head verification items.
The shipped font stack and readiness barrier are unchanged.

Only the three Contract goldens change, individually inspected by coordinator
and reviewer. They retain every title, asset, layout and other pixel; the
shorter scrollbar reflects fourteen catalog rows instead of ten:

| Profile | Changed pixels | Exclusive changed rectangle (x1,y1,x2,y2) |
| --- | ---: | --- |
| 390×844 | 979 | 378,363,388,462 |
| 1114×720 | 705 | 1040,282,1051,347 |
| 1280×720 | 563 | 1165,282,1175,347 |

The hosted fallback glyph was **not** adopted as a golden. No other screenshot,
pixel threshold, timeout, retry, assertion or scoped skip was changed.

## Validation and remaining acceptance

Focused strict TypeScript and diff checks passed; independent runtime launch/
input review found no concrete regression. That review checked immutable
preparation, revision-owned intro commands, physical quarantine, frozen intro,
deferred boss admission, resource cancellation and recovery teardown. Ability
activation/ticking/synchronization methods remain byte-identical to main.

Full ordinary/allocation/runner, content/art, production/resource/diagnostic,
six-profile browser and exact-head hosted gates are required before declaring
the candidate engineering-ready. Their final result belongs in the PR/issue
evidence, not in an inferred success from these focused controls. Physical
device and campaign/dialogue comprehension/play acceptance remain open under
#234/#85. No issue is closed and production is unchanged by this recovery.
