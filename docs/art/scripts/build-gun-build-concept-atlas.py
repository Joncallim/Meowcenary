#!/usr/bin/env python3
"""Import the approved assembled-weapon concept into the runtime layer atlas."""

from __future__ import annotations

import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
FRAME_WIDTH, FRAME_HEIGHT = 96, 48
ZIP_DATE = (2026, 1, 1, 0, 0, 0)
# Crop, authored assembly anchor. All layers share one physical scale and are
# placed against the same receiver datum so equipped Parts visibly persist in
# the assembled gun rather than becoming unrelated thumbnail stickers.
LAYERS = (
    ("gun-build-base:pistol", (0, 40, 415, 370), (203, 147)),
    ("gun-build-base:smg", (410, 40, 960, 390), (231, 148)),
    ("gun-build-base:shotgun", (930, 40, 1536, 390), (245, 148)),
    ("gun-build-part:receiver-compact", (0, 380, 265, 625), (122, 156)),
    ("gun-build-part:receiver-heavy", (265, 380, 605, 650), (135, 156)),
    ("gun-build-part:barrel-standard", (580, 380, 860, 625), (74, 156)),
    ("gun-build-part:barrel-long", (850, 380, 1260, 625), (62, 156)),
    ("gun-build-part:optic-red-dot", (1240, 350, 1536, 620), (104, 186)),
    ("gun-build-part:stock-padded", (0, 620, 310, 920), (261, 160)),
    ("gun-build-part:trigger-hair", (300, 620, 600, 920), (99, 160)),
    ("gun-build-part:magazine-extended", (560, 580, 850, 1024), (94, 200)),
    ("gun-build-part:underbarrel-grenade", (820, 610, 1190, 950), (67, 170)),
    ("gun-build-part:barrel-piercing", (1160, 600, 1536, 940), (76, 180)),
)
# Keep every assembled layer on the shared authored datum, but leave a real
# transparent gutter around the 96x48 runtime frame.  The earlier 0.155 import
# clipped tall magazines, grips and the shotgun even though the atlas itself
# loaded successfully.
SCALE = 0.12
TARGET_ANCHOR = (39, 23)
LAYER_SCALES = {
    "gun-build-base:smg": 0.11,
    "gun-build-part:magazine-extended": 0.10,
}


def remove_alignment_guides(image: Image.Image, anchor: tuple[int, int]) -> Image.Image:
    source = list(image.get_flattened_data())
    cyan: set[tuple[int, int]] = set()
    for index, (red, green, blue, alpha) in enumerate(source):
        x, y = index % image.width, index // image.width
        near_datum = abs(x - anchor[0]) <= 64 and abs(y - anchor[1]) <= 64
        guide = near_datum and alpha > 0 and red < 105 and green > 115 and blue > 145 and blue > red * 1.6
        if guide:
            cyan.add((x, y))
    # Include the guide's dark outline, then fill it from the nearest authored
    # neighbour. At 96x48 this removes the production mark without punching a
    # transparent cross through the receiver underneath it.
    mask = {(x + dx, y + dy) for x, y in cyan for dx in range(-3, 4) for dy in range(-3, 4)
            if 0 <= x + dx < image.width and 0 <= y + dy < image.height}
    for y in range(max(0, anchor[1] - 64), min(image.height, anchor[1] + 65)):
        for x in range(max(0, anchor[0] - 64), min(image.width, anchor[0] + 65)):
            dx, dy = x - anchor[0], y - anchor[1]
            guide_shape = abs(dx) <= 7 or abs(dy) <= 7 or 5 <= (dx * dx + dy * dy) ** 0.5 <= 19
            if guide_shape and source[y * image.width + x][3] > 0:
                mask.add((x, y))
    pixels = list(source)
    for x, y in mask:
        replacement = None
        for radius in range(1, 15):
            candidates = ((x - radius, y), (x + radius, y), (x, y - radius), (x, y + radius),
                          (x - radius, y - radius), (x + radius, y + radius))
            replacement = next((point for point in candidates
                                if 0 <= point[0] < image.width and 0 <= point[1] < image.height and point not in mask), None)
            if replacement is not None:
                break
        if replacement is not None:
            pixels[y * image.width + x] = source[replacement[1] * image.width + replacement[0]]
    clean = Image.new("RGBA", image.size)
    clean.putdata(pixels)
    return clean


