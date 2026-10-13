# Mercenary source-frame crop repair — 2026-10-08

Baseline: `2865e28f46b046b743283b8c1bcf7fc7ef2936a3`.
Owning issues: [#191](https://github.com/Joncallim/Meowcenary/issues/191) and
[#175](https://github.com/Joncallim/Meowcenary/issues/175).

## Reproduction and correction

All eight Mercenary sheets were inspected across all sixteen source frames.
Volt Lynx's final defeat frame had three opaque pixels on its left border:
`(0,41)`, `(0,42)`, `(0,43)`. The existing combined crop/motion regression
covered only the five newer Mercenaries. It did not inspect Lynx, Tabby or Hound.

The new independent border regression covers all eight actors and all sixteen
frames. Before the fix it fails with `volt-lynx frame 16 meets the source-frame
border`, reporting offsets `1968`, `2016`, `2064`. No prior assertions were
removed or relaxed. Run it with:

```sh
npx vitest run tests/characterArtDistinctness.test.ts -t 'keeps all eight Mercenaries'
```

Only Lynx frame 16 moves one native pixel right. Its 725 opaque pixels, palette
and alpha values are preserved; frames 1–15 are pixel-identical to the baseline.
Every frame now has a transparent border. The native raster is the owning
source; the ordinary builder regenerates PXO and the existing exporter produces
PNG. Animation clips, anchors, resource IDs, actor scaling and physics do not
change. Independent read-only QA verified the exact translation and source /
PXO / runtime parity. The full nine-test character-art file passes after the fix.

## Authority and limits

Live Figma file `LHpXaKqFKksfF2uismDws5` was read on 2026-10-08. The canonical
roster is nodes `91:2` / `92:2`; Volt Lynx is `113:2`. Source-authority pages
`90:2` and `101:2` distinguish approved direction from runtime implementation.
The concept READMEs and loader comment now reflect that distinction instead of
calling the runtime raster reviewed visual authority.

This repairs a source crop contact, not Mercenary fidelity acceptance. It does
not approve the current Boar or certify naked Lynx-versus-Tabby identity.
Runtime sheets remain **CANDIDATE**; rejected art remains **DEPRECATED — DO NOT
SHIP**, and exploration remains **ARCHIVE — PROVENANCE ONLY**. Screenshot
baselines record implementation drift and do not replace owner approval.
No screenshot goldens were regenerated for this repair.

Full validation and exact commit evidence are recorded on the implementation
PR. Issues #191, #174, #175 and #167 retain their human visual gates.
