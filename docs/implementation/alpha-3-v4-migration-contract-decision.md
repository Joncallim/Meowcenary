# Alpha 3 V4 migration contract decision

## Contradiction matrix

| Source | Purchased permanent upgrades | V4 result | Currency | Repeat load | Authority |
|---|---|---|---|---|---|
| V1 | none in schema | no upgrade state | no refund | unchanged | V4 authority index §5 |
| V2 | legal levels 0–5 | remove retired state; retain normal facts/entitlements | frozen cumulative refund once | V4 has no upgrade field, so no repeat | authority index §5; final handoff §6.2 |
| V3 | legal levels 0–5 | same as equivalent V2 | frozen cumulative refund once | V4 has no upgrade field, so no repeat | final handoff §6.2 |
| V2/V3 | invalid/unknown levels | sanitize; no fabricated value | only legal frozen entry | unchanged | owned-state amendment §9 |

The owned-state amendment forbids refunds for valid owned Equipment/Parts due
solely to new acquisition policy. It is silent about the separate retirement of
the permanent-stat shop. The final handoff explicitly requires that retirement
refund, and the authority index explicitly extends it to V2. Therefore the
review finding is correct; it does not authorize an Equipment/Part refund.

## Resolved implementation contract

Use the frozen *cumulative* RC1 table (not mutable catalog costs and not a sum
of per-level prices). Normalize V2 through the same V3-to-V4 authority so
equivalent purchased state converges. Save V4 omits `permanentUpgrades`; a
subsequent load is schema V4 and cannot issue the refund again.
