#!/usr/bin/env python3
"""Small source-only proof gates; no runtime/assets/build/browser suite."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from zipfile import ZipFile

from PIL import Image

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
SCRIPT = Path(__file__).with_name("build-ability-fx-candidates.py")


class AbilityFxCandidateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("ability_fx_candidates", SCRIPT)
        cls.builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.builder)
        cls.source = cls.builder.load_source(ROOT)

    def test_deterministic_native_export_and_atlas_parity(self):
        first = self.builder.build(ROOT)
        self.assertEqual(first, self.builder.build(ROOT))
        for name, content in first.items():
            self.assertTrue(name.startswith("assets-src/ability-effects/candidates/"))
            self.assertEqual((ROOT / name).read_bytes(), content, name)
        native_count = 0
        for effect in self.source["effects"]:
            path = f"assets-src/ability-effects/candidates/{effect['slug']}.pxo"
            with ZipFile(io.BytesIO(first[path])) as archive:
                project = json.loads(archive.read("data.json"))
                self.assertEqual((project["pxo_version"], project["pixelorama_version"]), (7, "v1.2-stable"))
                self.assertEqual(archive.read("mimetype"), b"application/x-pixelorama")
                self.assertEqual((project["size_x"], project["size_y"], project["color_mode"], project["fps"]), (128, 128, 5, 10))
                self.assertEqual([layer["name"] for layer in project["layers"]], effect["layers"] + ["notes"])
                self.assertTrue(all(layer["visible"] and not layer["locked"] for layer in project["layers"][:-1]))
                self.assertFalse(project["layers"][-1]["visible"])
                for layer in project["layers"]:
                    self.assertEqual((layer["opacity"], layer["blend_mode"], layer["parent"], layer["type"]), (1, 0, -1, 0))
                    self.assertFalse(layer["clipping_mask"]); self.assertEqual(layer["effects"], {})
                self.assertEqual(len(project["frames"]), len(self.builder.frames(effect)))
                self.assertEqual([tag["name"] for tag in project["tags"]], [sequence["name"] for sequence in effect["sequences"]])
                for index, frame in enumerate(self.builder.frames(effect), 1):
                    native_frame = project["frames"][index - 1]
                    self.assertEqual(native_frame["duration"] / project["fps"] * 1000, frame["frameMs"])
                    self.assertEqual(len(native_frame["cels"]), 5)
                    self.assertTrue(all(cel["opacity"] == 1 and cel["z_index"] == 0 for cel in native_frame["cels"]))
                    self.assertEqual(archive.read(f"image_data/frames/{index}/layer_5"), bytes(128 * 128 * 4))
                    composed = Image.new("RGBA", (128, 128))
                    for layer in range(1, len(effect["layers"]) + 1):
                        raw = archive.read(f"image_data/frames/{index}/layer_{layer}")
                        self.assertEqual(len(raw), 128 * 128 * 4)
                        composed.alpha_composite(Image.frombytes("RGBA", (128, 128), raw))
                    name = "assets-src/ability-effects/candidates/frames/" + self.builder.frame_file(frame['id'])
                    png = Image.open(io.BytesIO(first[name])).convert("RGBA")
                    self.assertEqual(composed.tobytes(), png.tobytes())
                    self.assertEqual(composed.crop((46, 44, 82, 84)).getbbox(), None, frame["id"])
                    native_count += 1
        self.assertEqual(native_count, 48)
        atlas = json.loads(first["assets-src/ability-effects/candidates/atlas.json"])
        self.assertEqual(len(atlas["frames"]), native_count)
        page = Image.open(io.BytesIO(first["assets-src/ability-effects/candidates/atlas-0.png"])).convert("RGBA")
        self.assertEqual(page.size, (1024, 1024))
        for name, row in atlas["frames"].items():
            x, y, w, h = (row["frame"][key] for key in ("x", "y", "w", "h"))
            self.assertEqual((w, h), (128, 128)); self.assertFalse(row["rotated"]); self.assertFalse(row["trimmed"])
            self.assertEqual(page.crop((x, y, x + w, y + h)).tobytes(), Image.open(io.BytesIO(first["assets-src/ability-effects/candidates/frames/" + self.builder.frame_file(name)])).convert("RGBA").tobytes())

    def test_frame_zero_reduced_and_bounds(self):
        for effect in self.source["effects"]:
            for sequence in effect["sequences"]:
                self.assertEqual(sequence["reducedMotionFrame"], 0)
                self.assertGreaterEqual(sequence["frameMs"] * len(sequence["frames"]), 300 if sequence["name"] == "activation" else 50)
                self.assertLessEqual(sequence["frameMs"] * len(sequence["frames"]), 1000)
                coverages = []
                for frame in sequence["frames"]:
                    layers = self.builder.render_frame(self.source, effect, frame)
                    composed = self.builder.composite(layers)
                    alpha = list(composed.getchannel("A").get_flattened_data())
                    self.assertTrue(set(alpha).issubset({0, 255}))
                    count = sum(value != 0 for value in alpha)
                    self.assertGreater(count, 60); self.assertLess(count, 128 * 128 * .3)
                    coverages.append(count)
                self.assertGreaterEqual(coverages[0], max(coverages) * .65)

    def test_animation_preview_is_bounded_source_compositor(self):
        generated = self.builder.build(ROOT)
        with Image.open(io.BytesIO(generated[self.builder.PREFIX + "all-eight-biomes.gif"])) as animation:
            self.assertEqual(animation.size, (1760, 1950)); self.assertEqual(animation.n_frames, 8)
            for frame in range(animation.n_frames):
                animation.seek(frame); self.assertEqual(animation.info["duration"], 100)

    def test_all_shipped_abilities_have_complete_candidate_recipes_without_mechanical_values(self):
        abilities = json.loads((ROOT / "src/data/abilities.json").read_text())
        self.assertEqual({e["abilityId"] for e in self.source["effects"]}, {a["id"] for a in abilities})
        generated = self.builder.build(ROOT)
        recipes = json.loads(generated[self.builder.PREFIX + "recipes.json"])
        self.assertEqual(len(recipes), 8)
        self.assertLessEqual(len([p for p in generated if p.endswith(".png") and "/atlas-" in p]), 2)
        for recipe in recipes:
            self.assertEqual(set(recipe), {"abilityId", "candidateStatus", "cue", "fx"})
            self.assertEqual(recipe["candidateStatus"], "unapproved")
            for sequence in recipe["fx"].values():
                self.assertEqual(set(sequence), {"frameArtIds", "frameMs", "reducedMotionFrame"})
        self.assertIn(self.builder.PREFIX + "all-eight-reduced-static.png", generated)

    def test_new_ability_identity_with_existing_mechanics_is_admitted_from_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); (root / "src/data").mkdir(parents=True)
            abilities = json.loads((ROOT / "src/data/abilities.json").read_text())
            extra = copy.deepcopy(next(a for a in abilities if a["id"] == self.source["effects"][0]["abilityId"]))
            extra["id"] = "ability:future-repair"; abilities.append(extra)
            (root / "src/data/abilities.json").write_text(json.dumps(abilities))
            source = copy.deepcopy(self.source)
            source["effects"][0]["abilityId"] = extra["id"]; source["effects"][0]["slug"] = "future-repair"
            self.builder.validate(source, root)
            self.assertTrue(all(frame["id"].startswith("effect:future-repair:") for frame in self.builder.frames(source["effects"][0])))

    def test_two_page_fixture_exports_disjoint_centered_phaser_atlases(self):
        # Repeating trusted frames is a packaging stress fixture, not new art.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); (root / "assets-src/ability-effects").mkdir(parents=True)
            (root / "src").symlink_to(ROOT / "src", target_is_directory=True)
            (root / "public").symlink_to(ROOT / "public", target_is_directory=True)
            source = copy.deepcopy(self.source)
            for effect in source["effects"]:
                for sequence in effect["sequences"]: sequence["frames"] *= 2
            (root / self.builder.SOURCE).write_text(json.dumps(source))
            generated = self.builder.build(root)
            index = json.loads(generated[self.builder.PREFIX + "atlas.json"])["frames"]
            self.assertEqual(len(index), 96)
            self.assertEqual({frame["page"] for frame in index.values()}, {0, 1})
            seen = set()
            for page_index in (0, 1):
                exported = json.loads(generated[self.builder.PREFIX + f"atlas-{page_index}.json"])
                self.assertEqual(exported["meta"]["image"], f"atlas-{page_index}.png")
                page = Image.open(io.BytesIO(generated[self.builder.PREFIX + exported["meta"]["image"]])).convert("RGBA")
                self.assertEqual(page.size, (exported["meta"]["size"]["w"], exported["meta"]["size"]["h"]))
                ids = {key for key, value in index.items() if value["page"] == page_index}
                self.assertEqual(set(exported["frames"]), ids); self.assertFalse(seen & ids); seen |= ids
                for identity, frame in exported["frames"].items():
                    self.assertEqual(frame["pivot"], {"x": .5, "y": .5})
                    self.assertFalse(frame["rotated"]); self.assertFalse(frame["trimmed"])
                    x, y, w, h = (frame["frame"][key] for key in ("x", "y", "w", "h"))
                    self.assertGreaterEqual(x, 0); self.assertGreaterEqual(y, 0)
                    self.assertLessEqual(x + w, 1024); self.assertLessEqual(y + h, 1024)
                    png = Image.open(io.BytesIO(generated[self.builder.PREFIX + "frames/" + self.builder.frame_file(identity)])).convert("RGBA")
                    self.assertEqual(page.crop((x, y, x + w, y + h)).tobytes(), png.tobytes())
            self.assertEqual(seen, set(index))

    def test_trailing_hyphen_slug_rejected_before_export(self):
        changed = copy.deepcopy(self.source)
        changed["effects"][0]["slug"] = "giga-chomp-"
        with self.assertRaisesRegex(ValueError, "unique safe slug"):
            self.builder.validate(changed, ROOT)

    def test_consecutive_hyphen_slug_rejected_before_export(self):
        changed = copy.deepcopy(self.source)
        changed["effects"][0]["slug"] = "giga--chomp"
        with self.assertRaisesRegex(ValueError, "unique safe slug"):
            self.builder.validate(changed, ROOT)

    def test_invalid_sources_rejected_before_export(self):
        changes = [
            lambda d: d.update(candidateStatus="approved"),
            lambda d: d.update(nativeSize=256),
            lambda d: d["effects"][0].update(radius=90),
            lambda d: d["effects"][0].update(slug="../../public/unsafe"),
            lambda d: d["effects"][0].update(slug="a" * 42),
            lambda d: d["effects"][0]["sequences"][0].update(reducedMotionFrame=8),
            lambda d: d["effects"][0]["sequences"][0].update(frameMs=1),
            lambda d: d["effects"][0]["sequences"][0].update(frames=d["effects"][0]["sequences"][0]["frames"] * 3),
        ]
        for mutate in changes:
            changed = copy.deepcopy(self.source); mutate(changed)
            with self.assertRaises(ValueError): self.builder.validate(changed, ROOT)

    def test_fresh_output_and_drift_checks_never_repair(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            outputs = {"assets-src/ability-effects/candidates/test.png": b"first"}
            self.builder.publish(root, outputs)
            with self.assertRaises(FileExistsError): self.builder.publish(root, outputs)
            path = root / next(iter(outputs)); path.write_bytes(b"sentinel")
            with self.assertRaises(ValueError): self.builder.check(root, outputs)
            self.assertEqual(path.read_bytes(), b"sentinel")
            with self.assertRaises(ValueError): self.builder.publish(root, {"public/unsafe": b"x"})


if __name__ == "__main__":
    unittest.main()
