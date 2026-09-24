#!/usr/bin/env python3
"""Export the checked-in 48×48 character PXO sheets without Pixelorama.

This is a narrow CI-independent fallback for environments where the
Pixelorama desktop binary is unavailable. It composites the six native RGBA
layers for every one of the sixteen source frames; Pixelorama remains the
authoring tool and source of truth.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
from zipfile import ZipFile

from PIL import Image


CHARACTERS = (
    "scrap-tabby",
    "bolt-hound",
    "volt-lynx",
    "brass-boar",
    "ember-cougar",
    "scrap-weasel",
    "rattle-raptor",
    "piston-ram",
)
FRAME = 48
FRAMES = 16
def render_character(root: Path, character_id: str) -> Image.Image:
    source = root / "assets-src" / "characters" / character_id / "source" / f"{character_id}.pxo"
    sheet = Image.new("RGBA", (FRAME * FRAMES, FRAME), (0, 0, 0, 0))
    with ZipFile(source) as archive:
        project = json.loads(archive.read("data.json"))
        visible_layers = [
            index
            for index, layer in enumerate(project["layers"], start=1)
            if layer.get("visible") is True
        ]
        for frame in range(1, FRAMES + 1):
            composited = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
            for layer in visible_layers:
                raw = archive.read(f"image_data/frames/{frame}/layer_{layer}")
                composited.alpha_composite(Image.frombytes("RGBA", (FRAME, FRAME), raw))
            sheet.alpha_composite(composited, ((frame - 1) * FRAME, 0))
    return sheet


def export_character(root: Path, character_id: str) -> None:
    output = root / "public" / "assets" / "characters" / character_id / f"{character_id}.png"
    render_character(root, character_id).save(output)


def check_character(root: Path, character_id: str) -> None:
    output = root / "public" / "assets" / "characters" / character_id / f"{character_id}.png"
    with Image.open(output) as shipped:
        if shipped.convert("RGBA").tobytes() != render_character(root, character_id).tobytes():
            raise SystemExit(f"visible PXO/runtime mismatch: {character_id}")


if __name__ == "__main__":
    repository = Path(__file__).resolve().parents[3]
    arguments = list(sys.argv[1:])
    check_only = "--check" in arguments
    arguments = [argument for argument in arguments if argument != "--check"]
    requested = tuple(arguments) or CHARACTERS
    unknown = sorted(set(requested) - set(CHARACTERS))
    if unknown:
        raise SystemExit(f"unknown character id(s): {', '.join(unknown)}")
    for character in requested:
        (check_character if check_only else export_character)(repository, character)
