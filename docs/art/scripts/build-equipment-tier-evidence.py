#!/usr/bin/env python3
"""Render CANDIDATE Equipment contact sheets from exact runtime icon frames.

44px is the menu slot size, not a hardware or owner-approval claim. Whole
96px cells are scaled uniformly; no object is independently enlarged.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = 'assets-src/equipment/tiers/evidence'
SLOTS = ('helmet', 'armour', 'gloves', 'boots')
spec = importlib.util.spec_from_file_location('equipment_importer', Path(__file__).with_name('build-equipment-concept-atlases.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
local_path = importer.relative_path


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def generate(root: Path, output: Path) -> list[str]:
    def read(relative: str):
        return json.loads(local_path(root, relative).read_text())

    equipment = read('src/data/equipment.json')
    sets = read('src/data/equipment-sets.json')
    visuals = {row['equipmentId']: row for row in read('src/data/equipment-visuals.json')}
    bindings = {row['id']: row for row in read('src/data/visual-art.json')['bindings']}
    resources = {row['id']: row for row in read('src/data/visual-resources.json')}
    used_bindings, used_resources, files, atlases, names = {}, {}, {}, {}, []
    frame_facts = []
    size, font = 44, ImageFont.load_default()
    for family in sets:
        rows = sorted((row for row in equipment if row['setId'] == family['id']),
                      key=lambda row: (SLOTS.index(row['slot']), row['id']))
        if not rows:
            continue
        name = family['id'].removeprefix('set:')
        if len(name) > 80 or not re.fullmatch('[a-z0-9-]+', name) or name in names:
            raise ValueError('Equipment evidence filename must be unique and bounded')
        names.append(name)
        board = Image.new('RGBA', (50 + 8 * (size + 8) + 24, 32 + len(rows) * (size + 31) + 14), (34, 39, 46, 255))
        draw = ImageDraw.Draw(board)
        draw.text((12, 8), f"{family['name'].upper()} — equipment tiers, 44px nearest-neighbor", font=font, fill=(238, 241, 244, 255))
        for row_index, piece in enumerate(rows):
            row_y = 30 + row_index * (size + 31)
            draw.text((12, row_y + 14), piece['slot'].upper(), font=font, fill=(180, 193, 204, 255))
            tiers = visuals[piece['id']]['tiers']
            if sorted(row['tier'] for row in tiers) != [1, 2, 3, 4]:
                raise ValueError('Equipment evidence requires exact four-tier coverage')
            for tier in tiers:
                binding = bindings[tier['iconArtId']]
                resource = resources[binding['resourceId']]
                if binding['kind'] != 'icon' or resource['sampling'] != 'nearest' or resource['load']['type'] != 'atlas':
                    raise ValueError('Equipment evidence must use actual nearest-sampled icon atlas bindings')
                used_bindings[binding['id']], used_resources[resource['id']] = binding, resource
                if resource['id'] not in atlases:
                    image_relative = 'public/' + resource['load']['imageUrl']
                    data_relative = 'public/' + resource['load']['dataUrl']
                    image_path, data_path = local_path(root, image_relative), local_path(root, data_relative)
                    files[image_relative], files[data_relative] = digest(image_path.read_bytes()), digest(data_path.read_bytes())
                    with Image.open(image_path) as image:
                        atlas = image.convert('RGBA')
                    atlases[resource['id']] = atlas, read(data_relative)
                atlas, metadata = atlases[resource['id']]
                frame = metadata['frames'][binding['frameKey']]['frame']
                x, y, width, height = (frame[key] for key in ('x', 'y', 'w', 'h'))
                if (width, height) != (96, 96) or x < 0 or y < 0 or x + width > atlas.width or y + height > atlas.height:
                    raise ValueError('Equipment evidence frame must be a complete in-bounds 96px cell')
                color = atlas.crop((x, y, x + width, y + height)).resize((size, size), Image.Resampling.NEAREST)
                gray = color.convert('RGB').convert('L').convert('RGBA')
                gray.putalpha(color.getchannel('A'))
                pair_x = 68 + (tier['tier'] - 1) * 2 * (size + 8)
                draw.text((pair_x + size // 2 - 8, row_y), f"T{tier['tier']}", font=font, fill=(238, 241, 244, 255))
                board.alpha_composite(color, (pair_x, row_y + 14))
                board.alpha_composite(gray, (pair_x + size + 6, row_y + 14))
                frame_facts.append({'equipmentId': piece['id'], 'tier': tier['tier'], 'iconArtId': binding['id'],
                                    'resourceId': resource['id'], 'frameKey': binding['frameKey']})
        path = local_path(output, f'{name}.png')
        path.parent.mkdir(parents=True, exist_ok=True)
        board.save(path)
    if not equipment or len({(row['equipmentId'], row['tier']) for row in frame_facts}) != len(equipment) * 4:
        raise ValueError('Equipment evidence must cover every active definition and tier exactly once')
    canonical = lambda value: json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
    manifest = {'state': 'CANDIDATE', 'ownerApproval': False, 'size': size, 'sampling': 'nearest',
                'normalization': 'whole 96px cell; no per-object enlargement', 'frames': frame_facts,
                'equipmentVisualsSHA256': digest(local_path(root, 'src/data/equipment-visuals.json').read_bytes()),
                'equipmentBindingsSHA256': digest(canonical(used_bindings)),
                'equipmentResourcesSHA256': digest(canonical(used_resources)), 'runtimeFilesSHA256': files,
                'outputsSHA256': {f'{name}.png': digest(local_path(output, f'{name}.png').read_bytes()) for name in names}}
    local_path(output, 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return [f'{name}.png' for name in names] + ['manifest.json']


if __name__ == '__main__':
    if sys.argv[1:] == ['--check']:
        with TemporaryDirectory(prefix='meow-equipment-evidence-') as temporary:
            generated = Path(temporary)
            for name in generate(ROOT, generated):
                expected = local_path(ROOT, f'{OUTPUT}/{name}')
                if not expected.is_file() or expected.read_bytes() != local_path(generated, name).read_bytes():
                    raise SystemExit(f'Equipment candidate evidence out of date: {name}')
    elif sys.argv[1:]:
        raise SystemExit('Usage: build-equipment-tier-evidence.py [--check]')
    else:
        generate(ROOT, local_path(ROOT, OUTPUT))
