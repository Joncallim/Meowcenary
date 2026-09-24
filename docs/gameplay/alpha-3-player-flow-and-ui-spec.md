# Alpha 3 Player Flow and UI Specification

**Status:** implementation-ready product/UI contract for #165/#167/#168/#171.

**Baseline:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

This document turns the Alpha 3 product direction into concrete screen behavior. It does not replace the existing logical input, focus, safe-area, persistence, catalog or art contracts. It composes them into a player journey that is clear, visual, scalable and fast to replay.

The governing rule is:

> **The player should always know what they can do now, why they might do it, and what satisfying thing is one short action away.**

---

# 1. Product information architecture

The player-facing top level is reduced to concepts with one obvious job:

```text
Home
├─ Play Contract
├─ Mercenary
├─ Loadout
│  ├─ Equipment
│  └─ Gunsmith
├─ Career
│  ├─ Next Goals
│  ├─ Achievements
│  └─ Compendium
├─ Training          [optional legacy Golden Run]
└─ Settings
```

Do not expose `Arena` as a campaign peer to `Contract`. Arena remains a physical/location definition consumed by a Contract. Do not expose the old generic permanent-stat shop as `Progression`.

Internal controller/scene names may lag temporarily if changing them creates no player benefit. User-visible labels and navigation may not.

---

# 2. Shared scalable scroll/focus contract

The current Character screen overflows because menu panels render a growing list directly into one fixed-height root. Achievements/Gunsmith/Equipment compensate with bespoke pagination. Replace that class of workaround with one reusable scrollable focus region.

## 2.1 Ownership

Introduce one small UI primitive, conceptually:

```ts
interface ScrollableFocusRegion {
  readonly viewportTop: number;
  readonly viewportBottom: number;
  readonly contentHeight: number;
  readonly scrollOffset: number;

  setItems(items: readonly FocusItemLayout[]): void;
  ensureVisible(index: number): void;
  scrollBy(deltaLogicalPx: number): void;
  setScrollOffset(offset: number): void;
  destroy(): void;
}
```

Exact naming is implementation-owned; behavior is not.

It must reuse the current `FocusNavigator` and logical actions. Do not create a second navigation grammar.

## 2.2 Rendering

- Scrollable content lives in one child container.
- The visible region is clipped/masked to its viewport.
- Heading/top status and Back/help affordances remain fixed outside the scrolling content.
- `ensureVisible(focusedIndex)` adjusts only enough to reveal the whole focused target plus a small margin.
- Scroll position is clamped to `[0, max(0, contentHeight - viewportHeight)]`.
- A resize rebuild preserves focused semantic item ID where still present, then clamps its offset.
- A catalog refresh/removal preserves nearest legal focus rather than retaining a destroyed handle.

## 2.3 Input

Keyboard/controller:

- existing nav actions move focus;
- every focus change calls `ensureVisible`;
- confirm activates the focused row;
- no page-next/page-previous command is required merely because content grew.

Pointer/mouse:

- wheel/trackpad scrolls the region;
- hover focus follows existing semantics;
- clicking a row activates it only when the pointer gesture was not classified as a drag.

Touch:

- vertical drag scrolls the region;
- use a physical-pixel movement threshold projected through the existing viewport helper before classifying a gesture as scrolling;
- after the threshold is crossed, that gesture may not activate the underlying row on release;
- taps remain ordinary row activations;
- momentum is optional; do not make inertial physics a prerequisite for shipping the correctness fix.

## 2.4 Pass conditions

- 8, 20 and 50 synthetic rows remain reachable on 390×844 and 360×640.
- controller-only navigation reaches first/middle/last row without pointer fallback;
- touch can drag from first to last row without accidental row activation;
- wheel scrolling works on desktop;
- resize/orientation change does not strand focus offscreen;
- Back remains reachable without scrolling to the end.

---

# 3. Shared card/presentation hierarchy

Menus should look like a game, not a debug console, but visual polish may not destroy readability.

Use a small presentation vocabulary rather than bespoke layouts per screen:

