#!/usr/bin/env python3
"""Evidence generation parity and real fail-closed write/check boundaries."""
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import subprocess
from tempfile import TemporaryDirectory
import unittest
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('component_evidence',Path(__file__).with_name('build-gunsmith-tier-evidence.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
ROOT=module.module.ROOT

def fixture(root):
    config=json.loads((ROOT/module.module.CONFIG).read_text())
    inputs=[module.module.CONFIG,*[row['path'] for row in config['masters']],
        *['src/data/'+name for name in ('gun-parts.json','gunsmith-part-visuals.json','visual-art.json')],*module.OUTPUTS]
    for relative in inputs:
        target=root/relative;target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(ROOT/relative,target)

def snapshot(root):
    return {str(path.relative_to(root)):(path.read_bytes(),path.stat().st_mtime_ns)
        for path in root.rglob('*') if path.is_file()}

class ComponentEvidenceTest(unittest.TestCase):
    def test_two_exports_match_all_three_checked_in_boards_and_check_does_not_write(self):
        with TemporaryDirectory(prefix='meow-evidence-parity-') as directory:
            root=Path(directory)/'repo';fixture(root)
            generated=Path(directory)/'generated'
            module.write(root,generated)
            first={relative:(generated/relative).read_bytes() for relative in module.OUTPUTS}
            module.write(root,generated)
            for relative in module.OUTPUTS:
                self.assertEqual((generated/relative).read_bytes(),first[relative])
                self.assertEqual(first[relative],(ROOT/relative).read_bytes(),relative)
            before=snapshot(root);module.check(root)
            self.assertEqual(snapshot(root),before)

    def test_directory_and_each_final_file_symlink_reject_before_any_write_or_check_repair(self):
        for destination in ('directory',*module.OUTPUTS):
            for operation in ('write','check'):
                with self.subTest(destination=destination,operation=operation), TemporaryDirectory(prefix='meow-evidence-link-') as directory:
                    sandbox=Path(directory);root=sandbox/'repo';fixture(root)
                    outside=sandbox/'outside';outside.mkdir()
                    if destination=='directory':
                        target=root/Path(module.OUTPUTS[0]).parent;escaped=outside/'boards'
                        shutil.copytree(target,escaped);shutil.rmtree(target)
                        target.symlink_to(escaped,target_is_directory=True)
                    else:
                        target=root/destination;escaped=outside/target.name
                        target.replace(escaped);target.symlink_to(escaped)
                    before=snapshot(sandbox)
                    with self.assertRaisesRegex(ValueError,'escapes'):
                        if operation=='write':module.write(root,root)
                        else:module.check(root)
                    self.assertEqual(snapshot(sandbox),before)

    def test_missing_or_tampered_boards_fail_check_without_repair(self):
        for relative in module.OUTPUTS:
            for mutation in ('missing','tampered'):
                with self.subTest(board=relative,mutation=mutation), TemporaryDirectory(prefix='meow-evidence-tamper-') as directory:
                    root=Path(directory)/'repo';fixture(root);target=root/relative
                    if mutation=='missing':target.unlink()
                    else:target.write_bytes(target.read_bytes()+b'isolated tamper')
                    before=snapshot(root)
                    with self.assertRaisesRegex(ValueError,'out of date'):module.check(root)
                    self.assertEqual(snapshot(root),before)

    def test_cli_check_rejects_tamper_without_repair(self):
        with TemporaryDirectory(prefix='meow-evidence-cli-') as directory:
            root=Path(directory)/'repo';fixture(root)
            for name in ('build-gunsmith-tier-evidence.py','build-gunsmith-tier-art.py','build-weapon-production-art.py'):
                target=root/'docs/art/scripts'/name;target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(ROOT/'docs/art/scripts'/name,target)
            target=root/module.OUTPUTS[0];target.write_bytes(target.read_bytes()+b'CLI tamper')
            before=snapshot(root)
            result=subprocess.run([sys.executable,str(root/'docs/art/scripts/build-gunsmith-tier-evidence.py'),'--check'],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('out of date',result.stderr)
            self.assertEqual(snapshot(root),before)

if __name__=='__main__':unittest.main()
