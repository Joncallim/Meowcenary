import argparse,json,subprocess,os,time,urllib.request
from pathlib import Path
parser=argparse.ArgumentParser(description='Repeat matched #209 closure captures; requires detached instrumented baseline EF8 and candidate runtime039 worktrees with Node22 dependencies.')
parser.add_argument('--baseline-repo',required=True,type=Path)
parser.add_argument('--candidate-repo',required=True,type=Path)
parser.add_argument('--out',required=True,type=Path)
options=parser.parse_args()
out=options.out.resolve();out.mkdir(parents=True,exist_ok=True)
final=options.candidate_repo.resolve();baseline=options.baseline_repo.resolve()
sha={'baseline':'ef8d90cfca226c5595598fb74b3f699d0feb3caa','final':'039534f1bba205d67938f987d2bd085d01c8f263'}
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=baseline,text=True).strip()==sha['baseline']
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=final,text=True).strip()==sha['final']
repos={'baseline':baseline,'final':final}; ports={'baseline':4269,'final':4270}
status={'running':True,'pid':os.getpid(),'startingMain':'1f30c3785951ca30cfe86138622cd95f5c2dfb16','originalBaselineMain':'26f46fb5398c7eb769fe1bffa5ed60f80f20eea5','baselineObservabilitySource':sha['baseline'],'steps':[]}; previews=[]
def save(): (out/'capture-status.json').write_text(json.dumps(status,indent=2)+'\n')
def run(name,args,cwd,env=None):
    status['active']=name;save()
    with (out/(name+'.log')).open('w') as log:
        p=subprocess.Popen(args,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT);status['childPid']=p.pid;save();code=p.wait()
    status['steps'].append({'name':name,'exit':code});save()
    if code: raise RuntimeError(name+' exit '+str(code))
try:
    save();run('final-ordinary-build',['npm','run','build'],final)
    run('final-ordinary-inventory',['node','scripts/performance-inventory.mjs','--dist',str(final/'dist'),'--out',str(out/'final-ordinary-inventory.json')],final)
    for side in ['baseline','final']:
        env=os.environ.copy();env['VITE_VISUAL_TEST']='1';run(side+'-profile-build',['npm','run','build'],repos[side],env)
        log=(out/(side+'-preview.log')).open('w');p=subprocess.Popen(['node',str(final/'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',str(ports[side]),'--strictPort'],cwd=repos[side],stdout=log,stderr=subprocess.STDOUT);previews.append((p,log))
        for i in range(60):
            if p.poll() is not None: raise RuntimeError('preview terminated')
            try:
                with urllib.request.urlopen('http://127.0.0.1:'+str(ports[side])+'/build-meta.json',timeout=1) as r: meta=json.load(r)
                assert meta['commit']==sha[side];break
            except (OSError,ValueError):time.sleep(.5)
        else:raise RuntimeError('preview readiness failed')
    profiles=['desktop-1280x720','phone-390x844-dpr3','foldable-1114x720-dpr2']
    samples={'baseline':[],'final':[]}; proto={}
    # Three counterbalanced matched pairs per profile; one heavy browser at a time.
    for pi,profile in enumerate(profiles):
        for pair in range(3):
            order=['baseline','final'] if (pi+pair)%2==0 else ['final','baseline']
            for side in order:
                name=f'{profile}-pair{pair+1}-{side}'; dest=out/name
                run(name,['node','scripts/performance-baseline.mjs','--url','http://127.0.0.1:'+str(ports[side]),'--expected-sha',sha[side],'--profile',profile,'--repeats','1','--window-ms','3000','--out',str(dest)],final)
                result=json.loads((dest/'results.json').read_text());assert result['exit']==0 and len(result['cohorts'])==1
                c=result['cohorts'][0];assert not c['errors'] and len(c['actions'])==27;c['repeat']=pair;c['matchedPair']=pair;c['executionOrder']=order;c['capturePath']=name+'/results.json';samples[side].append(c);proto[side]=result
    for side in ['baseline','final']:
        combined={**proto[side],'cohorts':samples[side],'closureMethod':{'counterbalancedPairsPerProfile':3,'singleConcurrentBrowser':True,'actualMeasurementSha':sha[side],'commonRunnerSourceSha':sha['final'],'windowMs':3000}}
        (out/(side+'-combined.json')).write_text(json.dumps(combined,indent=2)+'\n')
        run(side+'-contracts',['node','scripts/performance-contract-baseline.mjs','--url','http://127.0.0.1:'+str(ports[side]),'--expected-sha',sha[side],'--baseline',str(out/(side+'-combined.json')),'--out',str(out/(side+'-contracts'))],final)
    status['exit']=0
except Exception as e: status['exit']=1;status['error']=str(e);print(str(e),flush=True)
finally:
    for p,log in previews:
        if p.poll() is None:p.terminate();p.wait(timeout=10)
        log.close()
    status['running']=False;status['active']=None;status['finished']=time.time();save()
    print(json.dumps(status,indent=2),flush=True)
