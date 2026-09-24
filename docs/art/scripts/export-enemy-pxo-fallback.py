#!/usr/bin/env python3
"""Deterministically export the selected 48px enemy PXO sheets.

Pixelorama remains the editable source. This narrow fallback composites the
visible native RGBA layers for Linux/CI environments without the desktop app.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
from zipfile import ZipFile

from PIL import Image


ENEMIES = ("dust-mite", "scrap-sniper", "boss-crusher")
FRAME = 48
FRAMES = 16


def render_enemy(root: Path, enemy_id: str) -> Image.Image:
    source = root / "assets-src" / "enemies" / enemy_id / "source" / f"{enemy_id}.pxo"
    sheet = Image.new("RGBA", (FRAME * FRAMES, FRAME), (0, 0, 0, 0))
    with ZipFile(source) as archive:
        project = json.loads(archive.read("data.json"))
        if (project["size_x"], project["size_y"], len(project["frames"])) != (FRAME, FRAME, FRAMES):
            raise SystemExit(f"unexpected PXO actor contract: {enemy_id}")
        visible_layers = [
            index for index, layer in enumerate(project["layers"], start=1)
            if layer.get("visible") is True
        ]
        for frame in range(1, FRAMES + 1):
            composited = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
            for layer in visible_layers:
                raw = archive.read(f"image_data/frames/{frame}/layer_{layer}")
                composited.alpha_composite(Image.frombytes("RGBA", (FRAME, FRAME), raw))
            sheet.alpha_composite(composited, ((frame - 1) * FRAME, 0))
    return sheet


def export_enemy(root: Path, enemy_id: str) -> None:
    output = root / "public" / "assets" / "enemies" / enemy_id / f"{enemy_id}.png"
    render_enemy(root, enemy_id).save(output)


def check_enemy(root: Path, enemy_id: str) -> None:
    output = root / "public" / "assets" / "enemies" / enemy_id / f"{enemy_id}.png"
    with Image.open(output) as shipped:
        if shipped.convert("RGBA").tobytes() != render_enemy(root, enemy_id).tobytes():
            raise SystemExit(f"visible PXO/runtime mismatch: {enemy_id}")


if __name__ == "__main__":
    repository = Path(__file__).resolve().parents[3]
    arguments = list(sys.argv[1:])
    check_only = "--check" in arguments
    arguments = [argument for argument in arguments if argument != "--check"]
    requested = tuple(arguments) or ENEMIES
    unknown = sorted(set(requested) - set(ENEMIES))
    if unknown:
        raise SystemExit(f"unknown enemy id(s): {', '.join(unknown)}")
    for enemy in requested:
        (check_enemy if check_only else export_enemy)(repository, enemy)
