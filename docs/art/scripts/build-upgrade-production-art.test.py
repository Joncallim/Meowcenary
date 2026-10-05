#!/usr/bin/env python3
"""Focused candidate-to-Lua/PXO parity and corruption-detection checks."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = Path(__file__).with_name("build-upgrade-production-art.py")
spec = importlib.util.spec_from_file_location("upgrade_art_importer", SCRIPT)
importer = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(importer)


class UpgradeProductionArtTest(unittest.TestCase):
    def test_all_candidate_sources_reproduce_lua_and_native_project_pixels(self) -> None:
        manifest = importer.load_manifest(ROOT)
        importer.verify_manifest_and_bindings(ROOT, manifest)
        for row in manifest["candidates"]:
            with self.subTest(upgrade=row["id"]):
                pixels, _ = importer.load_pixels(ROOT, row)
                importer.verify_builder(ROOT, row["id"], pixels)
                project = ROOT / f"assets-src/upgrade-icons/upgrade-icon-{row['id']}/source/upgrade-icon-{row['id']}.pxo"
                importer.verify_native_project(project, pixels, row["id"])

    def test_red_corruption_probe_rejects_changed_candidate_pixel_in_builder(self) -> None:
        manifest = importer.load_manifest(ROOT)
        row = manifest["candidates"][0]
        pixels, _ = importer.load_pixels(ROOT, row)
        source = importer.lua_builder(row["id"], pixels)
        encoded = pixels.hex()
        pixel_offset = next(offset for offset in range(0, len(pixels), 4) if pixels[offset + 3] > 0) * 2
        chunk_start = (pixel_offset // 120) * 120
        chunk = encoded[chunk_start:chunk_start + 120]
        at = pixel_offset - chunk_start
        altered = chunk[:at] + ("0" if chunk[at] != "0" else "1") + chunk[at + 1:]
        needle = f'"{chunk}"'
        self.assertIn(needle, source)
        corrupted = source.replace(needle, f'"{altered}"', 1)

        with tempfile.TemporaryDirectory(prefix="upgrade-art-red-") as temp:
            root = Path(temp)
            builder = root / f"docs/art/scripts/build-upgrade-icon-{row['id']}.lua"
            builder.parent.mkdir(parents=True)
            builder.write_text(source)
            importer.verify_builder(root, row["id"], pixels)
            builder.write_text(corrupted)
            with self.assertRaisesRegex(ValueError, "does not reproduce the pinned candidate RGBA bytes"):
                importer.verify_builder(root, row["id"], pixels)

    def test_red_corruption_probe_rejects_changed_runtime_png_pixel(self) -> None:
        manifest = importer.load_manifest(ROOT)
        row = manifest["candidates"][0]
        pixels, _ = importer.load_pixels(ROOT, row)
        image = Image.frombytes("RGBA", importer.SIZE, pixels)
        point = next((i % 48, i // 48) for i in range(48 * 48) if pixels[i * 4 + 3] > 0)
        red, green, blue, alpha = image.getpixel(point)
        image.putpixel(point, ((red + 1) % 256, green, blue, alpha))
        with tempfile.TemporaryDirectory(prefix="upgrade-runtime-red-") as temp:
            path = Path(temp) / "corrupt.png"
            image.save(path, format="PNG")
            with self.assertRaisesRegex(ValueError, "runtime PNG pixels differ"):
                importer.verify_runtime_png(path, pixels, row["id"])

    def test_red_corruption_probe_rejects_changed_native_pxo_cel(self) -> None:
        manifest = importer.load_manifest(ROOT)
        row = manifest["candidates"][0]
        pixels, _ = importer.load_pixels(ROOT, row)
        source = ROOT / f"assets-src/upgrade-icons/upgrade-icon-{row['id']}/source/upgrade-icon-{row['id']}.pxo"
        with tempfile.TemporaryDirectory(prefix="upgrade-pxo-red-") as temp:
            target = Path(temp) / "corrupt.pxo"
            with ZipFile(source) as original, ZipFile(target, "w", ZIP_DEFLATED) as corrupted:
                for member in original.namelist():
                    data = original.read(member)
                    if member == "image_data/frames/1/layer_1":
                        damaged = bytearray(data)
                        index = next(i for i in range(3, len(damaged), 4) if damaged[i] > 0)
                        damaged[index - 3] = (damaged[index - 3] + 1) % 256
                        data = bytes(damaged)
                    corrupted.writestr(member, data)
            with self.assertRaisesRegex(ValueError, "native project cels do not match"):
                importer.verify_native_project(target, pixels, row["id"])

    def test_red_corruption_probe_rejects_hidden_native_body_layer(self) -> None:
        manifest = importer.load_manifest(ROOT)
        row = manifest["candidates"][0]
        pixels, _ = importer.load_pixels(ROOT, row)
        source = ROOT / f"assets-src/upgrade-icons/upgrade-icon-{row['id']}/source/upgrade-icon-{row['id']}.pxo"
        with tempfile.TemporaryDirectory(prefix="upgrade-pxo-visibility-red-") as temp:
            target = Path(temp) / "hidden-body.pxo"
            with ZipFile(source) as original, ZipFile(target, "w", ZIP_DEFLATED) as corrupted:
                for member in original.namelist():
                    data = original.read(member)
                    if member == "data.json":
                        project = json.loads(data)
                        project["layers"][0]["visible"] = False
                        data = json.dumps(project).encode()
                    corrupted.writestr(member, data)
            with self.assertRaisesRegex(ValueError, "body layer must be visible"):
                importer.verify_native_project(target, pixels, row["id"])


if __name__ == "__main__":
    unittest.main()
