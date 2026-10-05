#!/usr/bin/env python3
"""Derive presentation-only opaque bounds from committed export pixels.

No image is altered. The browser never reads canvas pixels to frame Loadout
art, and co-registered assembly layers retain their full source canvas.
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / "src/presentation/loadout-art-bounds.json"


def read(relative, root=ROOT):
    return json.loads((root / relative).read_text())


def build(root=ROOT):
    bindings = {row["id"]: row for row in read("src/data/visual-art.json", root)["bindings"]}
    resources = {row["id"]: row for row in read("src/data/visual-resources.json", root)}
    ids = {tier["iconArtId"] for row in read("src/data/equipment-visuals.json", root) for tier in row["tiers"]}
    for part in read("src/data/gunsmith-part-visuals.json", root)["parts"]:
        for tier in part["tiers"]:
            ids.add(tier["iconArtId"])
            if tier.get("assemblyArtId"):
                ids.add(tier["assemblyArtId"])
    for part in read("src/data/gun-parts.json", root):
        ids.update(part["presentation"]["traitIconArtIds"].values())
    # Presentation roles, not a branch on one weapon family or item definition.
    ids.update(key for key in bindings if key.startswith(("gun-build-base:", "gun-chassis-icon:")))
    images, atlases, sources, bounds = {}, {}, {}, {}
    for art_id in sorted(ids):
        binding = bindings[art_id]
        resource = resources[binding["resourceId"]]
        load = resource["load"]
        image_path = "public/" + load["imageUrl"]
        if image_path not in images:
            images[image_path] = Image.open(root / image_path).convert("RGBA")
            sources[image_path] = hashlib.sha256((root / image_path).read_bytes()).hexdigest()
        image = images[image_path]
        if load["type"] == "atlas":
            atlas_path = "public/" + load["dataUrl"]
            if atlas_path not in atlases:
                atlases[atlas_path] = read(atlas_path, root)
                sources[atlas_path] = hashlib.sha256((root / atlas_path).read_bytes()).hexdigest()
            frame = atlases[atlas_path]["frames"][binding["frameKey"]]
            if frame.get("rotated") or frame.get("trimmed"):
                raise ValueError(f"{art_id}: rotated/trimmed canvas needs explicit coordinate support")
            rectangle = frame["frame"]
            x, y, width, height = (rectangle[key] for key in ("x", "y", "w", "h"))
            image = image.crop((x, y, x + width, y + height))
        elif load["type"] != "image":
            raise ValueError(f"{art_id}: expected static Loadout media")
        alpha = image.getchannel("A").point(lambda value: 255 if value >= 16 else 0)
        box = alpha.getbbox()
        if not box:
            raise ValueError(f"{art_id}: empty production artwork")
        left, top, right, bottom = box
        bounds[art_id] = {
            "frameWidth": image.width, "frameHeight": image.height,
            "left": left, "top": top, "width": right - left, "height": bottom - top,
        }
    return {"schemaVersion": 1, "alphaThreshold": 16, "sources": dict(sorted(sources.items())), "bounds": bounds}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = json.dumps(build(), indent=2) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != result:
            raise SystemExit("Loadout art bounds are stale; run build-loadout-art-bounds.py")
        print("Loadout export/bounds parity passed")
    else:
        OUTPUT.write_text(result)
        print("Wrote presentation bounds from committed Loadout exports")


if __name__ == "__main__":
    main()
