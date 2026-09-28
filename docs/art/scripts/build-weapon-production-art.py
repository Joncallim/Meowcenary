#!/usr/bin/env python3
"""Derive live held weapons and menu icons from approved assembled-gun art."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image, ImageEnhance

sys.dont_write_bytecode = True


ROOT = Path(__file__).resolve().parents[3]
SIZE = (32, 20)
ZIP_DATE = (2026, 1, 1, 0, 0, 0)
FAMILIES = ("pistol", "smg", "shotgun")


def approved_bases(root: Path) -> dict[str, Image.Image]:
    path = root / "docs/art/scripts/build-gun-build-concept-atlas.py"
    spec = importlib.util.spec_from_file_location("meow_gun_build", path)
    if spec is None or spec.loader is None:
        raise SystemExit("cannot load assembled weapon importer")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    atlas = module.render(root)
    return {family: atlas.crop((index * 96, 0, (index + 1) * 96, 48)) for index, family in enumerate(FAMILIES)}


def frame_for(base: Image.Image, tier: int) -> Image.Image:
    bounds = base.getchannel("A").getbbox()
    if bounds is None:
        raise SystemExit("approved assembled weapon base is empty")
    art = base.crop(bounds)
    if tier == 2:
        art = ImageEnhance.Contrast(ImageEnhance.Color(art).enhance(1.08)).enhance(1.08)
    elif tier == 3:
        art = ImageEnhance.Brightness(ImageEnhance.Color(art).enhance(1.14)).enhance(1.08)
    art.thumbnail((30, 18), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    frame.alpha_composite(art, ((SIZE[0] - art.width) // 2, (SIZE[1] - art.height) // 2))
    return frame


def project(name: str) -> bytes:
    return (json.dumps({
        "color_mode": 5, "current_frame": 0, "current_layer": 0,
        "export_directory_path": "", "export_file_format": 0, "export_file_name": name, "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{"animated_params": "{}", "blend_mode": 0, "clipping_mask": False, "effects": {},
                    "locked": False, "name": "approved assembled weapon art", "new_cels_linked": False,
                    "opacity": 1, "parent": -1, "type": 0, "visible": True}],
        "pixelorama_version": "v1.2-stable", "pxo_version": 7,
        "size_x": SIZE[0], "size_y": SIZE[1], "tags": {},
    }, separators=(",", ":")) + "\n").encode()


def add_member(archive: ZipFile, name: str, payload: bytes) -> None:
    info = ZipInfo(name, ZIP_DATE)
    info.compress_type = ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, payload)


def emit(output: Path, group: str, name: str, art: Image.Image) -> None:
    runtime = output / f"public/assets/{group}/{name}"
    source = output / f"assets-src/{group}/{name}/source"
    runtime.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    art.save(runtime / f"{name}.png", optimize=True)
    (runtime / f"{name}.json").write_bytes(project(name))
    with ZipFile(source / f"{name}.pxo", "w") as archive:
        add_member(archive, "mimetype", b"application/x-pixelorama")
        add_member(archive, "data.json", project(name))
        add_member(archive, "image_data/frames/1/layer_1", art.tobytes())


def write(root: Path, output: Path) -> None:
    for family, base in approved_bases(root).items():
        for tier in (1, 2, 3):
            art = frame_for(base, tier)
            emit(output, "held-weapons", f"weapon-held-{family}-t{tier}", art)
            emit(output, "weapon-icons", f"weapon-icon-{family}-t{tier}", art)


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-weapon-art-") as directory:
        generated = Path(directory)
        write(root, generated)
        for family in FAMILIES:
            for tier in (1, 2, 3):
                for group, prefix in (("held-weapons", "weapon-held"), ("weapon-icons", "weapon-icon")):
                    name = f"{prefix}-{family}-t{tier}"
                    for suffix in (f"public/assets/{group}/{name}/{name}.png",
                                   f"public/assets/{group}/{name}/{name}.json",
                                   f"assets-src/{group}/{name}/source/{name}.pxo"):
                        if (root / suffix).read_bytes() != (generated / suffix).read_bytes():
                            raise SystemExit(f"weapon art output is out of date: {suffix}")


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        check(ROOT)
    elif sys.argv[1:]:
        raise SystemExit("Usage: build-weapon-production-art.py [--check]")
    else:
        write(ROOT, ROOT)
