#!/usr/bin/env python3
"""Build the shipped Mercenary portraits from the selected identity board.

The untouched selected board remains the provenance master.  This deterministic
crop turns its portrait column into eight consistently framed, runtime-sized
cards and mirrors the result into an editable Pixelorama source plus Phaser
atlas export.  It intentionally does not regenerate or reinterpret the art.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image


MERCENARIES = (
    "scrap-tabby",
    "bolt-hound",
    "volt-lynx",
    "brass-boar",
    "ember-cougar",
    "scrap-weasel",
    "rattle-raptor",
    "piston-ram",
)
FRAME_WIDTH = 150
FRAME_HEIGHT = 240
SOURCE_TILE_WIDTH = 384
SOURCE_TILE_HEIGHT = 512
SOURCE_CROP = (8, 48, 243, 472)
ZIP_DATE = (2020, 1, 1, 0, 0, 0)


def render(root: Path) -> Image.Image:
    source = root / "assets-src/characters/identity/concepts/direction-b-selected.png"
    board = Image.open(source).convert("RGBA")
    if board.size != (1536, 1024):
        raise SystemExit(f"selected Mercenary identity board changed size: {board.size}")

    atlas = Image.new("RGBA", (FRAME_WIDTH * len(MERCENARIES), FRAME_HEIGHT), (0, 0, 0, 0))
    left, top, right, bottom = SOURCE_CROP
    for index, _character_id in enumerate(MERCENARIES):
        tile_x = (index % 4) * SOURCE_TILE_WIDTH
        tile_y = (index // 4) * SOURCE_TILE_HEIGHT
        portrait = board.crop((tile_x + left, tile_y + top, tile_x + right, tile_y + bottom))
        portrait.thumbnail((140, FRAME_HEIGHT), Image.Resampling.LANCZOS)
        atlas.alpha_composite(
            portrait,
            (index * FRAME_WIDTH + (FRAME_WIDTH - portrait.width) // 2, (FRAME_HEIGHT - portrait.height) // 2),
        )
    return atlas


def atlas_json() -> bytes:
    frames = {
        f"character-portrait:{character_id}": {
            "frame": {"x": index * FRAME_WIDTH, "y": 0, "w": FRAME_WIDTH, "h": FRAME_HEIGHT}
        }
        for index, character_id in enumerate(MERCENARIES)
    }
    return (json.dumps({
        "export_directory_path": "",
        "export_file_name": "mercenary-portraits-atlas",
        "size_x": FRAME_WIDTH * len(MERCENARIES),
        "size_y": FRAME_HEIGHT,
        "frames": frames,
    }, indent=2) + "\n").encode()


def pixelorama_json() -> bytes:
    project = {
        "color_mode": 5,
        "current_frame": 0,
        "current_layer": 0,
        "export_directory_path": "",
        "export_file_format": 0,
        "export_file_name": "mercenary-portraits-atlas",
        "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{
            "animated_params": "{}", "blend_mode": 0, "clipping_mask": False, "effects": {},
            "locked": False, "name": "selected portrait art", "new_cels_linked": False,
            "opacity": 1, "parent": -1, "type": 0, "visible": True,
        }],
        "pixelorama_version": "v1.2-stable",
        "pxo_version": 7,
        "size_x": FRAME_WIDTH * len(MERCENARIES),
        "size_y": FRAME_HEIGHT,
        "tags": {},
    }
    return (json.dumps(project, separators=(",", ":")) + "\n").encode()


def write_zip_member(archive: ZipFile, name: str, data: bytes) -> None:
    member = ZipInfo(name, ZIP_DATE)
    member.compress_type = ZIP_DEFLATED
    member.external_attr = 0o100644 << 16
    archive.writestr(member, data)


def write_outputs(root: Path, output_root: Path) -> None:
    atlas = render(root)
    runtime = output_root / "public/assets/characters/identity"
    source = output_root / "assets-src/characters/identity/source"
    runtime.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    atlas.save(runtime / "mercenary-portraits-atlas.png", optimize=True)
    (runtime / "mercenary-portraits-atlas.json").write_bytes(atlas_json())
    with ZipFile(source / "mercenary-portraits-atlas.pxo", "w") as archive:
        write_zip_member(archive, "mimetype", b"application/x-pixelorama")
        write_zip_member(archive, "data.json", pixelorama_json())
        write_zip_member(archive, "image_data/frames/1/layer_1", atlas.tobytes())


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-mercenary-portraits-") as directory:
        generated = Path(directory)
        write_outputs(root, generated)
        for relative in (
            "public/assets/characters/identity/mercenary-portraits-atlas.png",
            "public/assets/characters/identity/mercenary-portraits-atlas.json",
            "assets-src/characters/identity/source/mercenary-portraits-atlas.pxo",
        ):
            if (root / relative).read_bytes() != (generated / relative).read_bytes():
                raise SystemExit(f"Mercenary portrait output is out of date: {relative}")


if __name__ == "__main__":
    repository = Path(__file__).resolve().parents[3]
    if sys.argv[1:] == ["--check"]:
        check(repository)
    elif sys.argv[1:]:
        raise SystemExit("Usage: build-mercenary-portrait-atlas.py [--check]")
    else:
        write_outputs(repository, repository)
