#!/usr/bin/env python3
"""Deterministically turn the selected Junkyard concept board into native assets.

external-production-importer: the checked-in selected raster is the art source;
this script owns its repeatable crop, native-size reduction, PNG metadata, and
editable Pixelorama packaging. It never regenerates or repaints the concept.
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
MASTER = ROOT / "assets-src/world/junkyard/concepts/junkyard-world-kit-selected.png"
SELECTED_MASTER_SHA256 = "fafbd2d1663868f6f47e691108fc536555e0a2dcaf51ca52b652456a711e6dee"


@dataclass(frozen=True)
class Asset:
    name: str
    row: int
    column: int
    size: int
    fill: bool = False


ASSETS = (
    Asset("junkyard-floor-base", 0, 0, 32, True),
    Asset("junkyard-floor-patch-a", 0, 1, 32, True),
    Asset("junkyard-floor-patch-b", 0, 2, 32, True),
    Asset("junkyard-boundary-straight", 0, 3, 64),
    Asset("junkyard-boundary-corner", 0, 4, 64),
    Asset("junkyard-boundary-patch", 1, 0, 64),
    Asset("junkyard-boundary-gate", 1, 1, 64),
    Asset("prop-tyre-pile", 1, 2, 96),
    Asset("prop-crate", 1, 3, 96),
    Asset("prop-engine-block", 1, 4, 96),
    Asset("prop-scrap-heap", 2, 0, 96),
    Asset("prop-oil-stain", 2, 1, 96),
    Asset("prop-warning-sign", 2, 2, 96),
    Asset("landmark-hanging-press", 2, 3, 128),
    Asset("landmark-barrel-power-stack", 2, 4, 128),
)


def paths(asset: Asset) -> tuple[Path, Path, Path]:
    directory = ROOT / "public/assets/world" / asset.name
    source = ROOT / "assets-src/world" / asset.name / "source" / f"{asset.name}.pxo"
    return directory / f"{asset.name}.png", directory / f"{asset.name}.json", source


def trim(cell: Image.Image) -> Image.Image:
    alpha = cell.getchannel("A").point(lambda value: 255 if value > 16 else 0)
    bounds = alpha.getbbox()
    if bounds is None:
        raise RuntimeError("selected Junkyard concept contains an empty grid cell")
    return cell.crop(bounds)


def render(master: Image.Image, asset: Asset) -> Image.Image:
    left = round(asset.column * master.width / 5)
    right = round((asset.column + 1) * master.width / 5)
    top = round(asset.row * master.height / 3)
    bottom = round((asset.row + 1) * master.height / 3)
    cropped = trim(master.crop((left, top, right, bottom)))
    if asset.fill:
        # The concept shows a 3x3 material swatch. Runtime already repeats one
        # image per 32px world cell, so importing the whole swatch would create
        # nine tiny plates inside every gameplay tile. Select its central plate
        # to preserve authored material while keeping the arena quiet/readable.
        third_x = cropped.width // 3
        third_y = cropped.height // 3
        cropped = cropped.crop((third_x, third_y, cropped.width - third_x, cropped.height - third_y))
        output = cropped.resize((asset.size, asset.size), Image.Resampling.LANCZOS)
    else:
        margin = max(2, asset.size // 20)
        cropped.thumbnail((asset.size - margin * 2, asset.size - margin * 2), Image.Resampling.LANCZOS)
        output = Image.new("RGBA", (asset.size, asset.size))
        output.alpha_composite(cropped, ((asset.size - cropped.width) // 2, (asset.size - cropped.height) // 2))
    # Recover crisp material seams after the native-grid reduction without
    # inventing pixels or changing the selected silhouette.
    output = ImageEnhance.Contrast(output).enhance(1.04)
    return output.filter(ImageFilter.UnsharpMask(radius=0.65, percent=65, threshold=3))


def png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True, compress_level=9)
    return output.getvalue()


def metadata_bytes(asset: Asset) -> bytes:
    data = {
        "color_mode": 5,
        "current_frame": 0,
        "current_layer": 0,
        "export_directory_path": "",
        "export_file_format": 0,
        "export_file_name": asset.name,
        "fps": 8,
        "frames": [{"cels": [{"opacity": 1, "ui_color": "(0.0, 0.0, 0.0, 0.0)", "z_index": 0}], "duration": 1}],
        "layers": [{
            "animated_params": "{}", "blend_mode": 0, "clipping_mask": False,
            "effects": [], "locked": False, "name": "selected concept crop",
            "new_cels_linked": False, "opacity": 1, "parent": -1, "type": 0,
            "ui_color": "(0.0, 0.0, 0.0, 0.0)", "visible": True,
        }],
        "pixelorama_version": "v1.2-stable",
        "pxo_version": 7,
        "size_x": asset.size,
        "size_y": asset.size,
        "tags": [],
    }
    return json.dumps(data, separators=(",", ":"), sort_keys=True).encode()


def pxo_bytes(asset: Asset, image: Image.Image) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, payload in (
            ("mimetype", b"application/x-pixelorama"),
            ("data.json", metadata_bytes(asset)),
            ("image_data/frames/1/layer_1", image.tobytes()),
        ):
            info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, payload)
    return output.getvalue()


def main() -> None:
    check = "--check" in sys.argv
    actual = hashlib.sha256(MASTER.read_bytes()).hexdigest()
    if actual != SELECTED_MASTER_SHA256:
        raise SystemExit(
            "selected Junkyard master digest mismatch: "
            f"expected {SELECTED_MASTER_SHA256}, got {actual}"
        )
    master = Image.open(MASTER).convert("RGBA")
    failures: list[str] = []
    for asset in ASSETS:
        image = render(master, asset)
        export_path, metadata_path, source_path = paths(asset)
        expected = ((export_path, png_bytes(image)), (metadata_path, metadata_bytes(asset)), (source_path, pxo_bytes(asset, image)))
        for path, payload in expected:
            if check:
                if not path.exists() or path.read_bytes() != payload:
                    failures.append(str(path.relative_to(ROOT)))
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(payload)
    if failures:
        raise SystemExit("Junkyard concept exports are out of date: " + ", ".join(failures))
    print(f"{'Checked' if check else 'Built'} {len(ASSETS)} Junkyard concept assets")


if __name__ == "__main__":
    main()
