#!/usr/bin/env python3
"""Candidate color/grayscale contacts at actual44pxicon/358×196assembly sizes."""
import importlib.util
import sys
from io import BytesIO
sys.dont_write_bytecode = True
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
spec=importlib.util.spec_from_file_location('part_art',Path(__file__).with_name('build-gunsmith-tier-art.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
OUTPUTS = tuple('assets-src/gunsmith/tiers/evidence/'+name for name in (
    'icons-actual-scale-color-gray.png', 'icons-inspection-3x.png',
    'assemblies-actual-scale-color-gray.png'))

def gray(image):
    result=ImageOps.grayscale(image).convert('RGBA');result.putalpha(image.getchannel('A'));return result

def render(root):
    _,_,icons,assembly=module.render(root)
    boards={}
    board=Image.new('RGBA',(740,11*70),(28,31,37,255));draw=ImageDraw.Draw(board)
    for i,(ident,art) in enumerate(icons.items()):
        x=i%5*148;y=i//5*70
        small=art.resize((44,28),Image.Resampling.NEAREST)
        board.alpha_composite(small,(x+14,y+19));board.alpha_composite(gray(small),(x+72,y+19))
        draw.text((x+4,y+4),ident.split(':')[1][:21],fill=(241,231,207))
        draw.text((x+4,y+51),ident.split(':')[-1],fill=(241,231,207))
    boards[OUTPUTS[0]]=board
    boards[OUTPUTS[1]]=board.resize((board.width*3,board.height*3),Image.Resampling.NEAREST)
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
    boards[OUTPUTS[2]]=board
    return boards

def payloads(root):
    result={}
    for relative,board in render(root).items():
        buffer=BytesIO();board.save(buffer,format='PNG');result[relative]=buffer.getvalue()
    return result

def output_paths(output):
    # Validate all destinations before the first write, including final-file
    # symlinks. Resolve the accepted paths once for the owning operation.
    return {relative:module.safe_path(output,relative).resolve() for relative in OUTPUTS}

def write(root,output):
    paths=output_paths(output)
    for relative,payload in payloads(root).items():
        path=paths[relative];path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(payload)

def check(root):
    paths=output_paths(root)
    for relative,payload in payloads(root).items():
        path=paths[relative]
        module.require(path.is_file() and path.read_bytes()==payload,'component evidence is out of date:'+relative)

if __name__=='__main__':
    if sys.argv[1:]==['--check']:check(module.ROOT)
    elif sys.argv[1:]:raise SystemExit('Usage: build-gunsmith-tier-evidence.py [--check]')
    else:write(module.ROOT,module.ROOT)
