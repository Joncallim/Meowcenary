#!/usr/bin/env python3
"""Create auditable lossless Lua raster companions from authored actor PNGs."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
ACTORS = ("scrap-tabby", "bolt-hound", "volt-lynx", "brass-boar", "ember-cougar", "scrap-weasel", "rattle-raptor", "piston-ram")

def emit(actor: str) -> None:
    image = Image.open(ROOT / "public/assets/characters" / actor / f"{actor}.png").convert("RGBA")
    colors = sorted({pixel for pixel in image.getdata() if pixel[3]}, key=lambda p: (p[3], p[:3]))
    indexes = {pixel: index + 1 for index, pixel in enumerate(colors)}
    lines = ["return {", "  palette = {", *[f'    \"#{r:02x}{g:02x}{b:02x}{a:02x}\",' for r,g,b,a in colors], "  },", "  frames = {"]
    for frame in range(16):
        lines.append("    {")
        for y in range(48):
            runs = []
            x = 0
            while x < 48:
                pixel = image.getpixel((frame * 48 + x, y))
                if pixel[3] == 0:
                    x += 1; continue
                start = x; index = indexes[pixel]
                while x + 1 < 48 and image.getpixel((frame * 48 + x + 1, y)) == pixel: x += 1
                runs.append(f"{start}:{x}:{index}"); x += 1
            if runs: lines.append(f'      [{y}] = "{";".join(runs)}",')
        lines.append("    },")
    lines += ["  },", "}", ""]
    (ROOT / "assets-src/characters" / actor / "source" / f"{actor}-native-raster.lua").write_text("\n".join(lines))

for actor in ACTORS: emit(actor)