1. **Hero card** — one primary next action / selected item.
2. **Content card** — roster, Contract, Equipment, Achievement, monster.
3. **Compact row** — sub-action/stat/part/item.
4. **Badge/chip** — rarity, slot, status, threat, set threshold.
5. **Primary CTA** — one visually dominant action per surface.
6. **Secondary CTA** — change/loadout/replay/back.

Every content card should have:

```text
art anchor
name
one-line identity/thesis
state/status
one primary decision or clear affordance
```

Raw stable IDs never appear in normal player copy.

---

# 4. Typography contract

The current UI permits per-label drift. Freeze a deterministic hierarchy:

- display/title: one size/weight;
- section heading: one size/weight;
- card title: one size/weight;
- body: one size/weight;
- supporting metadata: one size/weight;
- tiny text below the minimum body size is not used to make overflow disappear.

Upgrade cards specifically:

- every upgrade **name** uses the same title style, regardless of character count;
- every description uses the same body style;
- stack/rarity/category metadata uses the same supporting style;
- long names wrap to the approved title-line budget; they do not silently shrink while a shorter sibling stays large;
- overflow rules are deterministic and tested with the longest current names plus an N+1 fixture.

This directly prevents the reported `Pistol Needle Rounds` versus `Scrap Magnet` font-size mismatch.

---

# 5. Home

Home is a launchpad, not a list of subsystems.

## 5.1 Above the fold

Show:

- Meowcenary identity/logo treatment;
- selected Mercenary portrait + name;
- Scrap balance;
- one large **Next Contract** hero card.

The Next Contract card includes:

```text
chapter + contract number
contract name
location name
objective icon + concise objective
2–4 derived threat icons/names
headline first-clear reward / unlock
completion state / best time when replaying
PRIMARY: Play Contract
SECONDARY: Change Contract
```

A fresh player should not have to enter Contract selection merely to understand what pressing Play will do.

## 5.2 Secondary destinations

Below/around the hero card:

- Mercenary
- Loadout
- Career
- Training, if retained
- Settings

Do not restore separate Arena, Progression, Equipment and Gunsmith peer buttons simply because their controllers already exist.

---

# 6. Contracts

Contract selection is campaign navigation.

## 6.1 Structure

Group by chapter in authoritative stage order. The current release has two chapters with five Contracts each.

Each Contract card exposes:

- stage index / boss marker;
- name;
- location;
- objective icon + concise copy;
- derived enemy/threat summary;
- first-clear reward headline;
- locked/current/completed state;
- best clear time where applicable.

The selected Contract receives a larger detail panel or expanded card. Do not require a second separate Arena choice.

## 6.2 Locked content

A locked Contract says exactly what unlocks it in player language. Avoid `chapter:junkyard` / `stage:junkyard-04` copy.

Example:

```text
Locked — clear Brute Force first.
```

## 6.3 Chapter identity

Junkyard and Forge use distinct chapter/location presentation from #167. A chapter header has its approved emblem/plate/background accent but never becomes unreadable decorative text.

---

# 7. Mercenary

This surface replaces the current text-heavy Character list.

## 7.1 Selected mercenary card

Show:

- enlarged animated/idle actor art or approved portrait;
- name + one-line fantasy;
- core stat differences from baseline using icons;
- starting weapon art + name;
- passive icon + name + concise effect;
- active ability icon + name + concise effect + cooldown;
- mastery progress;
- selected/equip CTA;
- exact unlock requirement when locked.

The user should be able to distinguish two mercenaries without reading all their numbers.

## 7.2 Roster

The rest of the roster is a scrollable card/thumbnail collection using the shared scroll region. Locked silhouettes may be used only when the unlock copy remains readable and the art brief approves the treatment.

## 7.3 Scaling

Character 9/20 adds data + art and appears automatically. No `MenuScene` character-ID branch or per-roster pagination table.

---

# 8. Loadout hub

Loadout explains persistent power in one place.

Above the fold:

```text
selected Mercenary
4 equipped Equipment slots
selected Gunsmith weapon/build
short build thesis generated from active set/build traits
Scrap balance
```

Destinations:

- Equipment
- Gunsmith

A player should understand that this is **what they bring into the next Contract**.

---

# 9. Equipment

Equipment is selection + set-building + fabrication/upgrade, not a raw inventory dump.

