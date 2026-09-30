#!/usr/bin/env python3
"""Build runtime derivatives from the approved Figma Clean Master export."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "assets-src/ui/brand/source/meowcenary-primary-logo-clean-master.png"
EXPECTED_SOURCE_SHA256 = "915d0e51649c6d19d3a6a5da8789a3949a5d9afc32a890a31fe266aaae65d99b"
OUTPUT = ROOT / "public/assets/ui/brand"


def tight_crop(image: Image.Image, box: tuple[int, int, int, int], padding: int = 4) -> Image.Image:
    selected = image.crop(box)
    bounds = selected.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("approved brand derivative is empty")
    left, top, right, bottom = bounds
    return selected.crop((max(0, left - padding), max(0, top - padding),
                          min(selected.width, right + padding), min(selected.height, bottom + padding)))


def fit_square(image: Image.Image, size: int) -> Image.Image:
    ratio = min((size - 8) / image.width, (size - 8) / image.height)
    scaled = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return result


def write_pxo(path: Path, image: Image.Image, export_name: str) -> None:
    project = {
        "pixelorama_version": "v1.2-stable", "pxo_version": 7,
        "size_x": image.width, "size_y": image.height, "color_mode": 5,
        "layers": [{"name": "approved Figma Clean Master", "visible": True, "locked": False,
                    "blend_mode": 0, "clipping_mask": False, "opacity": 1, "parent": -1,
                    "effects": [], "animated_params": "{}", "type": 0, "new_cels_linked": False}],
        "frames": [{"cels": [{"opacity": 1, "z_index": 0, "ui_color": "(0.0, 0.0, 0.0, 0.0)"}],
                    "duration": 1, "metadata": {}}],
        "tags": {}, "current_frame": 0, "current_layer": 0, "fps": 8,
        "export_directory_path": "", "export_file_name": export_name,
        "export_file_format": 0,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        for name, payload in [
            ("data.json", json.dumps(project, separators=(",", ":")).encode()),
            ("mimetype", b"application/x-pixelorama"),
            ("image_data/frames/1/layer_1", image.tobytes()),
        ]:
            info = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, payload)


def source_metadata(name: str, image: Image.Image) -> str:
    return json.dumps({
        "export_directory_path": "", "export_file_name": name,
        "size_x": image.width, "size_y": image.height,
        "frames": [{"cels": [{"opacity": 1}], "duration": 1}],
        "layers": [{"name": "approved Figma Clean Master", "visible": True}],
        "tags": [],
    }, indent=2) + "\n"


def build(output: Path, editable_source_directory: Path) -> None:
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("approved Figma Clean Master export changed without provenance review")
    master = Image.open(SOURCE).convert("RGBA")
    primary = tight_crop(master, (0, 0, master.width, master.height))
    title = tight_crop(master, (0, 467, master.width, master.height))
    emblem = tight_crop(master, (195, 0, 709, 456))
    monochrome = primary.copy()
    monochrome.putdata([
        (229, 216, 197, pixel[3]) if pixel[3] else (0, 0, 0, 0)
        for pixel in monochrome.get_flattened_data()
    ])
    output.mkdir(parents=True, exist_ok=True)
    derivatives = {
        "meowcenary-primary-logo.png": primary,
        "meowcenary-title-lockup.png": title,
        "meowcenary-emblem.png": emblem,
        "meowcenary-monochrome.png": monochrome,
        "meowcenary-browser-icon.png": fit_square(emblem, 128),
    }
    for name, image in derivatives.items():
        image.save(output / name, optimize=True)
        if name != "meowcenary-browser-icon.png":
            stem = Path(name).stem
            (output / f"{stem}.json").write_text(source_metadata(stem, image))
            write_pxo(editable_source_directory / f"{stem}.pxo", image, stem)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        build(OUTPUT, ROOT / "assets-src/ui/brand/source")
        return
    with TemporaryDirectory() as directory:
        candidate = Path(directory)
        candidate_source = candidate / "source"
        build(candidate, candidate_source)
        stale = [path.name for path in candidate.iterdir()
                 if path != candidate_source
                 if not (OUTPUT / path.name).exists() or path.read_bytes() != (OUTPUT / path.name).read_bytes()]
        live_source = ROOT / "assets-src/ui/brand/source"
        for path in candidate_source.iterdir():
            if not (live_source / path.name).exists() or path.read_bytes() != (live_source / path.name).read_bytes():
                stale.append(str((live_source / path.name).relative_to(ROOT)))
    if stale:
        raise SystemExit("approved brand runtime assets are stale: " + ", ".join(sorted(stale)))


if __name__ == "__main__":
    main()
