from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import hashlib,json
root=Path(__file__).parent
items=json.loads((root/'subjects.json').read_text())
out=root/'review';out.mkdir(exist_ok=True)
native=root/'candidate-48';native.mkdir(exist_ok=True)
sheet=Image.new('RGB',(1000,6*190),'#16202a');d=ImageDraw.Draw(sheet)
try:
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
except OSError:
 font=ImageFont.load_default()
rows=[]
for i,(name,subject) in enumerate(items):
 p=root/'generated'/f'{name}.png'
 if not p.exists():continue
 im=Image.open(p).convert('RGBA');a=im.getchannel('A');bbox=a.getbbox()
 if not bbox:raise ValueError(name)
 crop=im.crop(bbox);crop.thumbnail((42,42),Image.Resampling.BOX)
 small=Image.new('RGBA',(48,48));small.alpha_composite(crop,((48-crop.width)//2,(48-crop.height)//2));small.save(native/f'{name}.png')
 x=(i%3)*333;y=(i//3)*190
 d.text((x+8,y+6),name,fill='white',font=font)
 sheet.paste(small.resize((96,96),Image.Resampling.NEAREST),(x+8,y+32),small.resize((96,96),Image.Resampling.NEAREST))
 for bg,xx in [('#16202a',x+130),('#efe6cf',x+195)]:
  d.rectangle((xx,y+32,xx+54,y+86),fill=bg)
  v=small.resize((36,36),Image.Resampling.NEAREST);sheet.paste(v,(xx+9,y+41),v)
 d.text((x+115,y+104),'36px dark / light',fill='#adb8c3',font=font)
 d.text((x+8,y+145),'48px source shown at 2x',fill='#adb8c3',font=font)
 rows.append({'id':name,'source_size':im.size,'source_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'source_alpha_extrema':a.getextrema(),'native_sha256':hashlib.sha256((native/f'{name}.png').read_bytes()).hexdigest(),'source_bbox':bbox,'native_bbox':small.getbbox()})
sheet.save(out/'native-audit.png')
(out/'checks.json').write_text(json.dumps(rows,indent=2)+'\n')
print(len(rows),'icons processed')
