#!/usr/bin/env python3
"""Build large menu navigation art from the selected generated source boards."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image


PRIMARY = (
    "play-contract", "mercenary", "loadout", "career", "training", "settings",
)
SECONDARY = ("equipment", "gunsmith", "achievements", "compendium")
SINGLES = ("change-contract",)
FRAME = 192
ZIP_DATE = (2020, 1, 1, 0, 0, 0)
SELECTED_SHA256 = {
    "navigation-primary-selected.png": "717e2f3d11c716ba1fab482668abf3b263fcf0afa698d01a0d8a5d56e3cd6691",
    "navigation-secondary-selected.png": "b9f3d0a21165372c424458ea308cb16c7dd438b81997e1d643a5ca4db756703f",
    "navigation-change-contract-selected.png": "3aa29128e8197cd4655266bb1f08eac8633403c73beddda94c9e77311951b6fb",
}


def selected_board(root: Path, name: str) -> Image.Image:
    path = root / "assets-src/ui/concepts" / name
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != SELECTED_SHA256[name]:
        raise SystemExit(f"selected navigation master digest mismatch for {name}")
    return Image.open(path).convert("RGBA")


def selected_tiles(root: Path):
    primary = selected_board(root, "navigation-primary-selected.png")
    secondary = selected_board(root, "navigation-secondary-selected.png")
    change_contract = selected_board(root, "navigation-change-contract-selected.png")
    if primary.size != (1536, 1024):
        raise SystemExit(f"selected primary navigation board changed size: {primary.size}")
    if secondary.size != (1254, 1254):
        raise SystemExit(f"selected secondary navigation board changed size: {secondary.size}")
    if change_contract.size != (1254, 1254):
        raise SystemExit(f"selected Change Contract art changed size: {change_contract.size}")
    for index, name in enumerate(PRIMARY):
        column, row = index % 3, index // 3
        yield name, primary.crop((column * 512, row * 512, (column + 1) * 512, (row + 1) * 512))
    for index, name in enumerate(SECONDARY):
        column, row = index % 2, index // 2
        yield name, secondary.crop((column * 627, row * 627, (column + 1) * 627, (row + 1) * 627))
    yield "change-contract", change_contract


def render(root: Path) -> Image.Image:
    atlas = Image.new("RGBA", (FRAME * (len(PRIMARY) + len(SECONDARY) + len(SINGLES)), FRAME), (0, 0, 0, 0))
    for index, (_name, tile) in enumerate(selected_tiles(root)):
        alpha = tile.getchannel("A")
        bounds = alpha.getbbox()
        if bounds is None:
            raise SystemExit("selected navigation tile is empty")
        crop = tile.crop(bounds)
        crop.thumbnail((184, 184), Image.Resampling.LANCZOS)
        atlas.alpha_composite(crop, (index * FRAME + (FRAME - crop.width) // 2, (FRAME - crop.height) // 2))
    return atlas


def frame_ids() -> tuple[str, ...]:
    return tuple(f"nav-icon:{name}" for name in (*PRIMARY, *SECONDARY, *SINGLES))


def frames_json() -> bytes:
    frames = {
        name: {"frame": {"x": index * FRAME, "y": 0, "w": FRAME, "h": FRAME}}
        for index, name in enumerate(frame_ids())
    }
    return (json.dumps({
        "export_directory_path": "",
        "export_file_name": "navigation-icons-atlas",
        "size_x": FRAME * len(frames),
        "size_y": FRAME,
        "frames": frames,
    }, indent=2) + "\n").encode()


def pxo_json() -> bytes:
    project = {
        "color_mode": 5, "current_frame": 0, "current_layer": 0,
        "export_directory_path": "", "export_file_format": 0,
        "export_file_name": "navigation-icons-atlas", "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{
            "animated_params": "{}", "blend_mode": 0, "clipping_mask": False, "effects": {},
            "locked": False, "name": "selected navigation art", "new_cels_linked": False,
            "opacity": 1, "parent": -1, "type": 0, "visible": True,
        }],
        "pixelorama_version": "v1.2-stable", "pxo_version": 7,
        "size_x": FRAME * len(frame_ids()), "size_y": FRAME, "tags": {},
    }
    return (json.dumps(project, separators=(",", ":")) + "\n").encode()


def zip_member(archive: ZipFile, name: str, data: bytes) -> None:
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
    atlas.save(runtime / "navigation-icons-atlas.png", optimize=True)
    (runtime / "navigation-icons-atlas.json").write_bytes(frames_json())
    with ZipFile(source / "navigation-icons-atlas.pxo", "w") as archive:
        zip_member(archive, "mimetype", b"application/x-pixelorama")
        zip_member(archive, "data.json", pxo_json())
        zip_member(archive, "image_data/frames/1/layer_1", atlas.tobytes())


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-navigation-") as directory:
        generated = Path(directory)
        write(root, generated)
        for relative in (
            "public/assets/ui/navigation-icons-atlas.png",
            "public/assets/ui/navigation-icons-atlas.json",
            "assets-src/ui/source/navigation-icons-atlas.pxo",
        ):
            if (root / relative).read_bytes() != (generated / relative).read_bytes():
                raise SystemExit(f"Navigation output is out of date: {relative}")


if __name__ == "__main__":
    repository = Path(__file__).resolve().parents[3]
    if sys.argv[1:] == ["--check"]:
        check(repository)
    elif sys.argv[1:]:
        raise SystemExit("Usage: build-navigation-concept-atlas.py [--check]")
    else:
        write(repository, repository)
