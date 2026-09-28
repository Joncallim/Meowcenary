#!/usr/bin/env python3
"""Import the approved Equipment concept masters at live card resolution."""

from __future__ import annotations

import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
FRAME = 96
SLOTS = ("helmet", "armour", "gloves", "boots")
SETS = ("scavenger", "juggernaut", "pyro", "recon", "medic", "technician", "demolition")
ZIP_DATE = (2026, 1, 1, 0, 0, 0)


def fit_cell(board: Image.Image, column: int, row: int, columns: int, rows: int) -> Image.Image:
    cell = board.crop((round(column * board.width / columns), round(row * board.height / rows),
                       round((column + 1) * board.width / columns), round((row + 1) * board.height / rows)))
    bounds = cell.getchannel("A").getbbox()
    if bounds is None:
        raise SystemExit(f"approved Equipment cell {column},{row} is empty")
    cell = cell.crop(bounds)
    cell.thumbnail((84, 84), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    frame.alpha_composite(cell, ((FRAME - cell.width) // 2, (FRAME - cell.height) // 2))
    return frame


def build_atlas(board: Image.Image, rows: int) -> Image.Image:
    atlas = Image.new("RGBA", (FRAME * 5, FRAME * rows), (0, 0, 0, 0))
    for row in range(rows):
        for column in range(5):
            atlas.alpha_composite(fit_cell(board, column, row, 5, rows), (column * FRAME, row * FRAME))
    return atlas


def frame_ids(set_ids: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(name for set_id in set_ids for name in (f"equipment-set-icon:{set_id}", *(f"equipment-icon:{set_id}-{slot}" for slot in SLOTS)))


def metadata(name: str, set_ids: tuple[str, ...]) -> bytes:
    ids = frame_ids(set_ids)
    frames = {art_id: {"frame": {"x": (index % 5) * FRAME, "y": (index // 5) * FRAME, "w": FRAME, "h": FRAME}}
              for index, art_id in enumerate(ids)}
    return (json.dumps({"export_directory_path": "", "export_file_name": name,
                        "size_x": FRAME * 5, "size_y": FRAME * len(set_ids), "frames": frames}, indent=2) + "\n").encode()


def project(name: str, atlas: Image.Image) -> bytes:
    return (json.dumps({
        "color_mode": 5, "current_frame": 0, "current_layer": 0,
        "export_directory_path": "", "export_file_format": 0, "export_file_name": name, "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{"animated_params": "{}", "blend_mode": 0, "clipping_mask": False, "effects": {},
                    "locked": False, "name": "approved Equipment production art", "new_cels_linked": False,
                    "opacity": 1, "parent": -1, "type": 0, "visible": True}],
        "pixelorama_version": "v1.2-stable", "pxo_version": 7,
        "size_x": atlas.width, "size_y": atlas.height, "tags": {},
    }, separators=(",", ":")) + "\n").encode()


def add_member(archive: ZipFile, name: str, payload: bytes) -> None:
    info = ZipInfo(name, ZIP_DATE)
    info.compress_type = ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, payload)


def emit(output: Path, name: str, set_ids: tuple[str, ...], atlas: Image.Image, runtime_dir: str, source_dir: str) -> None:
    runtime = output / runtime_dir
    source = output / source_dir
    runtime.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    atlas.save(runtime / f"{name}.png", optimize=True)
    (runtime / f"{name}.json").write_bytes(metadata(name, set_ids))
    with ZipFile(source / f"{name}.pxo", "w") as archive:
        add_member(archive, "mimetype", b"application/x-pixelorama")
        add_member(archive, "data.json", project(name, atlas))
        add_member(archive, "image_data/frames/1/layer_1", atlas.tobytes())


def write(root: Path, output: Path) -> None:
    commando = Image.open(root / "assets-src/equipment/commando/concepts/commando-direction-a-selected.png").convert("RGBA")
    sets = Image.open(root / "assets-src/equipment/sets/concepts/equipment-families-direction-b-selected.png").convert("RGBA")
    if commando.size != (2172, 724) or sets.size != (1312, 1199):
        raise SystemExit("an approved Equipment concept master changed dimensions")
    emit(output, "commando-equipment-atlas", ("commando",), build_atlas(commando, 1),
         "public/assets/equipment/commando", "assets-src/equipment/commando/source")
    emit(output, "equipment-sets-atlas", SETS, build_atlas(sets, len(SETS)),
         "public/assets/equipment/sets", "assets-src/equipment/sets/source")


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-equipment-") as directory:
        generated = Path(directory)
        write(root, generated)
        for relative in (
            "public/assets/equipment/commando/commando-equipment-atlas.png",
            "public/assets/equipment/commando/commando-equipment-atlas.json",
            "assets-src/equipment/commando/source/commando-equipment-atlas.pxo",
            "public/assets/equipment/sets/equipment-sets-atlas.png",
            "public/assets/equipment/sets/equipment-sets-atlas.json",
            "assets-src/equipment/sets/source/equipment-sets-atlas.pxo",
        ):
            if (root / relative).read_bytes() != (generated / relative).read_bytes():
                raise SystemExit(f"Equipment output is out of date: {relative}")


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        check(ROOT)
    elif sys.argv[1:]:
        raise SystemExit("Usage: build-equipment-concept-atlases.py [--check]")
    else:
        write(ROOT, ROOT)
