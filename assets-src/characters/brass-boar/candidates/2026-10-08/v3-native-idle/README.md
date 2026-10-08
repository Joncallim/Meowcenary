# Brass Boar V3 native idle candidate — 2026-10-08

**CANDIDATE. Direction approved; native sprite and shipping not approved.**

The owner accepted the sibling V3 identity preview (“yeah this direction is
fine”). This is a directly authored 48×48 translation of that direction and
the canonical first roster figure (Figma 91:2 / 92:2). No enlarged image was
downsampled into these pixels, and no V2 sprite was reused. V2 remains
DEPRECATED — DO NOT SHIP.

The Lua stores one complete palette/indexed pixel pose. Its PNG is an exact
lossless export; the one-frame PXO packages those same pixels into an editable
body layer with the usual face/outfit/weapon/shadow/notes layer names. Other
layers are empty and weapon/shadow/notes are hidden. This is an idle review
source, not the required 16-frame shipping animation source.

Reproduce from repository root (Lua, Node and Python standard library):

```sh
node assets-src/characters/brass-boar/candidates/2026-10-08/v3-native-idle/export-idle-preview.mjs assets-src/characters/brass-boar/candidates/2026-10-08/v3-native-idle/brass-boar-idle-native-raster.lua
python3 assets-src/characters/brass-boar/candidates/2026-10-08/v3-native-idle/package-idle-preview.py
```

The review HTML shows accepted direction, 8× inspection and 48/54.25 CSS-pixel
samples. These samples explain scale; they do not claim live-game, physical
device or animation acceptance. Source bounds are x5–43/y3–45, with 1,172
opaque pixels in the refined pose. The outer border is transparent.

Independent first-pass review identified weak snout shape/nostrils and a flat
bright plate. The refined source adds shaped muzzle pixels, two 2×2 nostrils
and aged brass rim/highlight/rivet/dent clusters. Final source/export checks
are recorded separately; visual approval remains the owner gate.

No runtime binding, art registry, physics, frame dimensions or screenshot
baseline changed. No full repository or hosted green validation is claimed
for these unbound preview files. #191/#174/#175/#167 remain open.