## 9.1 Equipped strip

Always show four slots with dedicated slot glyphs:

```text
Helmet | Armour | Gloves | Boots
```

Each slot shows icon, item name, tier and set emblem.

## 9.2 Set state

Show active set thresholds visually:

```text
Commando 2/4
✓ 2-piece: Rapid fire
○ 4-piece: Tight grouping
```

Mixed 2+2 builds should read clearly rather than looking incomplete.

## 9.3 Inventory / blueprint list

Scrollable cards show:

- dedicated equipment art;
- set emblem;
- slot;
- owned tier OR `Blueprint` if unlocked but not fabricated;
- effect summary;
- comparison against current slot;
- fabrication cost or upgrade cost when actionable;
- lock reason when not yet unlocked.

One card may be selected; its primary action is context-sensitive and explicit: `Equip`, `Fabricate`, `Upgrade`, or disabled with reason.

No whole-set grant should cause eight new rows to appear with no meaningful decision.

---

# 10. Gunsmith

Gunsmith should sell the fantasy of engineering one ridiculous gun.

## 10.1 Chassis/build header

Show:

- selected family silhouette/weapon art;
- build name;
- fitted slot strip;
- active trait emblems;
- concise derived summary (for example `Incendiary SMG • rapid fire • long barrel`).

## 10.2 Part list

Scrollable part/blueprint cards show:

- dedicated physical part art;
- slot glyph;
- rarity;
- owned engineering tier;
- trait emblems;
- fit compatibility;
- actual before/after effect summary;
- actions: Fabricate / Fit / Unequip / Merge / Infuse as context permits.

Do not present definition IDs or require the player to infer which two anonymous copies are merge-compatible.

## 10.3 Merge/infuse confirmation

Before consuming parts, show both inputs and the exact output/trait result. Destructive engineering actions need a clear explicit confirm; ordinary equip/unequip does not.

---

# 11. Career

Career replaces the vague top-level Progression concept.

## 11.1 Overview

Show 2–3 actionable next goals from the existing progression overview read model:

```text
NEXT CONTRACT
Clear Rusher Ambush

NEARBY GOAL
First Victory — 0/1

MERCENARY
Scrap Weasel — defeat 100 enemies
```

Do not show a dashboard of every possible counter above the fold.

## 11.2 Destinations

- Achievements
- Compendium

Mastery can remain embedded in Mercenary unless its own volume later justifies a separate Career subpage.

---

# 12. Achievements

Use the shared scroll region rather than two-per-page bespoke pagination.

Cards show:

- badge art;
- name;
- description;
- completion/progress;
- reward summary;
- hidden treatment until revealed;
- completed timestamp only if useful and already authoritative.

Do not show stale/retired achievements to new players. Migrated legacy completions can be retained as historical facts without keeping impossible active goals in the catalog.

---

# 13. Compendium

The detailed ownership/discovery contract remains `monster-compendium.md`.

UI requirements:

- scrollable monster roster;
- unseen / encountered / defeated treatment;
- approved animated actor art at useful scale;
- threat tags;
- Behaviour / Tells / Counterplay according to discovery state;
- derived `Found In` Contract/location links;
- boss entries have phase/move treatment;
- opening the Compendium never eagerly requires all future game art at Boot: use the bundle/resource architecture from #170.

---

# 14. Training

If the Alpha 2 Golden Run remains useful, expose it as **Training**, not Arena.

Training copy must make it explicit that it is a repeatable free-play/legacy survival mode and not the campaign progression owner.

If player testing finds no meaningful reason to keep Training in the product, it may become a developer/diagnostic route while the explicit legacy request adapter remains for regression compatibility.

---

# 15. Settings

Settings keeps the current authoritative options and gets the planned icon family:

- mute;
- music volume;
- SFX volume;
- reduced motion.

Do not add an options tax merely to fill the screen. New settings require a real accessibility/platform need.

Reset Data/Progress remains available but is visually separated from ordinary settings and retains explicit confirmation.

---

# 16. Upgrade chooser

The chooser is one of the highest-value decision surfaces in the game.

Each card must show:

