"""Evidence composition only: no production pixels are edited or resampled.
Run beside manifest.json with Pillow; writes a looping review montage from the
actual captured phone crops. GIF durations are rounded to 10ms. Review resets
between playthroughs do not represent the in-game held defeat lifecycle.
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parent
manifest=json.loads((root/'manifest.json').read_text())
actors=manifest['selectedActors']
rows={r['id']:r for r in manifest['rows'] if r['profile']['name']=='phone-390x844-dpr3' and r['mode']=='deterministic'}
assert set(rows)==set(actors)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11)
frames=[];durations=[]
for clip,cycles in [('idle',2),('run',2),('hurt',1),('defeat',1)]:
 clips={i:next(c for c in rows[i]['clips'] if c['clip']==clip) for i in actors}
 count=len(clips[actors[0]]['screenshots'])
 for cycle in range(cycles):
  for n in range(count):
   canvas=Image.new('RGB',(432,300),'#111820');draw=ImageDraw.Draw(canvas)
   draw.text((12,8),f'Mercenary roster · {clip.upper()} · actual browser crops',font=font,fill='#eef3f8')
   for a,i in enumerate(actors):
    x=(a%4)*108+6;y=(a//4)*124+34
    draw.text((x,y),i.replace('-',' ').title(),font=font,fill='#e5b65b')
    path=Path(clips[i]['screenshots'][n]['file'])
    picture=Image.open(path if path.is_absolute() else root/path).convert('RGB')
    assert picture.size==(96,96)
    canvas.paste(picture,(x,y+18))
   draw.text((12,285),'Review loop resets; game defeat holds its final frame.',font=font,fill='#b4c1ce')
   frames.append(canvas);durations.append(round(1000/clips[actors[0]]['registered']['frameRate']/10)*10)
# Hold the actual final defeat pose before the review-only loop reset.
durations[-1]+=600
frames[0].save(root/'roster-animation.gif',save_all=True,append_images=frames[1:],duration=durations,loop=0,optimize=False)
# Contact sheet preserves the same captured pixels; enlarged only for inspection.
contact=Image.new('RGB',(16*96,8*116),'#111820');draw=ImageDraw.Draw(contact)
for a,i in enumerate(actors):
 draw.text((4,a*116),i,font=font,fill='#eef3f8')
 n=0
 for clip in rows[i]['clips']:
  for shot in clip['screenshots']:
   path=Path(shot['file']);picture=Image.open(path if path.is_absolute() else root/path).convert('RGB')
   contact.paste(picture,(n*96,a*116+20));n+=1
 assert n==16
contact.save(root/'roster-contact.png')
print('Encoded',len(frames),'review frames from all 128 phone source crops; no source resampling.')
