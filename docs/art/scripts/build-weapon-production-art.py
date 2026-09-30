#!/usr/bin/env python3
"""Import pinned native candidate weapon tier masters; never synthesize tiers."""

from __future__ import annotations

import hashlib
import math
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

import PIL
from PIL import Image

sys.dont_write_bytecode = True


ROOT = Path(__file__).resolve().parents[3]
SIZE = (128, 80)
ZIP_DATE = (2026, 1, 1, 0, 0, 0)
FAMILIES = ("pistol", "smg", "shotgun")


CONFIG = "assets-src/weapons/tiers/masters.json"
GROUPS = (("held-weapons", "weapon-held"), ("weapon-icons", "weapon-icon"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def safe_path(root: Path, relative: str, boundary: str = "") -> Path:
    require(isinstance(relative, str) and not Path(relative).is_absolute()
            and ".." not in Path(relative).parts, "weapon art path must be relative without traversal")
    limit = (root / boundary).resolve()
    path = root / relative
    require(limit.is_relative_to(root.resolve()) and path.resolve().is_relative_to(limit),
            "weapon art path escapes its directory")
    return path


def silhouette_distance(first: Image.Image, second: Image.Image, size: tuple[int, int]) -> float:
    masks = [image.resize(size, Image.Resampling.NEAREST).getchannel("A").point(lambda n: 255 if n >= 16 else 0)
             for image in (first, second)]
    pairs = list(zip(masks[0].get_flattened_data(), masks[1].get_flattened_data()))
    union = sum(bool(a or b) for a, b in pairs)
    return sum(bool(a) != bool(b) for a, b in pairs) / union if union else 0


def validate_tier_silhouettes(frames: list[Image.Image]) -> None:
    for size in ((28, 18), (44, 28)):
        for first, second in zip(frames, frames[1:]):
            require(silhouette_distance(first, second, size) >= 0.04,
                    f"weapon adjacent tiers are structurally indistinct at {size[0]}px")


def render(root: Path) -> dict[str, list[Image.Image]]:
    config = json.loads(safe_path(root, CONFIG, "assets-src/weapons").read_text())
    require(config["schemaVersion"] == 1 and config["status"] == "candidate", "invalid weapon master config")
    require(config["Pillow"] == PIL.__version__ == "12.1.1", "weapon importer requires pinned Pillow 12.1.1")
    require(config["alphaBoundsThreshold"] == 16 and config["frameSize"] == list(SIZE), "invalid weapon raster contract")
    require([row["familyId"] for row in config["families"]] == list(FAMILIES), "weapon family coverage must be exact")
    bindings = json.loads((root / "src/data/visual-art.json").read_text())["bindings"]
    expected = {f"{prefix}:{family}:t{tier}" for family in FAMILIES for tier in (1, 2, 3)
                for prefix in ("weapon-held", "weapon-icon")}
    actual = [row["id"] for row in bindings if row["kind"] in ("weapon-held", "weapon-icon")]
    require(set(actual) == expected and len(actual) == len(expected), "weapon logical tier coverage differs from production catalog")
    result = {}
    for family in config["families"]:
        path = safe_path(root, family["path"], "assets-src/weapons/tiers/candidates")
        require(path.suffix == ".png", "weapon master must have PNG extension")
        payload = path.read_bytes()
        require(hashlib.sha256(payload).hexdigest() == family["sha256"], "weapon master digest mismatch")
        with Image.open(path) as original:
            require(original.format == "PNG" and original.mode == "RGBA" and list(original.size) == family["size"],
                    "weapon master must be pinned RGBA PNG dimensions")
            master = original.copy()
        meaningful = master.getchannel("A").point(lambda n: 255 if n >= 16 else 0)
        bounds = meaningful.getbbox()
        require(bounds and bounds[0] > 0 and bounds[1] > 0 and bounds[2] < master.width and bounds[3] < master.height,
                "weapon master has meaningful alpha crossing its outer edge")
        require(len(family["cropRects"]) == len(family["gripAnchors"]) == 3, "weapon master needs exactly three authored tiers")
        uncovered = meaningful.copy()
        occupied = set()
        crops = []
        for rect, anchor in zip(family["cropRects"], family["gripAnchors"]):
            require(len(rect) == 4 and all(type(n) is int for n in rect), "invalid weapon crop rectangle")
            left, top, right, bottom = rect
            require(0 <= left < right <= master.width and 0 <= top < bottom <= master.height, "weapon crop outside master")
            require(len(anchor) == 2 and all(type(n) in (int, float) and math.isfinite(n) for n in anchor)
                    and left < anchor[0] < right and top < anchor[1] < bottom, "weapon grip anchor outside crop")
            require(meaningful.crop(tuple(rect)).getbbox() == (0, 0, right-left, bottom-top), "weapon crop must bound the complete authored alpha component")
            require(not any(x in occupied for x in range(left, right)), "weapon crop rectangles overlap")
            occupied.update(range(left, right))
            uncovered.paste(0, tuple(rect))
            crops.append((master.crop(tuple(rect)), (anchor[0]-left, anchor[1]-top)))
        require(uncovered.getbbox() is None, "weapon crop coverage loses meaningful source pixels")
        tx, ty = config["targetGripAnchor"]
        gutter = config["gutter"]
        require(gutter == 4 and [tx, ty] == [32, 48], "invalid weapon shared anchor/gutter")
        scale = min(family["maxWidth"] / max(crop.width for crop, _ in crops),
                    *(limit for crop, (ax, ay) in crops for limit in
                      ((tx-gutter)/ax, (SIZE[0]-gutter-tx)/(crop.width-ax),
                       (ty-gutter)/ay, (SIZE[1]-gutter-ty)/(crop.height-ay))))
        frames = []
        for crop, (ax, ay) in crops:
            art = crop.resize((max(1, round(crop.width*scale)), max(1, round(crop.height*scale))), Image.Resampling.NEAREST)
            x, y = round(tx-ax*scale), round(ty-ay*scale)
            require(x >= gutter and y >= gutter and x+art.width <= SIZE[0]-gutter and y+art.height <= SIZE[1]-gutter,
                    "weapon import clips authored shape or gutter")
            frame = Image.new("RGBA", SIZE, (0, 0, 0, 0))
            frame.alpha_composite(art, (x, y))
            frames.append(frame)
        validate_tier_silhouettes(frames)
        result[family["familyId"]] = frames
    return result


def project(name: str) -> bytes:
    return (json.dumps({
        "color_mode": 5, "current_frame": 0, "current_layer": 0,
        "export_directory_path": "", "export_file_format": 0, "export_file_name": name, "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{"animated_params": "{}", "blend_mode": 0, "clipping_mask": False, "effects": {},
                    "locked": False, "name": "candidate native weapon tier import", "new_cels_linked": False,
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
    runtime = safe_path(output, f"public/assets/{group}/{name}")
    source = safe_path(output, f"assets-src/{group}/{name}/source")
    for relative in (f"public/assets/{group}/{name}/{name}.png",
                     f"public/assets/{group}/{name}/{name}.json",
                     f"assets-src/{group}/{name}/source/{name}.pxo"):
        safe_path(output, relative)
    runtime.mkdir(parents=True, exist_ok=True)
    source.mkdir(parents=True, exist_ok=True)
    art.save(runtime / f"{name}.png", optimize=True)
    (runtime / f"{name}.json").write_bytes(project(name))
    with ZipFile(source / f"{name}.pxo", "w") as archive:
        add_member(archive, "mimetype", b"application/x-pixelorama")
        add_member(archive, "data.json", project(name))
        add_member(archive, "image_data/frames/1/layer_1", art.tobytes())


def write(root: Path, output: Path) -> None:
    frames = render(root)  # Validate every source/frame before publishing any output.
    for family, tiers in frames.items():
        for tier, art in enumerate(tiers, 1):
            for group, prefix in GROUPS:
                emit(output, group, f"{prefix}-{family}-t{tier}", art)


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
                        if safe_path(root, suffix).read_bytes() != (generated / suffix).read_bytes():
                            raise SystemExit(f"weapon art output is out of date: {suffix}")


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        check(ROOT)
    elif sys.argv[1:]:
        raise SystemExit("Usage: build-weapon-production-art.py [--check]")
    else:
        write(ROOT, ROOT)
