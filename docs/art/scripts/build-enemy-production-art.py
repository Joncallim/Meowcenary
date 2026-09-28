#!/usr/bin/env python3
"""Build native enemy animation sources and the shared portrait atlas.

The checked-in selected ImageGen sheets are production masters. This builder
places their deliberately authored pixel-style 4x4 poses onto the native
48/64px gameplay grid and derives a separate high-resolution portrait atlas
for menus. The native Pixelorama projects remain the editable gameplay source
of truth.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
PORTRAIT_SIZE = 256
FRAMES = 16
ENEMIES = {
    "dust-mite": (48, "dust-mite-pixel-v3.png"),
    "junk-rusher": (48, "junk-rusher-pixel-v3.png"),
    "trash-brute": (48, "trash-brute-pixel-v3.png"),
    "scrap-sniper": (48, "scrap-sniper-pixel-v3.png"),
    "scrap-skitter": (48, "scrap-skitter-pixel-v3.png"),
    "bastion-beetle": (48, "bastion-beetle-pixel-v3.png"),
    "junk-nester": (48, "junk-nester-pixel-v3.png"),
    "shard-bot": (48, "shard-bot-pixel-v3.png"),
    "boss-crusher": (64, "boss-crusher-pixel-v3.png"),
    "boss-forge": (64, "boss-forge-pixel-v3.png"),
}


def selected_sheet(source_root: Path, enemy_id: str, filename: str) -> Path:
    return source_root / "assets-src" / "enemies" / enemy_id / "source" / filename


def source_cells(sheet: Image.Image) -> list[Image.Image]:
    rgba = sheet.convert("RGBA")
    x_edges = [round(rgba.width * index / 4) for index in range(5)]
    y_edges = [round(rgba.height * index / 4) for index in range(5)]
    return [
        rgba.crop((x_edges[column], y_edges[row], x_edges[column + 1], y_edges[row + 1]))
        for row in range(4)
        for column in range(4)
    ]


def native_frame(cell: Image.Image, size: int) -> Image.Image:
    # Resize the equal source cell, not a per-pose bounding box: this preserves
    # one authored scale and ground datum across the complete animation.
    inset_size = size - 2
    ratio = min(inset_size / cell.width, inset_size / cell.height)
    width = max(1, round(cell.width * ratio))
    height = max(1, round(cell.height * ratio))
    # The selected masters deliberately use stepped pixel clusters. Nearest
    # preserves those clusters on the native grid instead of reintroducing the
    # soft painterly edge that made the old enemies clash with Mercenaries.
    reduced = cell.resize((width, height), Image.Resampling.NEAREST)
    frame = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bounds = reduced.getchannel("A").getbbox()
    if bounds:
        alpha = reduced.getchannel("A")
        occupied_x = [index % width for index, value in enumerate(alpha.get_flattened_data()) if value]
        left, _top, right, bottom = bounds
        x = round((size - 1) / 2 - sum(occupied_x) / len(occupied_x))
        x = max(1 - left, min(size - 1 - right, x))
        y = size - 1 - bottom
    else:
        x, y = (size - width) // 2, size - height - 1
    frame.alpha_composite(reduced, (x, y))
    return frame


def portrait(cell: Image.Image) -> Image.Image:
    alpha = cell.getchannel("A")
    bounds = alpha.getbbox()
    cropped = cell.crop(bounds) if bounds else cell
    maximum = PORTRAIT_SIZE - 24
    ratio = min(maximum / cropped.width, maximum / cropped.height)
    artwork = cropped.resize(
        (max(1, round(cropped.width * ratio)), max(1, round(cropped.height * ratio))),
        Image.Resampling.LANCZOS,
    )
    result = Image.new("RGBA", (PORTRAIT_SIZE, PORTRAIT_SIZE), (0, 0, 0, 0))
    result.alpha_composite(artwork, ((PORTRAIT_SIZE - artwork.width) // 2, PORTRAIT_SIZE - artwork.height - 8))
    return result


def metadata(enemy_id: str, size: int) -> dict:
    tags = [
        {"name": "idle", "color": "62a0eaff", "from": 1, "to": 4},
        {"name": "run", "color": "62a0eaff", "from": 5, "to": 10},
        {"name": "hurt", "color": "62a0eaff", "from": 11, "to": 12},
        {"name": "defeat", "color": "62a0eaff", "from": 13, "to": 16},
    ]
    return {
        "pixelorama_version": "v1.2-stable", "pxo_version": 7,
        "size_x": size, "size_y": size, "color_mode": 5,
        "layers": [{
            "name": "selected-production-art", "visible": True, "locked": False,
            "blend_mode": 0, "clipping_mask": False, "opacity": 1,
            "parent": -1, "effects": [], "animated_params": "{}",
            "type": 0, "new_cels_linked": False,
        }],
        "frames": [{
            "cels": [{"opacity": 1, "z_index": 0, "ui_color": "(0.0, 0.0, 0.0, 0.0)"}],
            "duration": 1, "metadata": {},
        } for _ in range(FRAMES)],
        "tags": tags, "current_frame": 0, "current_layer": 0, "fps": 8,
        "export_directory_path": "", "export_file_name": enemy_id, "export_file_format": 0,
    }


def write_pxo(path: Path, project: dict, frames: list[Image.Image]) -> None:
    timestamp = (2026, 1, 1, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        entries: list[tuple[str, bytes]] = [
            ("data.json", json.dumps(project, separators=(",", ":")).encode()),
            ("mimetype", b"application/x-pixelorama"),
        ]
        entries.extend(
            (f"image_data/frames/{index}/layer_1", frame.tobytes())
            for index, frame in enumerate(frames, start=1)
        )
        for name, payload in entries:
            info = ZipInfo(name, timestamp)
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, payload)


def output_paths(root: Path) -> list[Path]:
    outputs: list[Path] = []
    for enemy_id in ENEMIES:
        outputs.extend([
            root / "public" / "assets" / "enemies" / enemy_id / f"{enemy_id}.png",
            root / "public" / "assets" / "enemies" / enemy_id / f"{enemy_id}.json",
            root / "assets-src" / "enemies" / enemy_id / "source" / f"{enemy_id}.pxo",
        ])
    outputs.extend([
        root / "public" / "assets" / "enemies" / "enemy-portraits-atlas.png",
        root / "public" / "assets" / "enemies" / "enemy-portraits-atlas.json",
        root / "assets-src" / "enemies" / "source" / "enemy-portraits-atlas.pxo",
    ])
    return outputs


def build(source_root: Path, output_root: Path) -> None:
    portraits: list[Image.Image] = []
    portrait_frames: dict[str, dict] = {}
    for index, (enemy_id, (size, filename)) in enumerate(ENEMIES.items()):
        source = selected_sheet(source_root, enemy_id, filename)
        with Image.open(source) as image:
            cells = source_cells(image)
        frames = [native_frame(cell, size) for cell in cells]
        sheet = Image.new("RGBA", (size * FRAMES, size), (0, 0, 0, 0))
        for frame_index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (frame_index * size, 0))
        runtime_dir = output_root / "public" / "assets" / "enemies" / enemy_id
        runtime_dir.mkdir(parents=True, exist_ok=True)
        sheet.save(runtime_dir / f"{enemy_id}.png", optimize=True)
        project = metadata(enemy_id, size)
        (runtime_dir / f"{enemy_id}.json").write_text(json.dumps(project, indent=2) + "\n")
        write_pxo(output_root / "assets-src" / "enemies" / enemy_id / "source" / f"{enemy_id}.pxo", project, frames)
        portraits.append(portrait(cells[0]))
        portrait_frames[f"enemy-portrait:{enemy_id}"] = {
            "frame": {"x": index * PORTRAIT_SIZE, "y": 0, "w": PORTRAIT_SIZE, "h": PORTRAIT_SIZE},
            "rotated": False, "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": PORTRAIT_SIZE, "h": PORTRAIT_SIZE},
            "sourceSize": {"w": PORTRAIT_SIZE, "h": PORTRAIT_SIZE},
        }

    atlas = Image.new("RGBA", (PORTRAIT_SIZE * len(portraits), PORTRAIT_SIZE), (0, 0, 0, 0))
    for index, artwork in enumerate(portraits):
        atlas.alpha_composite(artwork, (index * PORTRAIT_SIZE, 0))
    output = output_root / "public" / "assets" / "enemies" / "enemy-portraits-atlas.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output, optimize=True)
    atlas_json = {
        "export_directory_path": "", "export_file_name": "enemy-portraits-atlas",
        "size_x": atlas.width, "size_y": atlas.height, "frames": portrait_frames,
    }
    output.with_suffix(".json").write_text(json.dumps(atlas_json, indent=2) + "\n")
    portrait_project = {
        "pixelorama_version": "v1.2-stable", "pxo_version": 7,
        "size_x": atlas.width, "size_y": atlas.height, "color_mode": 5,
        "layers": [{"name": "selected enemy portraits", "visible": True, "locked": False,
                    "blend_mode": 0, "clipping_mask": False, "opacity": 1, "parent": -1,
                    "effects": [], "animated_params": "{}", "type": 0, "new_cels_linked": False}],
        "frames": [{"cels": [{"opacity": 1, "z_index": 0, "ui_color": "(0.0, 0.0, 0.0, 0.0)"}],
                    "duration": 1, "metadata": {}}],
        "tags": {}, "current_frame": 0, "current_layer": 0, "fps": 8,
        "export_directory_path": "", "export_file_name": "enemy-portraits-atlas", "export_file_format": 0,
    }
    write_pxo(output_root / "assets-src" / "enemies" / "source" / "enemy-portraits-atlas.pxo", portrait_project, [atlas])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--root", type=Path, default=ROOT, help=argparse.SUPPRESS)
    args = parser.parse_args()
    root = args.root.resolve()
    if not args.check:
        build(root, root)
        return
    with TemporaryDirectory(prefix="meow-enemies-") as directory:
        generated = Path(directory)
        build(root, generated)
        changed = [
            str(expected.relative_to(root))
            for expected in output_paths(root)
            if not expected.is_file()
            or expected.read_bytes() != (generated / expected.relative_to(root)).read_bytes()
        ]
    if changed:
        raise SystemExit("enemy production art is stale: " + ", ".join(changed))


if __name__ == "__main__":
    main()
