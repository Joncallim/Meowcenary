from pathlib import Path
import json,gzip,statistics,sys
root=Path(sys.argv[1]); out=Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
def read(name):
 p=root/name
 if not p.exists(): p=Path(str(p)+'.gz')
 return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_text())
raw={s:read(s+'-combined.json') for s in ['baseline','final']}
profiles=[c['profile']['name'] for c in raw['final']['cohorts'][:1]]
profiles=list(dict.fromkeys(c['profile']['name'] for c in raw['final']['cohorts']))
def acts(side,profile,name):return [a for c in raw[side]['cohorts'] if c['profile']['name']==profile for a in c['actions'] if a['name']==name]
def fmt(vals):return f'{statistics.median(vals):.1f} [{min(vals):.1f}–{max(vals):.1f}]'
def durations(side,profile,name):return [a['durationMs'] for a in acts(side,profile,name)]
lines=['# Matched performance comparison','',f"Pristine pinned main: `26f46fb5398c7eb769fe1bffa5ed60f80f20eea5`. Instrumented baseline: `{raw['baseline']['measurementSHA']}`. Candidate runtime: `{raw['final']['measurementSHA']}`.",'','Each timing cell is median [minimum–maximum] milliseconds across three independent matched cohorts per profile. These are presentation-ready latency, not just snapshot/render CPU. Baseline and candidate use the same runner, immutable save fixture, seeded Training/combat conditions, action sequence and window. The observed end-to-end duration including input release/polling is also retained in the raw JSON. Warm Home and combat rows are fixed observation windows, not navigation latency.','', '## All requested journeys', '', '| Journey | Desktop baseline → candidate | Phone DPR3 CPU4 baseline → candidate | Foldable DPR2 CPU4 baseline → candidate |', '| --- | --- | --- | --- |']
for a in raw['final']['cohorts'][0]['actions']:
 n=a['name']
 if n in ['warm-home','light-combat','heavy-combat']:continue
 lines.append('| '+n+' | '+' | '.join(fmt(durations('baseline',p,n))+' → '+fmt(durations('final',p,n)) for p in profiles)+' |')
lines += ['','## Fresh real Contract launch','','This supplement starts a fresh browser/save context and uses real Home Play Contract touch/pointer input without intervening panel warming. Normal menu-generated run seeds are recorded, not overridden. It measures prepared, active GameScene at POST_RENDER; it is separate from deterministic Training launch above. Three independent launches per profile per side.','','| Profile | Baseline → candidate ready latency ms | Baseline → candidate full Menu rebuild count during launch |','| --- | --- | --- |']
contracts={s:read(s+'-contracts/results.json') for s in raw}
for p in profiles:
 cs={s:[c for c in contracts[s]['cohorts'] if c['profile']['name']==p] for s in raw}
 ds={s:[c['durationMs'] for c in cs[s]] for s in raw}
 counts={s:[sum(e['owner']=='menu.render' for e in c['state']['events']) for c in cs[s]] for s in raw}
 lines.append('| '+p+' | '+fmt(ds['baseline'])+' → '+fmt(ds['final'])+' | '+str(counts['baseline'])+' → '+str(counts['final'])+' |')
lines += ['','## Combat frame distributions','','Nearest-rank quantiles are retained per cohort. Below, p50/p95/p99 are the median of the three cohort quantiles (not quantiles pooled from raw frames). N and over-budget counts sum observed samples; worst is the maximum observed in the bounded three-second windows. Raw loop cadence and Phaser smoothed simulation delta are different measurements. Headless scheduling/CPU emulation is not a physical-device frame-rate verdict.','','| Profile / scenario / measure | Side | N | p50 ms | p95 ms | p99 ms | Bounded worst ms | >16.667 ms samples / ratio |','| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |']
for p in profiles:
 for name in ['light-combat','heavy-combat']:
  for mode in ['raw loop','simulation delta','frame CPU','render CPU']:
   for side in raw:
    aa=acts(side,p,name)
    if mode=='raw loop': fs=[a['state']['frame'] for a in aa]
    elif mode=='simulation delta':fs=[a['state']['gameplay']['frame'] for a in aa]
    else:fs=[next(o for o in a['state']['owners'] if o['name']==('frame.cpu' if mode=='frame CPU' else 'frame.render')) for a in aa]
    n=sum(f['sampleCount'] for f in fs); over=sum(f['overBudgetSamples'] for f in fs)
    lines.append('| '+f'{p} / {name} / {mode}'+' | '+side+' | '+str(n)+' | '+' | '.join(f"{statistics.median(f[k] for f in fs):.2f}" for k in ['p50Ms','p95Ms','p99Ms'])+f" | {max(f['worstMs'] for f in fs):.2f} | {over}/{n} ({over/n:.1%}) |")
