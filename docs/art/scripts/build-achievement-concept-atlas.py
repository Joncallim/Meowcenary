#!/usr/bin/env python3
"""Build the Achievement atlas from the approved industrial badge board."""

from __future__ import annotations

import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image


BADGES = (
    "hidden", "first-kill", "kill-milestone-25", "kill-milestone-100",
    "first-merge", "boss-crusher", "chapter-junkyard", "first-victory",
    "mastery-scrap-tabby", "scrap-tycoon", "boss-forge",
)
FRAME = 192
SOURCE_COLUMN = 313
SOURCE_ROW = 337
SOURCE_TOP = 90
ZIP_DATE = (2020, 1, 1, 0, 0, 0)


def render(root: Path) -> Image.Image:
    board_path = root / "assets-src/achievements/concepts/direction-b-selected.png"
    board = Image.open(board_path).convert("RGBA")
    if board.size != (1254, 1254):
        raise SystemExit(f"selected Achievement board changed size: {board.size}")
    atlas = Image.new("RGBA", (FRAME * len(BADGES), FRAME), (0, 0, 0, 0))
    for index, _badge in enumerate(BADGES):
        column, row = index % 4, index // 4
        x = column * SOURCE_COLUMN
        y = SOURCE_TOP + row * SOURCE_ROW
        crop = board.crop((x, y, min(x + SOURCE_COLUMN, board.width), min(y + SOURCE_ROW, board.height)))
        crop.thumbnail((184, 184), Image.Resampling.LANCZOS)
        atlas.alpha_composite(crop, (index * FRAME + (FRAME - crop.width) // 2, (FRAME - crop.height) // 2))
    return atlas


def frames_json() -> bytes:
    frames = {
        f"achievement-icon:{badge}": {"frame": {"x": index * FRAME, "y": 0, "w": FRAME, "h": FRAME}}
        for index, badge in enumerate(BADGES)
    }
    return (json.dumps({
        "export_directory_path": "",
        "export_file_name": "achievement-icons-atlas",
        "size_x": FRAME * len(BADGES),
        "size_y": FRAME,
        "frames": frames,
    }, indent=2) + "\n").encode()


def pxo_json() -> bytes:
    project = {
        "color_mode": 5, "current_frame": 0, "current_layer": 0,
        "export_directory_path": "", "export_file_format": 0,
        "export_file_name": "achievement-icons-atlas", "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{
            "animated_params": "{}", "blend_mode": 0, "clipping_mask": False, "effects": {},
            "locked": False, "name": "selected badge art", "new_cels_linked": False,
            "opacity": 1, "parent": -1, "type": 0, "visible": True,
        }],
        "pixelorama_version": "v1.2-stable", "pxo_version": 7,
        "size_x": FRAME * len(BADGES), "size_y": FRAME, "tags": {},
    }
    return (json.dumps(project, separators=(",", ":")) + "\n").encode()


def zip_member(archive: ZipFile, name: str, data: bytes) -> None:
    member = ZipInfo(name, ZIP_DATE)
    member.compress_type = ZIP_DEFLATED
    member.external_attr = 0o100644 << 16
    archive.writestr(member, data)


def write(root: Path, output: Path) -> None:
    atlas = render(root)
    runtime = output / "public/assets/achievements"
    source = output / "assets-src/achievements/source"
    runtime.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    atlas.save(runtime / "achievement-icons-atlas.png", optimize=True)
    (runtime / "achievement-icons-atlas.json").write_bytes(frames_json())
    with ZipFile(source / "achievement-icons-atlas.pxo", "w") as archive:
        zip_member(archive, "mimetype", b"application/x-pixelorama")
        zip_member(archive, "data.json", pxo_json())
        zip_member(archive, "image_data/frames/1/layer_1", atlas.tobytes())


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-achievements-") as directory:
        generated = Path(directory)
        write(root, generated)
        for relative in (
            "public/assets/achievements/achievement-icons-atlas.png",
            "public/assets/achievements/achievement-icons-atlas.json",
            "assets-src/achievements/source/achievement-icons-atlas.pxo",
        ):
            if (root / relative).read_bytes() != (generated / relative).read_bytes():
                raise SystemExit(f"Achievement output is out of date: {relative}")


if __name__ == "__main__":
    repository = Path(__file__).resolve().parents[3]
    if sys.argv[1:] == ["--check"]:
        check(repository)
    elif sys.argv[1:]:
        raise SystemExit("Usage: build-achievement-concept-atlas.py [--check]")
    else:
        write(repository, repository)
