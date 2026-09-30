#!/usr/bin/env python3
"""Import approved chapter backdrops into deterministic mobile runtime art."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from PIL import Image


CHAPTERS = ("junkyard", "forge")
SOURCE_SIZE = (1536, 1024)
RUNTIME_SIZE = (768, 512)
ZIP_DATE = (2020, 1, 1, 0, 0, 0)
SELECTED_SHA256 = {
    "junkyard": "608bf29683d87cd11883aea08060c87bbac261bb79f312338af4b21096dbd1d0",
    "forge": "625c7535279006a4c4c15a8bf9ca2ec2cd18b7865ddac62a5b20748ab10ac79e",
}


def sources(root: Path) -> dict[str, Image.Image]:
    result: dict[str, Image.Image] = {}
    for chapter in CHAPTERS:
        path = root / f"assets-src/ui/concepts/menu-backdrop-{chapter}-selected.png"
        if hashlib.sha256(path.read_bytes()).hexdigest() != SELECTED_SHA256[chapter]:
            raise SystemExit(f"selected {chapter} menu backdrop digest mismatch")
        image = Image.open(path).convert("RGBA")
        if image.size != SOURCE_SIZE:
            raise SystemExit(f"selected {chapter} menu backdrop changed size: {image.size}")
        result[chapter] = image
    return result


def zip_member(archive: ZipFile, name: str, data: bytes) -> None:
    member = ZipInfo(name, ZIP_DATE)
    member.compress_type = ZIP_DEFLATED
    member.external_attr = 0o100644 << 16
    archive.writestr(member, data)


def write(root: Path, output: Path) -> None:
    selected = sources(root)
    runtime = output / "public/assets/ui/backdrops"
    editable = output / "assets-src/ui"
    runtime.mkdir(parents=True, exist_ok=True)
    editable.mkdir(parents=True, exist_ok=True)
    for chapter, image in selected.items():
        resized = image.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS).convert("RGBA")
        name = f"menu-{chapter}"
        resized.convert("RGB").save(runtime / f"{name}.png", "PNG", optimize=True)
        project = {
            "color_mode": 5,
            "current_frame": 0,
            "current_layer": 0,
            "export_directory_path": "",
            "export_file_format": 0,
            "export_file_name": name,
            "fps": 8,
            "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
            "layers": [{
                "animated_params": "{}", "blend_mode": 0, "clipping_mask": False, "effects": {},
                "locked": False, "name": "selected generated backdrop", "new_cels_linked": False,
                "opacity": 1, "parent": -1, "type": 0, "visible": True,
            }],
            "pixelorama_version": "v1.2-stable", "pxo_version": 7,
            "size_x": resized.width, "size_y": resized.height, "tags": {},
        }
        (runtime / f"{name}.json").write_text(json.dumps(project, indent=2) + "\n")
        source_path = editable / "backdrops/source" / f"{name}.pxo"
        source_path.parent.mkdir(parents=True, exist_ok=True)
        with ZipFile(source_path, "w") as archive:
            zip_member(archive, "mimetype", b"application/x-pixelorama")
            zip_member(archive, "data.json", (json.dumps(project, separators=(",", ":")) + "\n").encode())
            zip_member(archive, "image_data/frames/1/layer_1", resized.tobytes())


def check(root: Path) -> None:
    with TemporaryDirectory(prefix="meow-backdrops-") as directory:
        generated = Path(directory)
        write(root, generated)
        for relative in tuple(
            path
            for chapter in CHAPTERS
            for path in (
                f"public/assets/ui/backdrops/menu-{chapter}.png",
                f"public/assets/ui/backdrops/menu-{chapter}.json",
                f"assets-src/ui/backdrops/source/menu-{chapter}.pxo",
            )
        ):
            if (root / relative).read_bytes() != (generated / relative).read_bytes():
                raise SystemExit(f"Menu backdrop output is out of date: {relative}")


if __name__ == "__main__":
    repository = Path(__file__).resolve().parents[3]
    if sys.argv[1:] == ["--check"]:
        check(repository)
    elif sys.argv[1:]:
        raise SystemExit("Usage: build-menu-backdrops.py [--check]")
    else:
        write(repository, repository)
