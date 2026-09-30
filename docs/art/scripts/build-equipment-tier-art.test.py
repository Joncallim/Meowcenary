#!/usr/bin/env python3
"""Tier-art importer contract: exact coverage, determinism and adversarial tamper.

All fixtures live in temporary directories; no test repairs production outputs.
"""
from pathlib import Path
import ast,copy,hashlib,importlib.util,json,shutil,tempfile
from zipfile import ZipFile
from PIL import Image

root=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('equipment_importer',root/'docs/art/scripts/build-equipment-concept-atlases.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
config=json.loads((root/module.CONFIG_PATH).read_text())
paths=[p for resource in config['resources'] for p in module.output_paths(resource)]
checks=0

def passed(label):
 global checks
 checks+=1
 print(f'PASS {label}')

ast.parse((root/'docs/art/scripts/build-equipment-concept-atlases.py').read_text())
passed('Python syntax')
all_ids=[]
# Historical exported RGBA emblem hashes, captured before the tier import.
emblem_hashes={'set:commando': '8442b8859d82a78495c21c313e0362ee7dc04df2f1f3d76806e96508fc5bde7f', 'set:scavenger': '86e05bb8513a19023972d31a769c5f24caf28ea32a5822ea48bc0498b0cff69c', 'set:juggernaut': '53a9cd5c05e1096f6b44d0618daf7af31bd5f7cf7ec82d98a6f8479f5b35babc', 'set:pyro': '0b382488d1cf5470173397018d86463d054bac47d1beaccbb9e52cbbf2aee056', 'set:recon': 'c4843a9df68380653e95fa0bfb196505383a5222af29d193efbbbf5260668867', 'set:medic': 'ec8407b81c2612f5cfbdfa4f32295f84ee0ec1915ce44e4c837dfd1ce6d1eaf0', 'set:technician': '624f06ad815791718bacfa3fa452c34bf65f14401072713f974ff2fc9fb53d86', 'set:demolition': '02d39ae89b3d71b1b3392efd5c3efb856653ff31a99922cb59cd52d2f9834107'}
for resource in config['resources']:
 png,meta,pxo=module.output_paths(resource)
 image=Image.open(root/png).convert('RGBA');data=json.loads((root/meta).read_text());frames=data['frames']
 assert image.size==(1632,96*len(resource['setIds']))
 assert len(frames)==17*len(resource['setIds'])
 assert [data['size_x'],data['size_y']]==list(image.size)
 for row,set_id in enumerate(resource['setIds']):
  assert hashlib.sha256(image.crop((0,row*96,96,(row+1)*96)).tobytes()).hexdigest()==emblem_hashes[set_id],set_id
 for art_id,frame in frames.items():
  rect=frame['frame'];x,y,w,h=[rect[key] for key in ('x','y','w','h')]
  assert (w,h)==(96,96)
  cell=image.crop((x,y,x+w,y+h));bounds=cell.getchannel('A').getbbox();assert bounds
  assert bounds[0]>=6 and bounds[1]>=6 and bounds[2]<=90 and bounds[3]<=90,(art_id,bounds)
 with ZipFile(root/pxo) as archive:
  assert archive.namelist()==['mimetype','data.json','image_data/frames/1/layer_1']
  assert all(member.date_time==module.ZIP_DATE for member in archive.infolist())
  project=json.loads(archive.read('data.json'))
  assert [project['size_x'],project['size_y']]==list(image.size)
  assert len(project['layers'])==1 and len(project['frames'])==1
  assert archive.read('image_data/frames/1/layer_1')==image.tobytes()
 all_ids.extend(frames)
passed('both atlas dimensions, 136 gutters, 8 old emblems byte-identical, PXO raw-pixel parity')
equipment=json.loads((root/config['catalogs']['equipment']).read_text())
visuals=json.loads((root/config['catalogs']['visuals']).read_text())
sets=json.loads((root/config['catalogs']['sets']).read_text())
expected={s['emblem'] for s in sets}|{tier['iconArtId'] for visual in visuals for tier in visual['tiers']}
assert len(all_ids)==len(set(all_ids))==136 and set(all_ids)==expected
assert all(piece['icon'] in all_ids for piece in equipment)
assert not any(art_id.startswith('equipment-wearable:') for art_id in all_ids)
passed('exact active 128 authored tier IDs + 8 emblems; stable T1; no duplicated wearable frames')
with tempfile.TemporaryDirectory(prefix='meow-198-determinism-') as directory:
 generated=Path(directory)
 module.write(root,generated)
 first={p:(generated/p).read_bytes() for p in paths}
 module.write(root,generated)
 assert all((generated/p).read_bytes()==first[p]==(root/p).read_bytes() for p in paths)
passed('two independent exports match each other and all six checked-in outputs byte-for-byte')

with tempfile.TemporaryDirectory(prefix='meow-198-tamper-') as directory:
 fixture=Path(directory)
 inputs=[module.CONFIG_PATH,*config['catalogs'].values(),*[s['path'] for s in config['emblemSources']],*[s['path'] for s in config['masters']]]
 for path in inputs+paths:
  target=fixture/path;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/path,target)
 def fails(label,change,expected_error):
  originals={p:(fixture/p).read_bytes() for p in inputs+paths}
  change()
  after={p:(fixture/p).read_bytes() for p in inputs+paths if (fixture/p).exists()}
  try:module.check(fixture)
  except SystemExit as error:assert expected_error in str(error),(label,error)
  else:raise AssertionError('Tamper was accepted: '+label)
  assert after=={p:(fixture/p).read_bytes() for p in after},'check repaired tamper: '+label
  for path,payload in originals.items():(fixture/path).write_bytes(payload)
  passed('tamper rejected without repair: '+label)
 def edit_json(path,edit):
  document=json.loads((fixture/path).read_text());edit(document);(fixture/path).write_text(json.dumps(document))
 for path in paths:
  fails(path,lambda path=path:(fixture/path).write_bytes((fixture/path).read_bytes()+b'tamper'),'out of date')
 fails('candidate source digest',lambda:(fixture/config['masters'][0]['path']).write_bytes((fixture/config['masters'][0]['path']).read_bytes()+b'tamper'),'digest mismatch')
 fails('original emblem digest',lambda:(fixture/config['emblemSources'][0]['path']).write_bytes((fixture/config['emblemSources'][0]['path']).read_bytes()+b'tamper'),'digest mismatch')
 fails('missing output',lambda:(fixture/paths[0]).unlink(),'out of date')
 fails('master coverage',lambda:edit_json(module.CONFIG_PATH,lambda doc:doc['masters'].pop()),'exactly cover')
 fails('presentation coverage',lambda:edit_json(config['catalogs']['visuals'],lambda doc:doc.pop()),'exactly cover')
 fails('missing tier',lambda:edit_json(config['catalogs']['visuals'],lambda doc:doc[0]['tiers'].pop()),'Wrong presentation tiers')
 fails('duplicate authored icon',lambda:edit_json(config['catalogs']['visuals'],lambda doc:doc[0]['tiers'][1].update(iconArtId=doc[0]['tiers'][0]['iconArtId'])),'globally unique')
 fails('T1 stable ID',lambda:edit_json(config['catalogs']['visuals'],lambda doc:doc[0]['tiers'][0].update(iconArtId='equipment-icon:changed')),'T1 icon ID changed')
 fails('crop gap',lambda:edit_json(module.CONFIG_PATH,lambda doc:doc['masters'][0]['rows'][0]['cropRects'][0].__setitem__(2,313)),'gap, overlap')
 def cross_alpha(doc):
  master=next(m for m in doc['masters'] if m['setId']=='set:juggernaut')
  for rect in master['rows'][0]['cropRects']:rect[3]=313
  for rect in master['rows'][1]['cropRects']:rect[1]=313;rect[3]=333
 fails('equal-grid crop clips Juggernaut silhouette',lambda:edit_json(module.CONFIG_PATH,cross_alpha),'crosses slot separator')
 def empty_cell():
  source=config['masters'][0];path=fixture/source['path'];image=Image.open(path).convert('RGBA');x,y,w,h=source['rows'][0]['cropRects'][0]
  image.paste((0,0,0,0),(x,y,x+w,y+h));image.save(path)
  digest=hashlib.sha256(path.read_bytes()).hexdigest()
  edit_json(module.CONFIG_PATH,lambda doc:doc['masters'][0].update(sha256=digest))
 fails('repinned master with missing tier',empty_cell,'Empty Equipment tier cell')
 # Authored future IDs must be consumed, not reconstructed by the exporter.
 edit_json(config['catalogs']['visuals'],lambda doc:doc[0]['tiers'][1].update(iconArtId='equipment-icon:future-authored-frame'))
 generated=fixture/'future-output';module.write(fixture,generated)
 first_meta=json.loads((generated/paths[1]).read_text())
 assert 'equipment-icon:future-authored-frame' in first_meta['frames']
 assert 'equipment-icon:commando-helmet:t2' not in first_meta['frames']
 passed('higher-tier authored frame ID is consumed generically')
print(f'{checks} focused exporter checks passed')
