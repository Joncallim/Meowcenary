#!/usr/bin/env python3
"""Actual-size evidence from all eighteen physical runtime weapon images."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[3]
output = ROOT / "assets-src/weapons/tiers/evidence"
output.mkdir(parents=True, exist_ok=True)
contact = Image.new("RGB", (550, 540), (55, 61, 68))
draw = ImageDraw.Draw(contact)
row = 0
for group, prefix, width, height in (("held-weapons", "weapon-held", 28, 18), ("weapon-icons", "weapon-icon", 44, 28)):
    for family in ("pistol", "smg", "shotgun"):
        y = row * 90
        draw.text((8, y + 5), f"{group}: {family} ({width}px)", fill="white")
        for tier in (1, 2, 3):
            name = f"{prefix}-{family}-t{tier}"
            with Image.open(ROOT / f"public/assets/{group}/{name}/{name}.png") as source:
                art = source.convert("RGBA").resize((width, height), Image.Resampling.NEAREST)
            gray = ImageOps.grayscale(art).convert("RGBA")
            gray.putalpha(art.getchannel("A"))
            for column, image in enumerate((art, gray)):
                x = 200 + (tier - 1) * 100 + column * 50
                contact.paste(image, (x, y + 30), image)
                draw.text((x, y + 65), str(tier), fill="white")
        row += 1
contact.save(output / "actual-scale-color-gray.png")
contact.resize((2200, 2160), Image.Resampling.NEAREST).save(output / "actual-scale-color-gray-4x.png")