def remove_resampled_guide_edges(image: Image.Image) -> Image.Image:
    """Remove cyan guide fragments reintroduced by Lanczos resampling.

    This pass is intentionally limited to the shared receiver datum. Cyan
    power accents elsewhere in the approved weapon art remain untouched.
    """
    source = list(image.get_flattened_data())
    guide: set[tuple[int, int]] = set()
    for index, (red, green, blue, alpha) in enumerate(source):
        x, y = index % image.width, index // image.width
        near_datum = abs(x - TARGET_ANCHOR[0]) <= 9 and abs(y - TARGET_ANCHOR[1]) <= 24
        if near_datum and alpha > 0 and red < 100 and green > 125 and blue > 150 and blue > red * 1.55:
            guide.add((x, y))
    mask = {(x + dx, y + dy) for x, y in guide for dx in range(-1, 2) for dy in range(-1, 2)
            if 0 <= x + dx < image.width and 0 <= y + dy < image.height}
    pixels = list(source)
    for x, y in mask:
        replacement = None
        for radius in range(1, 8):
            candidates = ((x - radius, y), (x + radius, y), (x, y - radius), (x, y + radius))
            replacement = next((point for point in candidates
                                if 0 <= point[0] < image.width and 0 <= point[1] < image.height
                                and point not in mask and source[point[1] * image.width + point[0]][3] > 0), None)
            if replacement is not None:
                break
        pixels[y * image.width + x] = source[replacement[1] * image.width + replacement[0]] if replacement else (0, 0, 0, 0)
    clean = Image.new("RGBA", image.size)
    clean.putdata(pixels)
    return clean


def render(root: Path) -> Image.Image:
    board = Image.open(root / "assets-src/gunsmith/previews/concepts/assembled-weapons-direction-a-selected.png").convert("RGBA")
    if board.size != (1536, 1024):
        raise SystemExit(f"selected assembled-weapon board changed size: {board.size}")
    atlas = Image.new("RGBA", (FRAME_WIDTH * len(LAYERS), FRAME_HEIGHT), (0, 0, 0, 0))
    for index, (name, crop, anchor) in enumerate(LAYERS):
        scale = LAYER_SCALES.get(name, SCALE)
        layer = remove_alignment_guides(board.crop(crop), anchor)
        layer = layer.resize((round(layer.width * scale), round(layer.height * scale)), Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", (FRAME_WIDTH, FRAME_HEIGHT), (0, 0, 0, 0))
        x = TARGET_ANCHOR[0] - round(anchor[0] * scale)
        y = TARGET_ANCHOR[1] - round(anchor[1] * scale)
        frame.alpha_composite(layer, (x, y))
        frame = remove_resampled_guide_edges(frame)
        atlas.alpha_composite(frame, (index * FRAME_WIDTH, 0))
    return atlas


def atlas_json() -> bytes:
    frames = {name: {"frame": {"x": index * FRAME_WIDTH, "y": 0, "w": FRAME_WIDTH, "h": FRAME_HEIGHT}}
              for index, (name, _crop, _anchor) in enumerate(LAYERS)}
    return (json.dumps({"export_directory_path": "", "export_file_name": "gun-build-preview-atlas",
                        "size_x": FRAME_WIDTH * len(LAYERS), "size_y": FRAME_HEIGHT, "frames": frames}, indent=2) + "\n").encode()


def project_json() -> bytes:
    return (json.dumps({
        "color_mode": 5, "current_frame": 0, "current_layer": 0,
        "export_directory_path": "", "export_file_format": 0,
        "export_file_name": "gun-build-preview-atlas", "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{"animated_params": "{}", "blend_mode": 0, "clipping_mask": False, "effects": {},
                    "locked": False, "name": "approved assembled weapon art", "new_cels_linked": False,
                    "opacity": 1, "parent": -1, "type": 0, "visible": True}],
        "pixelorama_version": "v1.2-stable", "pxo_version": 7,
        "size_x": FRAME_WIDTH * len(LAYERS), "size_y": FRAME_HEIGHT, "tags": {},
    }, separators=(",", ":")) + "\n").encode()


def member(archive: ZipFile, name: str, data: bytes) -> None:
    info = ZipInfo(name, ZIP_DATE)
    info.compress_type = ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, data)


def write(root: Path, output: Path) -> None:
    atlas = render(root)
    runtime = output / "public/assets/gunsmith/previews"
    source = output / "assets-src/gunsmith/previews/source"
    runtime.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    atlas.save(runtime / "gun-build-preview-atlas.png", optimize=True)
    (runtime / "gun-build-preview-atlas.json").write_bytes(atlas_json())
    with ZipFile(source / "gun-build-preview-atlas.pxo", "w") as archive:
        member(archive, "mimetype", b"application/x-pixelorama")
        member(archive, "data.json", project_json())
        member(archive, "image_data/frames/1/layer_1", atlas.tobytes())


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-gun-build-") as directory:
        generated = Path(directory)
        write(root, generated)
        for relative in (
            "public/assets/gunsmith/previews/gun-build-preview-atlas.png",
            "public/assets/gunsmith/previews/gun-build-preview-atlas.json",
            "assets-src/gunsmith/previews/source/gun-build-preview-atlas.pxo",
        ):
            if (root / relative).read_bytes() != (generated / relative).read_bytes():
                raise SystemExit(f"assembled weapon output is out of date: {relative}")


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        check(ROOT)
    elif sys.argv[1:]:
        raise SystemExit("Usage: build-gun-build-concept-atlas.py [--check]")
    else:
        write(ROOT, ROOT)