- pixel-art icon;
- name in the fixed title hierarchy;
- rarity treatment;
- concise mechanical description;
- current stack → next stack;
- weapon-family tag where scoped;
- category/identity cue;
- clear focus state.

The visual hierarchy must make a build-changing rare/synergy choice feel more exciting without making a common defensive card look disabled.

Selection remains one tap / one confirm. No hold-to-choose.

---

# 17. HUD and active ability

The HUD should answer only live combat questions:

- health;
- XP/level;
- Contract objective/progress;
- active ability readiness;
- short achievement/major event toast;
- only the minimum additional run information required by playtests.

Do not reproduce Career/Loadout information in the HUD.

Ability art/readiness must be perceptible without reading `READY` text. Text remains as accessible reinforcement.

---

# 18. Post-run result flow

The current summary is a stats table plus navigation. Alpha 3 needs a reward/progression reveal.

## 18.1 Win sequence

One skippable/fast surface, not a chain of mandatory dialogs:

1. `CONTRACT COMPLETE` + chapter/stage art;
2. core result: time / level / kills;
3. Scrap gained;
4. first-clear reward/unlock cards, if any;
5. achievements completed;
6. visible progress toward one relevant next goal;
7. actions.

Actions, in priority order:

```text
Next Contract
Adjust Loadout
Replay
Career / Main Menu
```

`Next Contract` remains the default focus when available.

## 18.2 Loss sequence

Show:

- `CONTRACT FAILED`;
- time / level / kills;
- concise final build summary;
- any banked run scrap that legitimately persists;
- one useful hint only when derived from known facts, not fake AI coaching;
- actions:

```text
Retry
Adjust Loadout
Change Contract
Main Menu
```

Retry is default focus.

## 18.3 Reward truth

The result read model must receive **the exact source-owned first-clear transaction outcome**, not infer new unlocks by dumping the whole `progression.unlocks` array. Existing `unlockedIds` behavior is too broad for a polished reveal because it can show historical unlocks repeatedly.

Add an explicit terminal presentation record for newly committed rewards/facts, built at the authoritative settlement boundary and consumed read-only by the summary.

---

# 19. Visual interaction details

- Cards use the #167 pixel-art/chrome packet, not flat text rectangles as the final state.
- Focus/hover changes may use border, small lift/scale or highlight within reduced-motion policy; never depend on motion alone.
- Locked state is visually distinct but still legible.
- Rarity uses shape/text + colour, not colour alone.
- Set identity uses emblem + name + colour family, not colour alone.
- Threat tags use icon + text.
- Every icon used as an actionable control has accessible text/semantic fallback.

---

# 20. Screen-scale acceptance

Every major surface is checked at:

- 390×844;
- 360×640;
- 844×390;
- 1280×720;
- 1920×1080.

Real-device acceptance includes portrait touch and a standard-layout controller.

Pass conditions:

- no unreachable card/row/action;
- no clipped title/body with no deterministic overflow treatment;
- no primary CTA below an unreachable scroll boundary;
- 44px physical minimum hit target preserved;
- safe-area insets preserved;
- focus visible at all times;
- mixed input does not double activate;
- controller disconnect/reconnect preserves existing logical-input guarantees;
- touch drag cannot accidentally activate a row;
- no screen requires raw-ID literacy.

---

# 21. Scalability proof

Automated UI/read-model fixtures must include at least:

- Character 20;
- Contract 25 in a later chapter;
- Equipment Set 12 / 48 pieces;
- Part catalog 50;
- Achievement 40;
- Compendium enemy 50.

These fixtures do not need production art. They prove that read models, focus, scroll bounds, loading requests and content-card layout are count-independent.

A new ordinary content row should appear because the registry/data contains it, not because `MenuScene` gained another ID branch.

---

# 22. Explicit non-goals

Do not use this pass to introduce:

- DOM/React UI alongside Phaser;
- a general UI framework/theme DSL;
- animated loot boxes;
- daily rewards/streaks;
- energy/timers;
- gacha presentation;
- multiple currencies merely for navigation depth;
- social comparison/leaderboards;
- a tutorial carousel before the player can press Play.

The target is a **small, polished, readable game UI** whose content can grow without its interaction architecture growing sideways.