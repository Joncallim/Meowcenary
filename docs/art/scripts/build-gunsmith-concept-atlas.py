#!/usr/bin/env python3
"""Build the production Gunsmith icon atlas from the selected art board."""

from __future__ import annotations

import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
FRAME = 96
PARTS = (
    "gun-part-icon:receiver-compact", "gun-part-icon:receiver-heavy",
    "gun-part-icon:barrel-standard", "gun-part-icon:barrel-long",
    "gun-part-icon:optic-red-dot", "gun-part-icon:stock-padded",
    "gun-part-icon:trigger-hair", "gun-part-icon:magazine-extended",
    "gun-part-icon:underbarrel-grenade", "gun-part-icon:barrel-piercing",
    "gun-part-icon:trait-fire", "gun-part-icon:trait-fire-mastered",
)
SLOTS = (
    "gun-slot-icon:receiver", "gun-slot-icon:barrel", "gun-slot-icon:optic",
    "gun-slot-icon:stock", "gun-slot-icon:trigger", "gun-slot-icon:magazine",
    "gun-slot-icon:underbarrel", "gun-slot-icon:trait",
)
TRAITS = ("trait-icon:fire", "trait-icon:explosive", "trait-icon:piercing")
IDS = PARTS + SLOTS + TRAITS
ZIP_DATE = (2026, 1, 1, 0, 0, 0)


def tiles(board: Image.Image):
    # The approved board deliberately uses 6/8/6 columns by semantic row.
    for index, name in enumerate(PARTS):
        column, row = index % 6, index // 6
        yield name, board.crop((column * 256, row * 256, (column + 1) * 256, (row + 1) * 256))
    for index, name in enumerate(SLOTS):
        yield name, board.crop((index * 192, 512, (index + 1) * 192, 768))
    for index, name in enumerate(TRAITS):
        yield name, board.crop((index * 256, 768, (index + 1) * 256, 1024))


def render(root: Path) -> Image.Image:
    board = Image.open(root / "assets-src/gunsmith/icons/concepts/gunsmith-icons-direction-b-selected.png").convert("RGBA")
    if board.size != (1536, 1024):
        raise SystemExit(f"selected Gunsmith board changed size: {board.size}")
    atlas = Image.new("RGBA", (FRAME * len(IDS), FRAME), (0, 0, 0, 0))
    for index, (_name, tile) in enumerate(tiles(board)):
        tile.thumbnail((FRAME, FRAME), Image.Resampling.LANCZOS)
        atlas.alpha_composite(tile, (index * FRAME + (FRAME - tile.width) // 2, (FRAME - tile.height) // 2))
    return atlas


def project(atlas: Image.Image) -> bytes:
    return (json.dumps({
        "color_mode": 5, "current_frame": 0, "current_layer": 0,
        "export_directory_path": "", "export_file_format": 0,
        "export_file_name": "gunsmith-icons-atlas", "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{"animated_params": "{}", "blend_mode": 0, "clipping_mask": False,
                    "effects": {}, "locked": False, "name": "selected Gunsmith icon art",
                    "new_cels_linked": False, "opacity": 1, "parent": -1, "type": 0, "visible": True}],
        "pixelorama_version": "v1.2-stable", "pxo_version": 7,
        "size_x": atlas.width, "size_y": atlas.height, "tags": {},
    }, separators=(",", ":")) + "\n").encode()


def atlas_json(atlas: Image.Image) -> bytes:
    frames = {name: {"frame": {"x": index * FRAME, "y": 0, "w": FRAME, "h": FRAME}} for index, name in enumerate(IDS)}
    return (json.dumps({"export_directory_path": "", "export_file_name": "gunsmith-icons-atlas",
                        "size_x": atlas.width, "size_y": atlas.height, "frames": frames}, indent=2) + "\n").encode()


def member(archive: ZipFile, name: str, payload: bytes) -> None:
    info = ZipInfo(name, ZIP_DATE)
    info.compress_type = ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, payload)


def write(root: Path, output: Path) -> None:
    atlas = render(root)
    runtime = output / "public/assets/gunsmith/icons"
    source = output / "assets-src/gunsmith/icons/source"
    runtime.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    atlas.save(runtime / "gunsmith-icons-atlas.png", optimize=True)
    (runtime / "gunsmith-icons-atlas.json").write_bytes(atlas_json(atlas))
    with ZipFile(source / "gunsmith-icons-atlas.pxo", "w") as archive:
        member(archive, "mimetype", b"application/x-pixelorama")
        member(archive, "data.json", project(atlas))
        member(archive, "image_data/frames/1/layer_1", atlas.tobytes())


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-gunsmith-icons-") as directory:
        generated = Path(directory)
        write(root, generated)
        for relative in (
            "public/assets/gunsmith/icons/gunsmith-icons-atlas.png",
            "public/assets/gunsmith/icons/gunsmith-icons-atlas.json",
            "assets-src/gunsmith/icons/source/gunsmith-icons-atlas.pxo",
        ):
            if (root / relative).read_bytes() != (generated / relative).read_bytes():
                raise SystemExit(f"Gunsmith icon output is out of date: {relative}")


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        check(ROOT)
    elif sys.argv[1:]:
        raise SystemExit("Usage: build-gunsmith-concept-atlas.py [--check]")
    else:
        write(ROOT, ROOT)
