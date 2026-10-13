from pathlib import Path
from PIL import Image
import base64, json, html, hashlib
R=Path(__file__).resolve().parent.parent
REFS=json.loads((R/'review/compact-grid-source-refs.json').read_text())
def asset(name,suffix):
 ref=next(x for x in REFS['files'] if x['path'].endswith('/'+name+suffix))
 candidates=[R/'art'/(name+suffix)]+[parent/ref['path'] for parent in R.parents]
 found=next((q for q in candidates if q.is_file() and q.stat().st_size),None)
 if found is None: raise FileNotFoundError('Use the pinned repository asset: '+ref['path'])
 data=found.read_bytes()
 actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
 if actual!=ref['gitBlobSha']: raise ValueError('Source changed; use baseline '+REFS['baseCommit']+': '+ref['path'])
 return found
BG='#101820'; SURF='#081118'; CARD='#17303b'; TEAL='#2dd4bf'; CREAM='#f7f1d5'; MUTED='#a5c1ca'; GOLD='#fbbf24'
class SVG:
 def __init__(self,w,h):self.w=w;self.h=h;self.p=[f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'];self.n=0;self.assets={};self.rect(0,0,w,h,BG)
 def rect(self,x,y,w,h,fill=CARD,stroke=None,sw=1,r=5):
  self.p.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>')
 def txt(self,x,y,t,size=16,c=CREAM,weight=400):self.p.append(f'<text x="{x}" y="{y}" font-family="DejaVu Sans,sans-serif" font-size="{size}" font-weight="{weight}" fill="{c}">{html.escape(t)}</text>')
 def button(self,x,y,w,t,on=False):self.rect(x,y,w,48,TEAL if on else SURF,TEAL if on else '#57717c');self.txt(x+12,y+30,t,15,BG if on else CREAM,600)
 def art(self,file,key,x,y,w,h):
  self.n+=1;meta=json.loads(asset(file,'.json').read_text());b=meta['frames'][key]['frame'];im=Image.open(asset(file,'.png'))
  if file not in self.assets:self.assets[file]='data:image/png;base64,'+base64.b64encode(asset(file,'.png').read_bytes()).decode()
  s=min(w/b['w'],h/b['h']);dw=b['w']*s;dh=b['h']*s;dx=x+(w-dw)/2;dy=y+(h-dh)/2
  self.p.append(f'<defs><clipPath id="c{self.n}"><rect x="{dx}" y="{dy}" width="{dw}" height="{dh}"/></clipPath></defs><image x="{dx-b["x"]*s}" y="{dy-b["y"]*s}" width="{im.width*s}" height="{im.height*s}" clip-path="url(#c{self.n})" xlink:href="{self.assets[file]}"/>')
 def save(self,name): (R/'review'/name).write_text('\n'.join(self.p+['</svg>']))
def eqkey(t):return 'equipment-icon:commando-helmet'+('' if t==1 else ':t'+str(t))
def eqcard(s,x,y,w,t,selected=False,small=False):
 h=184 if small else 208;s.rect(x,y,w,h,CARD,CREAM if selected else '#31505b',2 if selected else 1)
 s.txt(x+12,y+23,'Tier '+str(t)+' · specimen',14,TEAL if selected else MUTED,600)
 a=72 if small else 96;s.art('commando-equipment-atlas',eqkey(t),x+(w-a)/2,y+29,a,a)
 s.txt(x+12,y+(127 if small else 145),'Commando Helmet',14 if small else 16,CREAM,600)
 s.txt(x+12,y+(151 if small else 173),'+'+str(5*t)+'% fire rate',14,MUTED)
 s.txt(x+12,y+(174 if small else 196),'Selected preview' if selected else 'Inspect',14,TEAL if selected else MUTED)
# Wide density proof: same-slot tier specimens, never fictional owned duplicates.
s=SVG(1180,757);s.txt(24,40,'EQUIPMENT',27,CREAM,700);s.txt(24,66,'DENSITY FIXTURE · real Commando tier specimens, not one owned inventory',14,GOLD);s.button(1000,20,156,'Back to Loadout')
for i,t in enumerate(['Helmet','Armour','Gloves','Boots']):s.button(24+i*136,88,124,t,i==0)
s.txt(24,166,'Candidate grid · 3 columns at this width',17,CREAM,600);s.txt(852,166,'Stable selected inspector',17,CREAM,600)
for i,t in enumerate([1,2,3,4]):eqcard(s,24+(i%3)*276,184+(i//3)*224,260,t,t==2)
s.rect(852,184,304,448,SURF,'#57717c');s.txt(872,216,'HELMET · T2 specimen',16,TEAL,600);s.art('commando-equipment-atlas',eqkey(2),920,233,160,160);s.txt(872,422,'Commando Helmet',20,CREAM,600);s.txt(872,453,'+10% fire rate [Mercenary]',15);s.txt(872,482,'Same Set / tier language',14,MUTED);s.txt(872,509,'Grid stays at its scroll anchor.',14,MUTED);s.txt(872,536,'Preview is never a save.',14,MUTED);s.button(872,564,264,'Inspect tier specimen',True)
s.txt(320,447,'Real collections fill these cells.',15,MUTED);s.txt(320,475,'No duplicated owned IDs or',15,MUTED);s.txt(320,500,'invented tier candidates.',15,MUTED)
s.rect(24,662,1132,70,SURF,'#31505b');s.txt(42,691,'Production: render the current slot’s legal candidates here; this art-only fixture demonstrates density.',14,MUTED);s.txt(42,715,'Selecting changes the fixed inspector, not the whole page offset. Equip / upgrade / fabricate remain separate domain actions.',14,MUTED)
s.save('equipment-comparison-grid-wide.svg')
# Phone density, stable selected summary then explicit details.
s=SVG(390,844);s.txt(16,38,'EQUIPMENT',24,CREAM,700);s.rect(214,18,160,48,SURF,'#57717c');s.txt(226,48,'Back to Loadout',14,CREAM,600)
for i,label in enumerate(['Helmet','Armour','Gloves','Boots']):s.button(16+i*92,80,82,label,i==0)
s.txt(16,152,'Tier specimens · 2-column comparison',15,CREAM,600)
for i,t in enumerate([1,2,3,4]):eqcard(s,16+(i%2)*185,170+(i//2)*196,173,t,t==2,True)
s.rect(0,694,390,150,SURF,'#57717c');s.txt(16,719,'Commando Helmet T2 · preview',16,CREAM,600);s.txt(16,743,'+10% fire rate · no save yet',14,MUTED);s.button(16,754,173,'View details',True);s.button(201,754,173,'Clear preview')
s.rect(0,810,390,34,'#061017',r=0);s.txt(16,833,'Safe-area inset · 34px example',14,MUTED)
s.txt(16,598,'Real candidates continue in the grid.',14,MUTED);s.txt(16,626,'Selection preserves its list anchor.',14,MUTED);s.txt(16,654,'Scroll ends above the fixed summary.',14,MUTED)
s.save('equipment-comparison-grid-phone.svg')
# Real legal Gunsmith fixture: six distinct matching part instances, T1, no infused traits.
s=SVG(1180,757);s.txt(24,40,'WORKSHOP / MERGE',25,CREAM,700);s.txt(24,66,'Fixture: six distinct stored Compact Receiver T1 instances, no infused traits',14,GOLD);s.button(1014,20,142,'Back to recipes')
s.rect(24,88,1132,124,SURF,'#31505b');s.txt(40,114,'1  Choose A',15,TEAL,600);s.txt(380,114,'2  Choose matching B',15,TEAL,600);s.txt(764,114,'3  Review, then confirm',15,CREAM,600)
s.art('gunsmith-tier-icons-atlas','gun-part-icon:receiver-compact:t1',44,123,88,55);s.txt(142,143,'A · #R101 · T1',16);s.txt(142,171,'Stored · no traits',14,MUTED)
s.art('gunsmith-tier-icons-atlas','gun-part-icon:receiver-compact:t1',387,123,88,55);s.txt(484,143,'B · #R104 · T1',16);s.txt(484,171,'Stored · no traits',14,MUTED)
s.art('gunsmith-tier-icons-atlas','gun-part-icon:receiver-compact:t2',770,122,88,56);s.txt(869,143,'Output · T2',16);s.txt(869,171,'Stored, not auto-fitted',14,MUTED)
s.txt(24,247,'Input A pinned · choose a legal B',18,CREAM,600);s.txt(826,247,'Selection stays in this workspace',14,MUTED)
for i in range(6):
 x=24+(i%3)*276;y=266+(i//3)*164;selected=i==3;first=i==0
 s.rect(x,y,260,148,SURF if first else CARD,CREAM if selected else '#31505b',2 if selected else 1)
 s.art('gunsmith-tier-icons-atlas','gun-part-icon:receiver-compact:t1',x+10,y+16,102,64)
 s.txt(x+125,y+30,'T1 · #R10'+str(i+1),14,TEAL if selected else CREAM,600)
 s.txt(x+125,y+55,'Stored',14,MUTED);s.txt(x+125,y+80,'No traits',14,MUTED)
 s.txt(x+12,y+111,'Compact Receiver',16,CREAM,600);s.txt(x+12,y+136,'Selected A · not a B choice' if first else 'Selected B' if selected else 'Eligible second input',14,TEAL if selected else MUTED)
s.rect(864,266,292,312,SURF,'#57717c');s.txt(884,297,'Review consequences',18,CREAM,600);s.txt(884,326,'Part contribution if fitted',14,MUTED);s.txt(884,351,'Attack-speed bonus:',16,TEAL,600);s.txt(884,380,'+8% → +16%',20,TEAL,600);s.txt(884,405,'Traits: none → none',14);s.txt(884,433,'Consume #R101 + #R104.',14);s.txt(884,459,'Output: one T2, stored.',14);s.txt(884,487,'No active build changes now.',14,MUTED);s.button(884,517,252,'Review merge',True)
s.rect(24,618,1132,114,SURF,'#31505b');s.txt(44,646,'Persistent input/output tray and compact choice grid — no 14,200px list for 50 inputs.',15);s.txt(44,673,'Confirm appears only after the consequence review. Cancel returns to B and preserves A + list position.',14,MUTED);s.txt(44,700,'A is excluded as B. Highest tier / incompatible trait unions / missing instances remain ineligible. Equipment never uses this rule.',14,MUTED)
s.save('gunsmith-merge-comparison-grid.svg')
