#!/usr/bin/env python3
"""Weapon import regressions inspect actual resources, not frame counts alone."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

from PIL import Image, ImageEnhance

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("weapon_import", Path(__file__).with_name("build-weapon-production-art.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def paths():
    for family in module.FAMILIES:
        for tier in (1, 2, 3):
            for group, prefix in module.GROUPS:
                name = f"{prefix}-{family}-t{tier}"
                yield (f"public/assets/{group}/{name}/{name}.png",
                       f"public/assets/{group}/{name}/{name}.json",
                       f"assets-src/{group}/{name}/source/{name}.pxo")


class WeaponImportTest(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory(prefix="meow-native-weapon-test-")
        self.root = Path(self.directory.name) / "repo"
        shutil.copytree(module.ROOT / "assets-src/weapons", self.root / "assets-src/weapons")
        target = self.root / "src/data/visual-art.json"
        target.parent.mkdir(parents=True)
        shutil.copyfile(module.ROOT / "src/data/visual-art.json", target)
        module.write(self.root, self.root)

    def tearDown(self):
        self.directory.cleanup()

    def bytes(self):
        return {relative: (self.root / relative).read_bytes() if (self.root / relative).exists() else None
                for triple in paths() for relative in triple}

    def rejects_without_repair(self):
        before = self.bytes()
        with self.assertRaises((ValueError, OSError, SystemExit)):
            module.check(self.root)
        self.assertEqual(self.bytes(), before)

    def test_every_live_resource_native_pixels_and_actual_size_silhouettes(self):
        for png, meta, pxo in paths():
            with self.subTest(resource=png), Image.open(module.ROOT / png) as image, ZipFile(module.ROOT / pxo) as archive:
                self.assertEqual(image.size, (128, 80))
                self.assertIsNotNone(image.getchannel("A").getbbox())
                self.assertEqual(archive.read("mimetype"), b"application/x-pixelorama")
                self.assertEqual(archive.read("image_data/frames/1/layer_1"), image.convert("RGBA").tobytes())
                project = json.loads(archive.read("data.json"))
                self.assertEqual((project["size_x"], project["size_y"]), image.size)
                self.assertEqual(json.loads((module.ROOT / meta).read_text()), project)
        for group, prefix in module.GROUPS:
            for family in module.FAMILIES:
                frames = [Image.open(module.ROOT / f"public/assets/{group}/{prefix}-{family}-t{tier}/{prefix}-{family}-t{tier}.png").convert("RGBA") for tier in (1, 2, 3)]
                module.validate_tier_silhouettes(frames)
                # Deliberately reproduce the old tint-only implementation.
                fake = [frames[0], ImageEnhance.Contrast(frames[0]).enhance(1.08),
                        ImageEnhance.Brightness(frames[0]).enhance(1.14)]
                with self.assertRaisesRegex(ValueError, "structurally indistinct"):
                    module.validate_tier_silhouettes(fake)

    def test_all_outputs_deterministic_and_check_accepts(self):
        before = self.bytes()
        module.write(self.root, self.root)
        self.assertEqual(self.bytes(), before)
        module.check(self.root)

    def test_every_runtime_png_tamper_is_rejected_without_repair(self):
        for png, _, _ in paths():
            path = self.root / png
            original = path.read_bytes()
            path.write_bytes(original + b"tamper")
            self.rejects_without_repair()
            path.write_bytes(original)

    def test_metadata_native_pixels_and_missing_output_rejected(self):
        png, meta, pxo = next(paths())
        for relative in (meta, pxo):
            path = self.root / relative
            original = path.read_bytes()
            if relative == meta:
                data = json.loads(original); data["size_x"] = 32
                path.write_text(json.dumps(data))
            else:
                with ZipFile(path) as archive:
                    members = [(entry, archive.read(entry.filename)) for entry in archive.infolist()]
                with ZipFile(path, "w") as archive:
                    for entry, payload in members:
                        if entry.filename == "image_data/frames/1/layer_1":
                            payload = bytes([payload[0] ^ 1]) + payload[1:]
                        archive.writestr(entry, payload)
            self.rejects_without_repair()
            path.write_bytes(original)
        (self.root / png).unlink()
        self.rejects_without_repair()

    def test_source_tamper_missing_pin_and_crop_loss_rejected(self):
        config_path = self.root / module.CONFIG
        config = json.loads(config_path.read_text())
        source = self.root / config["families"][0]["path"]
        original = source.read_bytes()
        source.write_bytes(original + b"tamper")
        self.rejects_without_repair()
        source.write_bytes(original)
        config["families"][0]["sha256"] = ""
        config_path.write_text(json.dumps(config))
        self.rejects_without_repair()
        config = json.loads((module.ROOT / module.CONFIG).read_text())
        config["families"][0]["cropRects"][0][2] -= 8
        config_path.write_text(json.dumps(config))
        self.rejects_without_repair()

    def test_source_and_output_symlink_escapes_rejected(self):
        config = json.loads((self.root / module.CONFIG).read_text())
        source = self.root / config["families"][0]["path"]
        outside = self.root.parent / "outside.png"
        outside.write_bytes(source.read_bytes()); source.unlink(); source.symlink_to(outside)
        self.rejects_without_repair()
        source.unlink(); shutil.copyfile(module.ROOT / config["families"][0]["path"], source)
        png, _, _ = next(paths()); path = self.root / png
        outside.write_bytes(path.read_bytes()); before = outside.read_bytes(); path.unlink(); path.symlink_to(outside)
        self.rejects_without_repair()
        with self.assertRaises(ValueError): module.write(self.root, self.root)
        self.assertEqual(outside.read_bytes(), before)

    def test_known_wrapper_runs_pinned_parity_gate(self):
        result = subprocess.run(["lua", "docs/art/scripts/validate-builders.lua", "--only",
                                 "docs/art/scripts/build-weapon-held-pistol-t1.lua"], cwd=module.ROOT,
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("external importer source contract", result.stdout)

    def test_wrapper_rejects_wrong_physical_size_or_missing_external_pins(self):
        scripts = ["docs/art/scripts/validate-builders.lua", "docs/art/scripts/emit-builder-contracts.mjs",
                   "docs/art/scripts/lib/visual-manifest.mjs", "docs/art/scripts/build-weapon-production-art.py"]
        scripts += [f"docs/art/scripts/build-{prefix}-{family}-t{tier}.lua"
                    for _, prefix in module.GROUPS for family in module.FAMILIES for tier in (1, 2, 3)]
        for relative in scripts:
            target = self.root / relative; target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(module.ROOT / relative, target)
        resources = json.loads((module.ROOT / "src/data/visual-resources.json").read_text())
        (self.root / "src/data/visual-resources.json").write_text(json.dumps([
            row for row in resources if row["id"].startswith(("resource:weapon-held-", "resource:weapon-icon-"))]))
        art_path = self.root / "src/data/visual-art.json"
        art = json.loads(art_path.read_text()); art["bindings"] = [row for row in art["bindings"]
            if row["kind"] in ("weapon-icon", "weapon-held")]; art_path.write_text(json.dumps(art))
        def gate():
            return subprocess.run(["lua", scripts[0], "--only", "docs/art/scripts/build-weapon-held-pistol-t1.lua"],
                                  cwd=self.root, capture_output=True, text=True)
        self.assertEqual(gate().returncode, 0)
        png, _, _ = next(paths()); path = self.root / png; original = path.read_bytes()
        Image.new("RGBA", (32, 20), "white").save(path)
        result = gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("pinned weapon tier source/raster parity failed", result.stderr)
        path.write_bytes(original)
        (self.root / module.CONFIG).unlink()
        result = gate()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("pinned weapon tier source/raster parity failed", result.stderr)


if __name__ == "__main__":
    unittest.main()
