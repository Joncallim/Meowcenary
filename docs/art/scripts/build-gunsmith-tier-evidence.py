#!/usr/bin/env python3
"""Candidate color/grayscale contacts at actual44pxicon/358×196assembly sizes."""
import importlib.util
import sys
sys.dont_write_bytecode = True
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
spec=importlib.util.spec_from_file_location('part_art',Path(__file__).with_name('build-gunsmith-tier-art.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
_,_,icons,assembly=module.render(module.ROOT)
root=module.ROOT/'assets-src/gunsmith/tiers/evidence';root.mkdir(exist_ok=True)
def gray(image):
    result=ImageOps.grayscale(image).convert('RGBA');result.putalpha(image.getchannel('A'));return result
board=Image.new('RGBA',(740,11*70),(28,31,37,255));draw=ImageDraw.Draw(board)
for i,(ident,art) in enumerate(icons.items()):
    x=i%5*148;y=i//5*70
    small=art.resize((44,28),Image.Resampling.NEAREST)
    board.alpha_composite(small,(x+14,y+19));board.alpha_composite(gray(small),(x+72,y+19))
    draw.text((x+4,y+4),ident.split(':')[1][:21],fill=(241,231,207))
    draw.text((x+4,y+51),ident.split(':')[-1],fill=(241,231,207))
board.save(root/'icons-actual-scale-color-gray.png')
board.resize((board.width*3,board.height*3),Image.Resampling.NEAREST).save(root/'icons-inspection-3x.png')
board=Image.new('RGBA',(5*358,6*222),(28,31,37,255));draw=ImageDraw.Draw(board)
for family_index,family in enumerate(['pistol','smg','shotgun']):
    for tier in range(1,6):
        image=assembly['gun-build-base:'+family].copy()
        # Two receiver and three barrel shapes appear across the family rows.
        parts=['receiver-heavy' if family=='shotgun' else 'receiver-compact',
            {'pistol':'barrel-standard','smg':'barrel-long','shotgun':'barrel-piercing'}[family],
            'optic-red-dot','trigger-hair','magazine-extended']
        if family!='pistol':parts.append('stock-padded')
        if family=='shotgun':parts.append('underbarrel-grenade')
        for part in parts:image.alpha_composite(assembly[f'gun-build-part:{part}:t{tier}'])
        x=(tier-1)*358;y=family_index*444
        board.alpha_composite(image,(x,y+20));board.alpha_composite(gray(image),(x,y+242))
        draw.text((x+8,y+4),f'{family} T{tier} physical Parts — color',fill=(241,231,207))
        draw.text((x+8,y+226),f'{family} T{tier} — grayscale',fill=(241,231,207))
board.save(root/'assemblies-actual-scale-color-gray.png')
