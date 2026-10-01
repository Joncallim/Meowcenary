#!/usr/bin/env python3
"""Deterministically import complete pinned native candidate component rasters."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZipFile
import PIL
from PIL import Image, ImageOps, ImageDraw
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('native_weapon', Path(__file__).with_name('build-weapon-production-art.py'))
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
ROOT = Path(__file__).resolve().parents[3]
CONFIG = 'assets-src/gunsmith/tiers/masters.json'
ASSEMBLY = (358, 196)
ICON = (128, 80)
require = common.require
safe_path = common.safe_path

def pixelorama(name, art):
    metadata = json.loads(common.project(name))
    metadata.update(size_x=art.width, size_y=art.height)
    metadata['layers'][0]['name'] = 'candidate native component raster'
    return (json.dumps(metadata,separators=(',', ':'))+'\n').encode()

def pxo(path, name, art):
    path.parent.mkdir(parents=True,exist_ok=True)
    with ZipFile(path,'w') as archive:
        common.add_member(archive,'mimetype',b'application/x-pixelorama')
        common.add_member(archive,'data.json',pixelorama(name, art))
        common.add_member(archive,'image_data/frames/1/layer_1',art.tobytes())

def bounds(image):
    return image.getchannel('A').point(lambda n:255 if n>=16 else 0)

def place(crop, scale, anchor, target, size):
    art=crop.resize((max(1,round(crop.width*scale)),max(1,round(crop.height*scale))),Image.Resampling.NEAREST)
    x,y=(round(target[0]-anchor[0]*scale),round(target[1]-anchor[1]*scale))
    require(x>=4 and y>=4 and x+art.width<=size[0]-4 and y+art.height<=size[1]-4,'component import clips authored shape or gutter')
    frame=Image.new('RGBA',size)
    frame.alpha_composite(art,(x,y))
    return frame

def render(root):
    config=json.loads(safe_path(root,CONFIG,'assets-src/gunsmith/tiers').read_text())
    require(config['schemaVersion']==1 and config['status']=='candidate','invalid component master config')
    require(config['Pillow']==PIL.__version__=='12.1.1','component importer requires pinned Pillow12.1.1')
    require(config['assemblySize']==list(ASSEMBLY) and config['iconSize']==list(ICON),'invalid component canvas')
    native={}
    for row in config['masters']:
        path=safe_path(root,row['path'],'assets-src/gunsmith/tiers/candidates')
        require(hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256'],'component master digest mismatch')
        with Image.open(path) as image:
            require(image.format=='PNG' and image.mode=='RGBA' and list(image.size)==row['size'],'master must be pinned native RGBA PNG')
            image=image.copy()
        meaningful=bounds(image); box=meaningful.getbbox()
        require(box and box[0]>0 and box[1]>0 and box[2]<image.width and box[3]<image.height,'component master clips border')
        native[row['id']]=image
    parts=json.loads(safe_path(root,'src/data/gun-parts.json','src/data').read_text())
    registry=json.loads(safe_path(root,'src/data/gunsmith-part-visuals.json','src/data').read_text())
    families={row['partId']:row for row in registry['parts']}
    expected={row['id'] for row in parts if row['slot']!='trait'}
    actual=[row['partId'] for row in config['components']]
    require(set(actual)==expected and len(actual)==len(expected),'component physical Part coverage must be exact')
    require([row['familyId'] for row in config['chassis']]==['pistol','smg','shotgun'],'three explicit presentation chassis required')
    icons={}; assembly={}; used={name:Image.new('L',image.size) for name,image in native.items()}
    for component in [*config['chassis'],*config['components']]:
        master=native[component['masterId']]
        rects=component['cropRects'];anchors=component['sourceAnchors']
        is_part='partId' in component
        require(len(rects)==len(anchors)==(5 if is_part else 1),'missing native tier crops/anchors')
        crops=[]
        for rect,anchor in zip(rects,anchors):
            require(len(rect)==4 and all(type(n)is int for n in rect),'invalid component crop')
            left,top,right,bottom=rect
            require(0<=left<right<=master.width and 0<=top<bottom<=master.height,'component crop outside native master')
            require(len(anchor)==2 and all(type(n) in (int,float) and math.isfinite(n) for n in anchor)
                    and left<=anchor[0]<=right and top<=anchor[1]<=bottom,'invalid source assembly anchor')
            crop=master.crop(rect)
            require(bounds(crop).getbbox()==(0,0,crop.width,crop.height),'crop must retain complete native bounds')
            require(used[component['masterId']].crop(rect).getbbox() is None,'component source crop overlaps')
            used[component['masterId']].paste(255,rect)
            crops.append((crop,(anchor[0]-left,anchor[1]-top)))
        scale=min(component['maxAssemblyExtent'][0]/max(c.width for c,_ in crops),component['maxAssemblyExtent'][1]/max(c.height for c,_ in crops))
        icon_scale=min(116/max(c.width for c,_ in crops),68/max(c.height for c,_ in crops))
        tier_frames=[]
        icon_frames=[]
        for tier,(crop,anchor) in enumerate(crops,1):
            frame=place(crop,scale,anchor,component['targetAnchor'],ASSEMBLY)
            icon=place(crop,icon_scale,(crop.width/2,crop.height/2),(64,40),ICON)
            if is_part:
                rows=families.get(component['partId'],{}).get('tiers',[])
                require(len(rows)==5 and [r['tier'] for r in rows]==[1,2,3,4,5],'missing presentation tiers')
                visual=rows[tier-1]
                aid=visual['assemblyArtId'];iid=visual['iconArtId']
            else:
                aid=component['baseArtId'];iid=component['iconArtId']
            require(aid not in assembly and iid not in icons,'aliased component tier frame')
            assembly[aid]=frame; icons[iid]=icon
            tier_frames.append(frame);icon_frames.append(icon)
        if is_part:
            for images,size in ((icon_frames,(44,28)),(tier_frames,ASSEMBLY)):
                for a,b in zip(images,images[1:]):
                    require(common.silhouette_distance(a,b,size)>=0.035,f"structurally indistinct Part tiers {component['partId']} at{size}")
    for name,image in native.items():
        mask=bounds(image)
        require(all(not a or b for a,b in zip(mask.get_flattened_data(),used[name].get_flattened_data())),'crop coverage loses meaningful native pixels')
    bindings=json.loads(safe_path(root,'src/data/visual-art.json','src/data').read_text())['bindings']
    for group,frames in (('icons',icons),('assembly',assembly)):
        expected_resource='resource:gunsmith-tier-'+group
        actual=[r['id'] for r in bindings if r.get('resourceId')==expected_resource]
        require(set(actual)==set(frames) and len(actual)==len(frames),'component binding coverage differs from native atlas')
    return config,native,icons,assembly

def atlas(output, group, frames):
    size=ICON if group=='icons' else ASSEMBLY
    columns=8;rows=math.ceil(len(frames)/columns)
    image=Image.new('RGBA',(size[0]*columns,size[1]*rows))
    metadata={'export_directory_path':'','export_file_name':'gunsmith-tier-'+group+'-atlas','frames':{},'meta':{'size':{'w':image.width,'h':image.height},'scale':'1'}}
    for index,(ident,frame) in enumerate(frames.items()):
        x=index%columns*size[0];y=index//columns*size[1]
        image.alpha_composite(frame,(x,y))
        metadata['frames'][ident]={'frame':{'x':x,'y':y,'w':size[0],'h':size[1]},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':size[0],'h':size[1]},'sourceSize':{'w':size[0],'h':size[1]}}
    name='gunsmith-tier-'+group+'-atlas';runtime=safe_path(output,'public/assets/gunsmith/tiers')
    runtime.mkdir(parents=True,exist_ok=True)
    image.save(runtime/(name+'.png'),optimize=True)
    (runtime/(name+'.json')).write_text(json.dumps(metadata,indent=2)+'\n')
    pxo(safe_path(output,'assets-src/gunsmith/tiers/source/'+name+'.pxo'),name,image)

def write(root,output):
    config,native,icons,assembly=render(root)
    # Resolve every output before writing so escaping symlinks fail atomically.
    for path in outputs(config):safe_path(output,path)
    for name,image in native.items():pxo(safe_path(output,'assets-src/gunsmith/tiers/source/'+name+'.pxo'),name,image)
    atlas(output,'icons',icons);atlas(output,'assembly',assembly)

def outputs(config):
    for row in config['masters']:yield 'assets-src/gunsmith/tiers/source/'+row['id']+'.pxo'
    for group in ('icons','assembly'):
        name='gunsmith-tier-'+group+'-atlas'
        yield 'public/assets/gunsmith/tiers/'+name+'.png'
        yield 'public/assets/gunsmith/tiers/'+name+'.json'
        yield 'assets-src/gunsmith/tiers/source/'+name+'.pxo'

def check(root):
    with TemporaryDirectory(prefix='meow-component-art-') as directory:
        target=Path(directory);write(root,target)
        config=json.loads(safe_path(root,CONFIG,'assets-src/gunsmith/tiers').read_text())
        for relative in outputs(config):
            require(safe_path(root,relative).read_bytes()==(target/relative).read_bytes(),'component output is out of date:'+relative)

if __name__=='__main__':
    if sys.argv[1:]==['--check']:check(ROOT)
    elif sys.argv[1:]:raise SystemExit('Usage: build-gunsmith-tier-art.py [--check]')
    else:write(ROOT,ROOT)
