import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const repo = process.env.MEOW_REPO;
assert(repo, 'Set MEOW_REPO to the worktree containing the exact built source.');
const base = process.env.MEOW_BASE_URL;
const expected = process.env.MEOW_EXPECTED_SHA;
assert(process.env.MEOW_BROWSER_HANDOFF === '1' && base && expected,
  'Explicit parent browser release, preview and exact built SHA required.');
assert.equal(execFileSync('git', ['rev-parse','HEAD'], {cwd:repo,encoding:'utf8'}).trim(), expected);
const response = await fetch(`${base}/build-meta.json`);
assert(response.ok); assert.equal((await response.json()).commit, expected);
const out = process.env.MEOW_OUTPUT;
assert(out, 'Set MEOW_OUTPUT to an isolated evidence directory.');
await mkdir(out,{recursive:true});
const status = {sourceSHA:expected,buildSHA:expected,rows:[],physicalDevice:false,
  protocol:'Fresh isolated saves; real launch; continuous input; diagnostic reads only; production Abandon/Retry; PNG inspection pending.'};
const flush = () => writeFile(`${out}/status.json`,JSON.stringify(status,null,2));
const {chromium} = createRequire(`${repo}/package.json`)('@playwright/test');
const browser = await chromium.launch();
const delay = ms => new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=12000) {
  const end=Date.now()+ms;
  while(Date.now()<end) { if(await fn()) return; await delay(80); }
  throw Error(`Timed out: ${label}`);
}
try {
  for(const [width,height] of [[390,844],[1280,720]]) for(const input of ['keyboard','cdp-touch']) {
    const row={width,height,input,dpr:3,captures:[],samples:[],terminalRoute:'production manual abandon (not combat defeat)'};
    status.rows.push(row); await flush();
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:3,hasTouch:true,isMobile:width<500});
    const page=await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
    const call=(method,...args)=>page.evaluate(({method,args})=>globalThis.__MEOWCENARY_VISUAL_TEST__?.[method](...args),{method,args});
    const diag=()=>call('arenaFramingDiagnostics');
    const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const key=async name=>{await page.keyboard.down(name);try{await frames();}finally{await page.keyboard.up(name);}await frames();};
    const capture=async(label,live=true)=>{
      const d=await diag();
      if(live) {
        assert(d);assert.equal(d.window.devicePixelRatio,3);assert.deepEqual(d.canvas.rect,d.rootRect);
        assert.equal(d.camera.zoom,1.25);assert.equal(d.camera.roundPixels,false);
        assert.deepEqual(d.physicsBounds,{x:0,y:0,...d.arena});
      }
      const path=`${out}/${width}x${height}-${input}-${label}.png`;
      await page.screenshot({path,scale:'css'});
      row.captures.push({label,path,diagnostic:d??null,liveFramingAsserted:live});await flush();return d;
    };
    await page.goto(`${base}/?visual-test=1`);
    await until(()=>call('isMenuPresentationSettled'),'Home settled');
    assert.equal(await call('waitForMenuPresentation'),true);
    await page.keyboard.down('Enter');
    try {await until(async()=>!(await call('isMenuInputNeutral'))||await call('isSceneActive','GameScene'),'sampled launch');}
    finally {await page.keyboard.up('Enter');}
    await until(()=>call('isSceneActive','GameScene'),'real Game start');await frames();
    const start=await capture('run-start');assert(start.player.y>start.player.bodyRadius+100);
    const cdp=await context.newCDPSession(page);
    const touch=async(type,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:38,y,id:1,radiusX:3,radiusY:3,force:1}]});
    const origin=height-150;
    const begin=async()=>{if(input==='keyboard')await page.keyboard.down('ArrowUp');else {await touch('touchStart',origin);await touch('touchMove',origin-85);}};
    const end=async()=>{if(input==='keyboard')await page.keyboard.up('ArrowUp');else await touch('touchEnd');await frames();};
    await begin();
    try {
      await until(async()=>{
        const d=await diag();row.samples.push({at:Date.now(),x:d?.player.x,y:d?.player.y,worldTop:d?.camera.worldView.y});
        return d&&d.player.y<=d.player.bodyRadius+0.6;
      },'continuous input reaches physical authored top',9000);
    } finally {await end();}
    await until(async()=>{const d=await diag();return d?.camera.worldView.y<=0.51;},'smooth follow exposes authored top');
    const wholeActor = async () => {
      const d=await diag();
      return d&&[d.player.screenBounds,...d.player.layers.map(l=>l.screenBounds)].every(b=>
        b.x>=-0.5&&b.y>=-0.5&&b.x+b.width<=d.canvas.rect.width+0.5&&b.y+b.height<=d.canvas.rect.height+0.5);
    };
    await until(wholeActor,'complete sprite and shadow enter camera at physical top');
    const top=await capture('authored-top');
    assert.deepEqual(top.player.layers.map(l=>l.type),['Sprite','Arc']);
    assert(top.camera.worldView.y<=0.51);assert(top.player.y<start.player.y-100);
    assert(row.samples.some(s=>s.y<start.player.y-30&&s.y>top.player.y+30),'intermediate physical movement observed');
    const projectedY=top.camera.viewport.y+(top.player.y-top.camera.worldView.y)*top.camera.zoom;
    assert(projectedY>=0&&projectedY<=height);row.projectedPlayerY=projectedY;
    await key('p');await capture('pause');
    // Attempt actual movement while Paused; frozen player is supplementary
    // evidence. PNG must independently show the modal before claiming pause.
    await page.keyboard.down('ArrowDown');const pausedBefore=await diag();await delay(300);const pausedAfter=await diag();await page.keyboard.up('ArrowDown');await frames();
    assert.equal(pausedAfter.player.y,pausedBefore.player.y);assert.equal(pausedAfter.player.x,pausedBefore.player.x);
    await key('p');await capture('resume');
    // Exercise movement away from the boundary, proving resumed input rather
    // than using the already-clamped top as a false pause/resume test.
    await page.keyboard.down('ArrowDown');await delay(250);await page.keyboard.up('ArrowDown');await frames();
    const resumed=await diag();assert(resumed.player.y>top.player.y+10);await capture('resume-movement');
    await key('p');await key('ArrowUp');await key('Enter');await capture('abandon-confirm');
    await key('ArrowDown');await key('Enter');await delay(400);await capture('real-terminal',false);
    // This is the production Summary keyboard command, not a fixture method.
    await key('r');
    await until(async()=>{const d=await diag();return d&&d.player.y>resumed.player.y+100;},'real terminal Retry creates fresh centre');
    await capture('retry-centre');
    await begin();
    try {await until(async()=>{const d=await diag();return d&&d.player.y<=d.player.bodyRadius+0.6;},'continuous Retry run reaches authored top',9000);}
    finally {await end();}
    await until(async()=>{const d=await diag();return d?.camera.worldView.y<=0.51;},'Retry smooth follow exposes authored top');
    await until(wholeActor,'complete Retry actor enters camera at physical top');
    await capture('retry-authored-top');
    row.pageErrors=errors;assert.deepEqual(errors,[]);row.complete=true;row.PNGInspection='pending';await flush();
    await context.close();
  }
  status.exit=0;
} catch(error) {status.exit=1;status.error=String(error);throw error;}
finally {await flush();await browser.close();}
