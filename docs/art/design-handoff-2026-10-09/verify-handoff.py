#!/usr/bin/env python3
"""Verify delivered design assets; never claim runtime or native-art acceptance."""
import hashlib
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / 'ART-MANIFEST.json').read_text())
checked = []
for entry in manifest:
    path = ROOT / entry['file']
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', path
    width, height = struct.unpack('>II', data[16:24])
    assert (width, height) == (entry['width'], entry['height']), path
    assert hashlib.sha256(data).hexdigest() == entry['sha256'], path
    assert entry['productionAccepted'] is False, path
    checked.append({'file': entry['file'], 'dimensions': [width, height], 'sha256': entry['sha256']})

for relative in ['review/ability-layout.png', 'review/direction-review.png',
                 'review/equipment-comparison-grid-wide.png',
                 'review/equipment-comparison-grid-phone.png',
                 'review/gunsmith-merge-comparison-grid.png',
                 'audit/Meowcenary-live-vs-Figma.png']:
    data = (ROOT / relative).read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', relative
    assert len(data) < 25 * 1024 * 1024, relative

assert 'HOLD' in (ROOT / '199-230-CONDITIONAL-COMPOSITION.md').read_text()
assert 'already integrated' in (ROOT / 'README.md').read_text()
print(json.dumps({'status': 'passed', 'checkedExplorationAssets': checked,
                  'boundary': 'File integrity and package gating only. No native-pixel, runtime, device, or owner-approval claim.'}, indent=2))
