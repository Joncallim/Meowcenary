#!/usr/bin/env python3
"""Build illustrated Contract and Settings icon families from selected boards."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image


CONTRACT_IDS = (
    "chapter-icon:junkyard", "chapter-icon:forge", "objective-icon:kill",
    "objective-icon:collect", "objective-icon:survive", "objective-icon:defeat",
)
SETTINGS_IDS = (
    "settings-icon:master-audio", "settings-icon:music", "settings-icon:sfx",
    "settings-icon:reduced-motion", "settings-icon:fullscreen",
)
IDS = CONTRACT_IDS + SETTINGS_IDS
FRAME = 96
ZIP_DATE = (2020, 1, 1, 0, 0, 0)
SELECTED_SHA256 = {
    "contract-icons-selected.png": "ec58cd6e3f104a49e14f0999a84acaee55a5f3c2558835b5b39134decba0a2cd",
    "settings-icons-selected.png": "711f72f778cd31ee0e9745ed77fcdef3c285b9fe49854a56d94f20e5af68051e",
}


def tiles(root: Path):
    for filename, names in (
        ("contract-icons-selected.png", CONTRACT_IDS),
        ("settings-icons-selected.png", SETTINGS_IDS),
    ):
        path = root / "assets-src/ui/concepts" / filename
        if hashlib.sha256(path.read_bytes()).hexdigest() != SELECTED_SHA256[filename]:
            raise SystemExit(f"selected menu semantic master digest mismatch for {filename}")
        board = Image.open(path).convert("RGBA")
        if board.size != (1536, 1024):
            raise SystemExit(f"selected {filename} changed size: {board.size}")
        for index, name in enumerate(names):
            column, row = index % 3, index // 3
            tile = board.crop((column * 512, row * 512, (column + 1) * 512, (row + 1) * 512))
            inset = 6
            yield name, tile.crop((inset, inset, tile.width - inset, tile.height - inset))


def render(root: Path) -> Image.Image:
    atlas = Image.new("RGBA", (FRAME * len(IDS), FRAME), (0, 0, 0, 0))
    for index, (_name, tile) in enumerate(tiles(root)):
        tile.thumbnail((FRAME, FRAME), Image.Resampling.LANCZOS)
        atlas.alpha_composite(tile, (index * FRAME + (FRAME - tile.width) // 2, (FRAME - tile.height) // 2))
    return atlas


def atlas_json() -> bytes:
    frames = {
        name: {"frame": {"x": index * FRAME, "y": 0, "w": FRAME, "h": FRAME}}
        for index, name in enumerate(IDS)
    }
    return (json.dumps({
        "export_directory_path": "", "export_file_name": "menu-semantic-icons-atlas",
        "size_x": FRAME * len(IDS), "size_y": FRAME, "frames": frames,
    }, indent=2) + "\n").encode()


def project_json() -> bytes:
    return (json.dumps({
        "color_mode": 5, "current_frame": 0, "current_layer": 0,
        "export_directory_path": "", "export_file_format": 0,
        "export_file_name": "menu-semantic-icons-atlas", "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{"animated_params": "{}", "blend_mode": 0, "clipping_mask": False,
                    "effects": {}, "locked": False, "name": "selected menu semantic art",
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
    runtime = output / "public/assets/ui"
    source = output / "assets-src/ui/source"
    runtime.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    atlas.save(runtime / "menu-semantic-icons-atlas.png", optimize=True)
    (runtime / "menu-semantic-icons-atlas.json").write_bytes(atlas_json())
    with ZipFile(source / "menu-semantic-icons-atlas.pxo", "w") as archive:
        add_member(archive, "mimetype", b"application/x-pixelorama")
        add_member(archive, "data.json", project_json())
        add_member(archive, "image_data/frames/1/layer_1", atlas.tobytes())


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-menu-semantic-") as directory:
        generated = Path(directory)
        write(root, generated)
        for relative in (
            "public/assets/ui/menu-semantic-icons-atlas.png",
            "public/assets/ui/menu-semantic-icons-atlas.json",
            "assets-src/ui/source/menu-semantic-icons-atlas.pxo",
        ):
            if (root / relative).read_bytes() != (generated / relative).read_bytes():
                raise SystemExit(f"Menu semantic icon output is out of date: {relative}")


if __name__ == "__main__":
    repository = Path(__file__).resolve().parents[3]
    if sys.argv[1:] == ["--check"]:
        check(repository)
    elif sys.argv[1:]:
        raise SystemExit("Usage: build-menu-semantic-concept-atlas.py [--check]")
    else:
        write(repository, repository)