lines += ['','## Meaningful gameplay owner attribution','','Heavy scenario p95: median [min–max] of per-cohort nearest-rank quantiles. Diagnostic measurement resolution/overhead limits interpretation near zero. No per-frame production instrumentation is enabled by this issue.','','| Owner | Desktop baseline → candidate p95 ms | Phone baseline → candidate p95 ms | Foldable baseline → candidate p95 ms |','| --- | --- | --- | --- |']
for owner in ['input','stage','player','spawning','passives','hazards','weapons','drops','feedback','hud','audio']:
 row=[]
 for p in profiles:
  ds={s:[next(o for o in a['state']['gameplay']['owners'] if o['name']==owner)['p95Ms'] for a in acts(s,p,'heavy-combat')] for s in raw}
  row.append(fmt(ds['baseline'])+' → '+fmt(ds['final']))
 lines.append('| '+owner+' | '+' | '.join(row)+' |')
lines += ['','## Stable Menu objects, textures and local churn','','Cells are median created/destroyed object counts; stable final object/texture counts follow in parentheses. Created/destroyed include all measured full renders and local updates during each action, including cold art hydration. These are bounded deterministic diagnostics rather than wall-clock CI thresholds. Ordinary production builds do not expose these seams.','','| Journey | Desktop baseline → candidate | Phone baseline → candidate | Foldable baseline → candidate |','| --- | --- | --- | --- |']
def churn(side,p,n):
 aa=acts(side,p,n); cr=[];de=[];ob=[];tx=[];rr=[];uu=[]
 for a in aa:
  es=[e for e in a['state']['events'] if e['owner'] in ['menu.render','menu.update']]
  cr.append(sum(e['facts'].get('created',0) for e in es));de.append(sum(e['facts'].get('destroyed',0) for e in es));ob.append(a['state']['objects']);tx.append(a['state']['textures']);rr.append(sum(e['owner']=='menu.render' for e in es));uu.append(sum(e['owner']=='menu.update' for e in es))
 return f"{statistics.median(cr):g}/{statistics.median(de):g} (O{statistics.median(ob):g}/T{statistics.median(tx):g}; R{statistics.median(rr):g}/U{statistics.median(uu):g})"
for n in ['cold-usable-home','warm-home','loadout-entry','equipment-entry','equipment-select','equipment-equip','equipment-blueprint-select','equipment-fabricate','gunsmith-entry','gunsmith-build-switch','gunsmith-build-select','gunsmith-part-replace','warm-equipment-entry','warm-gunsmith-entry','warm-home-return','warm-run-result-menu']:
 lines.append('| '+n+' | '+' | '.join(churn('baseline',p,n)+' → '+churn('final',p,n) for p in profiles)+' |')
lines += ['','## Boot owner durations and warm Home CPU','','Owner timing cells are median [min–max] ms for the same three cold contexts per profile. Audio, visual and font barriers can overlap; adding their durations would double-count cold time. Four Nunito weights remain required before Phaser text creation. Warm Home is a fixed 1.5-second observation window; its idle frame CPU and zero action churn are the responsiveness evidence, not a fabricated 1.5-second entry time.','','| Owner / action | Desktop baseline → candidate | Phone baseline → candidate | Foldable baseline → candidate |','| --- | --- | --- | --- |']
for owner,name in [('boot.audio','cold-usable-home'),('boot.visual','cold-usable-home'),('boot.fonts','cold-usable-home'),('frame.cpu','warm-home')]:
 cells=[]
 for p in profiles:
  ds={s:[next(o for o in a['state']['owners'] if o['name']==owner)['p95Ms'] for a in acts(s,p,name)] for s in raw};cells.append(fmt(ds['baseline'])+' → '+fmt(ds['final']))
 lines.append('| '+owner+' / '+name+' | '+' | '.join(cells)+' |')
(out/'comparison.md').write_text('\n'.join(lines)+'\n')
summary={'source':{s:raw[s]['measurementSHA'] for s in raw},'profiles':{p:{n:{s:{'medianMs':statistics.median(durations(s,p,n)),'minMs':min(durations(s,p,n)),'maxMs':max(durations(s,p,n))} for s in raw} for n in ['cold-usable-home','equipment-entry','equipment-select','gunsmith-entry','gunsmith-part-replace','menu-prepared-game']} for p in profiles}}
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
