#!/usr/bin/env python3
"""Build the Mercenary ability/passive atlas from selected concept boards."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image


IDS = (
    "ability-icon:scrap-burst", "ability-icon:giga-chomp",
    "ability-icon:adrenaline", "ability-icon:shield-flicker",
    "ability-icon:heat-vent", "ability-icon:scavenge-pulse",
    "ability-icon:precision-mark", "ability-icon:overclock",
    "passive-icon:scrap-hoarder", "passive-icon:quick-tail",
    "passive-icon:light-paws", "passive-icon:thick-hide",
    "passive-icon:ember-aura", "passive-icon:magnet-belly",
    "passive-icon:hunter-eye", "passive-icon:hydraulic-core",
)
FRAME = 96
ZIP_DATE = (2020, 1, 1, 0, 0, 0)
SELECTED_MASTER_SHA256 = {
    "ability-icons-v2-selected.png": "1d6f426033693d8dad0535b0a7f9aaafd1116d89d5f899750f42abd4d327f6a3",
    "ability-passive-icons-selected.png": "b2a9d5b45a8b456352e31a6d8b569fc09e899da7d0e26f541f98fe382d5d1039",
}


def selected_master(root: Path, name: str) -> Path:
    path = root / "assets-src/characters/identity/concepts" / name
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    expected = SELECTED_MASTER_SHA256[name]
    if actual != expected:
        raise SystemExit(
            f"Selected Mercenary identity master digest mismatch for {name}: "
            f"expected {expected}, got {actual}"
        )
    return path


def render(root: Path) -> Image.Image:
    active_board = Image.open(selected_master(root, "ability-icons-v2-selected.png")).convert("RGBA")
    passive_board = Image.open(selected_master(root, "ability-passive-icons-selected.png")).convert("RGBA")
    atlas = Image.new("RGBA", (FRAME * len(IDS), FRAME), (0, 0, 0, 0))
    for index, _name in enumerate(IDS):
        if index < 8:
            board = active_board
            column, row = index % 4, index // 4
            rows = 2
        else:
            board = passive_board
            passive_index = index - 8
            column, row = passive_index % 4, passive_index // 4 + 2
            rows = 4
        left = round(column * board.width / 4)
        top = round(row * board.height / rows)
        right = round((column + 1) * board.width / 4)
        bottom = round((row + 1) * board.height / rows)
        tile = board.crop((left, top, right, bottom))
        bounds = tile.getchannel("A").getbbox()
        if bounds:
            tile = tile.crop(bounds)
        # Keep an intentional transparent safety gutter. These symbols are
        # displayed inside circular controls and must never read as cropped
        # when their authored sparks/ears reach the source-cell boundary.
        target = 76 if index < 8 else 82
        tile.thumbnail((target, target), Image.Resampling.NEAREST if index < 8 else Image.Resampling.LANCZOS)
        atlas.alpha_composite(tile, (index * FRAME + (FRAME - tile.width) // 2, (FRAME - tile.height) // 2))
    return atlas


def atlas_json() -> bytes:
    frames = {
        name: {"frame": {"x": index * FRAME, "y": 0, "w": FRAME, "h": FRAME}}
        for index, name in enumerate(IDS)
    }
    return (json.dumps({
        "export_directory_path": "", "export_file_name": "mercenary-identity-icons-atlas",
        "size_x": FRAME * len(IDS), "size_y": FRAME, "frames": frames,
    }, indent=2) + "\n").encode()


def project_json() -> bytes:
    return (json.dumps({
        "color_mode": 5, "current_frame": 0, "current_layer": 0,
        "export_directory_path": "", "export_file_format": 0,
        "export_file_name": "mercenary-identity-icons-atlas", "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{"animated_params": "{}", "blend_mode": 0, "clipping_mask": False,
                    "effects": {}, "locked": False, "name": "selected identity icon art",
                    "new_cels_linked": False, "opacity": 1, "parent": -1, "type": 0, "visible": True}],
        "pixelorama_version": "v1.2-stable", "pxo_version": 7,
        "size_x": FRAME * len(IDS), "size_y": FRAME, "tags": {},
    }, separators=(",", ":")) + "\n").encode()


def add_member(archive: ZipFile, name: str, data: bytes) -> None:
    member = ZipInfo(name, ZIP_DATE)
    member.compress_type = ZIP_DEFLATED
    member.external_attr = 0o100644 << 16
    archive.writestr(member, data)


def write(root: Path, output: Path) -> None:
    atlas = render(root)
    runtime = output / "public/assets/characters/identity"
    source = output / "assets-src/characters/identity/source"
    runtime.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    atlas.save(runtime / "mercenary-identity-icons-atlas.png", optimize=True)
    (runtime / "mercenary-identity-icons-atlas.json").write_bytes(atlas_json())
    with ZipFile(source / "mercenary-identity-icons-atlas.pxo", "w") as archive:
        add_member(archive, "mimetype", b"application/x-pixelorama")
        add_member(archive, "data.json", project_json())
        add_member(archive, "image_data/frames/1/layer_1", atlas.tobytes())


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-identity-icons-") as directory:
        generated = Path(directory)
        write(root, generated)
        for relative in (
            "public/assets/characters/identity/mercenary-identity-icons-atlas.png",
            "public/assets/characters/identity/mercenary-identity-icons-atlas.json",
            "assets-src/characters/identity/source/mercenary-identity-icons-atlas.pxo",
        ):
            if (root / relative).read_bytes() != (generated / relative).read_bytes():
                raise SystemExit(f"Mercenary identity icon output is out of date: {relative}")


if __name__ == "__main__":
    repository = Path(__file__).resolve().parents[3]
    if sys.argv[1:] == ["--check"]:
        check(repository)
    elif sys.argv[1:]:
        raise SystemExit("Usage: build-mercenary-identity-concept-atlas.py [--check]")
    else:
        write(repository, repository)
