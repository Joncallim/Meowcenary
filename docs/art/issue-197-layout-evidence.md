# Loadout and Equipment layout integration evidence — candidate

PR #204 implements the two owning menu surfaces against the supplied canonical
Figma file `LHpXaKqFKksfF2uismDws5`, Menu Screens — Premium:

- [Loadout, 104:206](https://www.figma.com/design/LHpXaKqFKksfF2uismDws5?node-id=104-206)
- [Equipment, 104:268](https://www.figma.com/design/LHpXaKqFKksfF2uismDws5?node-id=104-268)

The reference frames define layout and chrome. Their example inventory, currency,
mastery and configured build do not override the current save or run mechanics.
The fresh-save acceptance captures correctly show Scrap Tabby, Scrap Pistol I,
zero Scrap, four empty Equipment slots, no active Set and no engineered build.
Empty Equipment row illustrations identify slots; they do not create or equip
an owned item. Empty Loadout overview tiles remain blank, as in the reference.

The shipped candidate character/weapon/Equipment art retained from main is not
newly approved by this layout change. The richer character composition and
structural tier assets remain separate #199/#198 dependencies. Those differences
must be assessed against their own canonical sources at actual scale.

The portrait layout uses the authored header, Mercenary hero, stock weapon,
four inline gear slots, Equipment/Gunsmith routing, Run Readiness and fixed
Return footer. Equipment uses its authored header, Set hero, four vertical slot
rows, Set browsing and fixed Fabricate footer. The Set browsing control uses a plain section label and the same bounded 44px
logical action for pointer, keyboard and controller. Its catalog emblems expand
structured threshold details through that shared owner; this change does not
invent a new Set selection workflow.

The header Back control is an explicit navigation adaptation: the authored
full-width Fabricate footer otherwise leaves touch users without a return
action. It uses the existing shared Back command. The reference sample’s
“No blocking loadout issues” is not copied because the current snapshot has no
authoritative general launch-resource readiness fact. The overview shows actual
equipped count and engineered-family activation instead. These decisions remain
part of the candidate presentation and do not waive owner visual acceptance.

Owned-candidate, scoped-effect
and whole-loadout consequences continue below the authored first-page summary.
At shorter viewports, the existing shared scroll owner reveals that content;
the fixed footer stays outside its clip. Compact landscape initially reveals
the keyboard-focused slot row. It is a responsive adaptation of the portrait
frame, not a second canonical Figma frame.

## Screenshot regression references

The previous Loadout/Equipment goldens retained the older logo/backdrop and
centered report composition. Each changed capture must be inspected against its
old expected image, actual image, diff and the two canonical frames above.
Only the changed owning surfaces may receive new regression references; other
menu, actor, gameplay and modal captures retain their previous checks.

These regression references lock the inspected **candidate implementation**.
They are not canonical art, product-owner approval or an acceptance waiver.
#191 and every outstanding physical/human visual gate remain open. A rejected
or unexplained candidate must not replace a reference merely to make CI green.

Exact source SHA, capture inventory, review findings, runtime/input evidence and
full-suite results are recorded on PR #204 and issue #197. The complete browser
matrix must be rerun after the reviewed references are installed; an early
snapshot failure does not validate later captures that the journey never reached.

Reviewed source: `0c51ce2776730143c92f275d756440ffdc897805`. The ten
reference paths and old/candidate digests are in
`issue-197-layout-reference-review.json`. All four Loadout captures are identical
to the reviewed preceding source; Equipment audit/fidelity captures are identical
at each matching viewport. Eight catalog Sets require two emblem rows; on the
phone, the second row continues inside the shared scroll region. It is not
omitted or allowed to paint over the fixed footer.

Independent actual-input evidence on source
`e962527f4695c3b5eded99b7f0a07775a941fe21` covered six viewports and 24
preview/equip/unequip workflows, plus emulated controller reconnect followed by
pointer and keyboard. The later section-style change preserves the same
logical target and commands, and has separate focus/color/decoration-ownership
regressions. The final full browser suite must verify the installed references.
Hardware controller/device approval and first-time human comprehension remain
unverified; these captures do not claim them.
