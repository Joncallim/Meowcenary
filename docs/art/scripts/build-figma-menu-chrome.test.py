#!/usr/bin/env python3
"""Focused source-security, deterministic-output and no-repair importer tests."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

from PIL import Image

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).with_name("build-figma-menu-chrome.py")
spec = importlib.util.spec_from_file_location("figma_importer", SCRIPT)
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class FigmaImporterTest(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory(prefix="meow-figma-import-test-")
        self.root = Path(self.directory.name) / "repo"
        shutil.copytree(importer.ROOT / "assets-src/ui/figma", self.root / "assets-src/ui/figma")
        self.config_path = self.root / importer.CONFIG
        self.config = json.loads(self.config_path.read_text())

    def tearDown(self):
        self.directory.cleanup()

    def save_config(self):
        self.config_path.write_text(json.dumps(self.config))

    def output_bytes(self):
        return {path: (self.root / path).read_bytes() if (self.root / path).exists() else None
                for path in importer.OUTPUTS}

    def reject_without_repair(self):
        before = self.output_bytes()
        with self.assertRaises((ValueError, OSError)):
            importer.check(self.root)
        self.assertEqual(self.output_bytes(), before)

    def repin(self, payload):
        source = self.config["sources"][0]
        (self.root / source["path"]).write_bytes(payload)
        source["sha256"] = hashlib.sha256(payload).hexdigest()
        self.save_config()

    def test_native_extents_frame_coverage_and_gutters(self):
        importer.write(self.root, self.root)
        meta = json.loads((self.root / importer.OUTPUTS[1]).read_text())
        self.assertEqual((meta["size_x"], meta["size_y"]), (965, 245))
        expected = [(2, 2, 174, 75), (180, 2, 354, 241), (538, 2, 220, 51),
                    (762, 2, 5, 5), (771, 2, 14, 20), (789, 2, 174, 129)]
        self.assertEqual(list(meta["frames"]), list(importer.IDS))
        self.assertEqual([tuple(row["frame"][key] for key in ("x", "y", "w", "h"))
                          for row in meta["frames"].values()], expected)
        with Image.open(self.root / importer.OUTPUTS[0]) as image:
            alpha = image.getchannel("A")
            for x, y, width, height in expected:
                self.assertIsNotNone(alpha.crop((x, y, x + width, y + height)).getbbox())
                self.assertIsNone(alpha.crop((x - 2, 0, x, image.height)).getbbox())
                self.assertIsNone(alpha.crop((x + width, 0, x + width + 2, image.height)).getbbox())

    def test_determinism_native_pxo_pixels_and_check(self):
        importer.write(self.root, self.root)
        first = self.output_bytes()
        importer.write(self.root, self.root)
        self.assertEqual(first, self.output_bytes())
        importer.check(self.root)
        with ZipFile(self.root / importer.OUTPUTS[2]) as archive, Image.open(self.root / importer.OUTPUTS[0]) as image:
            self.assertEqual(archive.namelist(), ["mimetype", "data.json", "image_data/frames/1/layer_1"])
            self.assertEqual(archive.read("mimetype"), b"application/x-pixelorama")
            self.assertEqual(archive.read("image_data/frames/1/layer_1"), image.convert("RGBA").tobytes())
            project = json.loads(archive.read("data.json"))
            self.assertEqual((project["size_x"], project["size_y"]), image.size)
            self.assertEqual(len(project["layers"]), 1)
            self.assertEqual(len(project["frames"]), 1)

    def test_each_missing_or_tampered_output_rejected_without_repair(self):
        importer.write(self.root, self.root)
        good = self.output_bytes()
        for relative in importer.OUTPUTS:
            with self.subTest(relative=relative):
                path = self.root / relative
                path.unlink()
                self.reject_without_repair()
                path.write_bytes(good[relative] + b"tamper")
                self.reject_without_repair()
                path.write_bytes(good[relative])

    def test_native_pxo_pixel_tamper_is_rejected(self):
        importer.write(self.root, self.root)
        path = self.root / importer.OUTPUTS[2]
        with ZipFile(path) as archive:
            rows = [(entry, archive.read(entry.filename)) for entry in archive.infolist()]
        with ZipFile(path, "w") as archive:
            for entry, data in rows:
                if entry.filename == "image_data/frames/1/layer_1":
                    data = bytes([data[0] ^ 1]) + data[1:]
                archive.writestr(entry, data)
        self.reject_without_repair()

    def test_source_digest_and_missing_source_rejected(self):
        importer.write(self.root, self.root)
        path = self.root / self.config["sources"][0]["path"]
        path.write_bytes(path.read_bytes() + b"\n")
        self.reject_without_repair()
        path.unlink()
        self.reject_without_repair()

    def test_wrong_mime_dimensions_and_exact_coverage_rejected(self):
        original = json.loads(self.config_path.read_text())
        edits = [lambda c: c["sources"][0].update(mime="text/html"),
                 lambda c: c["sources"][0]["root"].update(width="172"),
                 lambda c: c["frames"].pop(),
                 lambda c: c["sources"].append(c["sources"][0]),
                 lambda c: c["frames"][0]["layers"][0].update(offset=[4, 4]),
                 lambda c: c["rasterizer"].update(CairoSVG="0.0.0")]
        for edit in edits:
            with self.subTest(edit=edit):
                self.config = json.loads(json.dumps(original))
                edit(self.config)
                self.save_config()
                self.reject_without_repair()

    def test_traversal_absolute_and_file_symlink_paths_rejected(self):
        source = self.config["sources"][0]
        original = source["path"]
        for path in ("../source.svg", "/tmp/source.svg"):
            source["path"] = path
            self.save_config()
            self.reject_without_repair()
        source["path"] = original
        self.save_config()
        path = self.root / original
        outside = self.root.parent / "outside.svg"
        outside.write_bytes(path.read_bytes())
        path.unlink()
        path.symlink_to(outside)
        self.reject_without_repair()

    def test_entire_originals_symlink_escape_rejected(self):
        originals = self.root / "assets-src/ui/figma/originals"
        outside = self.root.parent / "outside-originals"
        originals.rename(outside)
        originals.symlink_to(outside, target_is_directory=True)
        self.reject_without_repair()

    def test_output_symlink_escape_is_not_accepted_or_written(self):
        importer.write(self.root, self.root)
        path = self.root / importer.OUTPUTS[0]
        outside = self.root.parent / "outside.png"
        outside.write_bytes(path.read_bytes())
        before = outside.read_bytes()
        path.unlink()
        path.symlink_to(outside)
        self.reject_without_repair()
        with self.assertRaises(ValueError):
            importer.write(self.root, self.root)
        self.assertEqual(outside.read_bytes(), before)

    def test_repinned_external_or_executable_svg_rejected(self):
        source = self.config["sources"][0]
        root = source["root"]
        forbidden = ['<image href="https://invalid.example/art.svg"/>',
                     '<use href="file:///tmp/source.svg"/>', '<script/>', '<foreignObject/>',
                     '<style>@import "https://invalid.example/style.css";</style>',
                     '<rect fill="url(https://invalid.example/fill.svg)"/>', '<g onclick="run()"/>']
        for element in forbidden:
            with self.subTest(element=element):
                payload = (f'<svg xmlns="{importer.SVG_NS}" width="{root["width"]}" '
                           f'height="{root["height"]}" viewBox="{root["viewBox"]}">{element}</svg>').encode()
                self.repin(payload)
                self.reject_without_repair()
        self.repin(b'<!DOCTYPE svg [<!ENTITY exploit "bad">]><svg/>')
        self.reject_without_repair()
        self.repin(b'<html/>')
        self.reject_without_repair()

    def test_invalid_late_frame_does_not_write_outputs(self):
        self.config["frames"][-1]["layers"][0]["offset"] = [999, 0]
        self.save_config()
        before = self.output_bytes()
        with self.assertRaises(ValueError):
            importer.write(self.root, self.root)
        self.assertEqual(self.output_bytes(), before)


if __name__ == "__main__":
    unittest.main()
