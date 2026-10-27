# Junction Vale weapons-only loop prototype

Owner-directed R5/#171 diagnostic slice, consuming the R1/#193/#197 shop and
input contracts. This is a separate stacked draft after PR264's transaction
fixes and separately authorized baseline test maintenance. No issue or milestone
is closed by this prototype.

## Play the bounded loop

Run the existing Phaser app and open `/?fixture=junction`. The ordinary root,
legacy route, B1 and late fixtures retain their existing routes and identities.

1. At the teal dispatch marker, press Enter (controller bottom face) to inspect
   the short work order, then explicitly accept it.
2. Move with WASD/arrows or the left stick through the public approach into the
   marked restricted yard. Position around the one solid cover island while
   the active guns automatically target and fire.
3. Clear the two stationary rifle opponents, return to the dispatch marker and
   explicitly confirm the safe return.
4. Optionally open the merchant. Compare selected F2 with equipped F1, review
   the purchase, confirm or cancel, and separately review/confirm fitting.
   Buying does not equip or teach a schematic; the displaced feed stays owned.
5. Reload to verify the saved completion, health, supplies and loadout.

I / controller top face opens the two-weapon loadout. Swap is an explicit
loadout action; reserved Ability/Dash actions are not repurposed. Menus use
arrows/D-pad, confirm and Back. Esc / controller Menu pauses. Purchase/fit
confirmation starts focused on Cancel. Pointer activation requires a press and
release on the same choice without a drag.

## Prototype boundaries

- Tabby and Hound are an explicitly loaded subset of the six launch designs.
  Each has two signature-family guns, one active, independent supply/timing and
  a visible active-slot indicator. Health is an authoritative solid 0–100% bar.
- One safe frontage, one public corridor and one restricted workyard are flat
  technical blockout geometry. The same cover footprint governs swept body
  movement and ballistic LOS. Shots require both endpoints inside the restricted
  yard; public travel is safe in both directions.
- The scene reuses the existing combat owner and numeric weapon/rifle profiles.
  Stationary rifles and instant-contact fixture behavior are a technical proof,
  not finished enemy AI, final ballistics, encounter pacing or native sprite scale.
- The work order is a prototype identity, not a relocated Freight Basin R01/F01
  operation or a new canonical mission/property binding. It grants no campaign
  reward. Completion is explicit and idempotent.
- The internal workshop profile is a labelled technical seed, including a usable
  starting duo and 3,000 prototype Credits. Existing F2 quote 1,650 and tradeoff
  18 shots / 2.7s refill versus 12 / 1.5s are fixture values, not approved economy.
  Merging and later progression remain unavailable here.
- Device effects, radial cooldowns, party ability readiness, final portraits,
  voices, production art, physical-controller and mobile-port acceptance remain
  open. No decorative READY/cooldown claims stand in for missing mechanics.

## State and input ownership

`JunctionSliceModel` is Phaser-free. The scene renders read models, samples the
shared `InputController`, uses `FocusNavigator`, and serializes model commands
under an exclusive browser writer lock. The model persists a candidate before
publishing positions, combat, purchases, fit or completion.

The independent key is `meowcenary:junction-slice:v1`. No Save V4, B1, late-fixture,
campaign or ordinary reward key is written. Combat snapshots preserve actors,
health, active slots, gun supplies/timing and target retention across reload.
Invalid/foreign bytes fail closed and are preserved. A stale tab or failed write
publishes no candidate mutation.

Pause is ephemeral and freezes simulation; opening/dismissing/interruption
revokes shop consent and quarantines input until neutral. Resize revokes queued
commands only when dimensions actually change. Exact preview identity also fences
queued purchase commits. Explicit survivor takeover and a separately labelled
technical retry are supported; retry is not a production recovery-economy claim.

## Visual authority and delivery

All actors, terrain and labels on this route are explicit placeholders. No
approved concept was replaced or bound as production art, and no retired art was
restored. The three approved Library references still have no readable bytes in
this consumer workspace. No reference fidelity, projection selection or art-scale
acceptance is claimed.

Jonathan separately authorized publication of the finished prototype to the
existing playtest site. Infrastructure inspection identifies the existing
`https://meowcenary.jo-nas.com` route to `apps/meowcenary-live`. Its runbook requires
validated game-main and infrastructure-main commits, a pin-only change and the
existing locked deployment tool. Those merge gates are not implicit in the
playtest request. A read-only metadata probe from this environment was denied by
the proxy: `Tunnel connection failed: 403 Forbidden`. No routing, authentication,
permissions or service changes were used to work around it.

Keep candidate, integrated main, configured pin and verified served revision
separate. A passing local prototype is not a deployed playtest or product verdict.
