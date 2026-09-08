#!/usr/bin/env python3
"""Export the checked-in 48×48 character PXO sheets without Pixelorama.

This is a narrow CI-independent fallback for environments where the
Pixelorama desktop binary is unavailable. It composites the six native RGBA
layers for every one of the sixteen source frames; Pixelorama remains the
authoring tool and source of truth.
"""

from __future__ import annotations

from pathlib import Path
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
LAYERS = 6


def export_character(root: Path, character_id: str) -> None:
    source = root / "assets-src" / "characters" / character_id / "source" / f"{character_id}.pxo"
    output = root / "public" / "assets" / "characters" / character_id / f"{character_id}.png"
    sheet = Image.new("RGBA", (FRAME * FRAMES, FRAME), (0, 0, 0, 0))
    with ZipFile(source) as archive:
        for frame in range(1, FRAMES + 1):
            composited = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
            for layer in range(1, LAYERS + 1):
                raw = archive.read(f"image_data/frames/{frame}/layer_{layer}")
                composited.alpha_composite(Image.frombytes("RGBA", (FRAME, FRAME), raw))
            sheet.alpha_composite(composited, ((frame - 1) * FRAME, 0))
    sheet.save(output)


if __name__ == "__main__":
    repository = Path(__file__).resolve().parents[3]
    for character in CHARACTERS:
        export_character(repository, character)
