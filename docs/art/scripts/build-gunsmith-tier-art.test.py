#!/usr/bin/env python3
"""Native component importer regressions: every frame, source and fail-closed pin."""
import importlib.util
import json
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile
from PIL import Image, ImageEnhance
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('component_art',Path(__file__).with_name('build-gunsmith-tier-art.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ComponentImportTest(unittest.TestCase):
    def test_all_native_pxo_pixels_and_atlas_frames(self):
        config,native,icons,assembly=module.render(module.ROOT)
        self.assertEqual(len(icons),53);self.assertEqual(len(assembly),53)
        self.assertEqual(len(native),6)
        for name,image in native.items():
            with ZipFile(module.ROOT/f'assets-src/gunsmith/tiers/source/{name}.pxo') as archive:
                self.assertEqual(archive.read('image_data/frames/1/layer_1'),image.tobytes())
        for group,frames in [('icons',icons),('assembly',assembly)]:
            name=f'gunsmith-tier-{group}-atlas'
            metadata=json.loads((module.ROOT/f'public/assets/gunsmith/tiers/{name}.json').read_text())
            with Image.open(module.ROOT/f'public/assets/gunsmith/tiers/{name}.png') as image,ZipFile(module.ROOT/f'assets-src/gunsmith/tiers/source/{name}.pxo') as archive:
                self.assertEqual(archive.read('image_data/frames/1/layer_1'),image.tobytes())
                self.assertEqual(list(metadata['frames']),list(frames))
                for ident,frame in frames.items():
                    r=metadata['frames'][ident]['frame']
                    self.assertEqual(image.crop((r['x'],r['y'],r['x']+r['w'],r['y']+r['h'])).tobytes(),frame.tobytes(),ident)
                    alpha=module.bounds(frame).getbbox()
                    self.assertTrue(alpha[0]>=4 and alpha[1]>=4 and alpha[2]<=frame.width-4 and alpha[3]<=frame.height-4,ident)
        module.check(module.ROOT)
    def test_tint_only_adjacent_tiers_cannot_pass_structural_gate(self):
        _,_,icons,_=module.render(module.ROOT)
        first=icons['gun-part-icon:receiver-compact:t1']
        recolor=ImageEnhance.Brightness(first).enhance(1.3)
        self.assertEqual(module.common.silhouette_distance(first,recolor,(44,28)),0)
    def test_missing_sha_crop_anchor_binding_and_escaping_path_fail_without_mutation(self):
        with TemporaryDirectory(prefix='meow-parts-negative-') as directory:
            root=Path(directory)/'repo'
            shutil.copytree(module.ROOT/'assets-src/gunsmith/tiers',root/'assets-src/gunsmith/tiers')
            shutil.copytree(module.ROOT/'src/data',root/'src/data')
            config_path=root/module.CONFIG;original=config_path.read_text()
            mutations=[lambda c:c['masters'][0].pop('sha256'),lambda c:c['masters'][0].update(sha256='0'*64),
                lambda c:c['components'][0]['cropRects'][0].__setitem__(0,99999),
                lambda c:c['components'][0]['sourceAnchors'][0].__setitem__(0,float('nan')),
                lambda c:c['components'].pop(),lambda c:c['masters'][0].update(path='../escape.png')]
            for mutate in mutations:
                config=json.loads(original);mutate(config);config_path.write_text(json.dumps(config))
                before={str(p.relative_to(root)):p.read_bytes() for p in root.rglob('*') if p.is_file()}
                with self.assertRaises((ValueError,KeyError,OSError,SystemExit)):module.write(root,root)
                after={str(p.relative_to(root)):p.read_bytes() for p in root.rglob('*') if p.is_file()}
                self.assertEqual(before,after)
            config_path.write_text(original)
            target=root/'assets-src/gunsmith/tiers/candidates/receiver-board-v1.png'
            target.unlink();target.symlink_to(module.ROOT/'assets-src/gunsmith/tiers/candidates/receiver-board-v1.png')
            with self.assertRaisesRegex(ValueError,'escapes'):module.render(root)
    def test_check_rejects_output_tampering_without_repair(self):
        with TemporaryDirectory(prefix='meow-part-parity-') as directory:
            root=Path(directory)/'repo'
            shutil.copytree(module.ROOT/'assets-src/gunsmith/tiers',root/'assets-src/gunsmith/tiers')
            shutil.copytree(module.ROOT/'src/data',root/'src/data')
            module.write(root,root)
            target=root/'public/assets/gunsmith/tiers/gunsmith-tier-icons-atlas.png'
            target.write_bytes(target.read_bytes()+b'tampered')
            before=target.read_bytes()
            with self.assertRaisesRegex(ValueError,'out of date'):module.check(root)
            self.assertEqual(target.read_bytes(),before)
if __name__=='__main__':unittest.main()
