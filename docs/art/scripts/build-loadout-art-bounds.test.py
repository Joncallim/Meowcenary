#!/usr/bin/env python3
"""Synthetic atlas tests: offline framing must preserve source registration."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from PIL import Image

spec = importlib.util.spec_from_file_location('bounds_builder', Path(__file__).with_name('build-loadout-art-bounds.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class BoundsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.write('src/data/visual-art.json', {'bindings': [
            {'id': 'gear', 'resourceId': 'atlas', 'frameKey': 'helmet'},
            {'id': 'gun-build-base:test', 'resourceId': 'atlas', 'frameKey': 'chassis'}]})
        self.write('src/data/visual-resources.json', [{'id': 'atlas', 'load': {'type': 'atlas', 'imageUrl': 'assets/test.png', 'dataUrl': 'assets/test.json'}}])
        self.write('src/data/equipment-visuals.json', [{'tiers': [{'iconArtId': 'gear'}]}])
        self.write('src/data/gunsmith-part-visuals.json', {'parts': []})
        self.write('src/data/gun-parts.json', [])
        self.frames = {'frames': {key: {'frame': {'x': x, 'y': 0, 'w': 10, 'h': 10}} for key, x in [('helmet', 0), ('chassis', 10)]}}
        self.write('public/assets/test.json', self.frames)
        image = Image.new('RGBA', (20, 10))
        image.putpixel((2, 3), (255, 0, 0, 255))
        image.putpixel((5, 7), (255, 0, 0, 16))
        image.putpixel((0, 0), (255, 0, 0, 15))
        image.putpixel((18, 6), (0, 255, 0, 255))
        image.save(self.root / 'public/assets/test.png')

    def write(self, path, value):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(value))

    def test_atlas_local_bounds_keep_full_canvas_and_threshold(self):
        result = builder.build(self.root)
        self.assertEqual(result['bounds']['gear'], {'frameWidth': 10, 'frameHeight': 10, 'left': 2, 'top': 3, 'width': 4, 'height': 5})
        self.assertEqual(result['bounds']['gun-build-base:test']['left'], 8)
        self.assertEqual(builder.build(self.root), result)

    def test_changed_export_pixel_invalidates_hash_even_with_same_bounds(self):
        before = builder.build(self.root)
        with Image.open(self.root / 'public/assets/test.png') as source:
            image = source.convert('RGBA')
        image.putpixel((2, 3), (0, 0, 255, 255))
        image.save(self.root / 'public/assets/test.png')
        after = builder.build(self.root)
        self.assertEqual(before['bounds'], after['bounds'])
        self.assertNotEqual(before['sources'], after['sources'])

    def test_trimmed_registration_and_empty_art_are_rejected(self):
        self.frames['frames']['chassis']['trimmed'] = True
        self.write('public/assets/test.json', self.frames)
        with self.assertRaisesRegex(ValueError, 'rotated/trimmed'):
            builder.build(self.root)
        self.frames['frames']['chassis']['trimmed'] = False
        self.write('public/assets/test.json', self.frames)
        Image.new('RGBA', (20, 10)).save(self.root / 'public/assets/test.png')
        with self.assertRaisesRegex(ValueError, 'empty production artwork'):
            builder.build(self.root)


if __name__ == '__main__':
    unittest.main()
