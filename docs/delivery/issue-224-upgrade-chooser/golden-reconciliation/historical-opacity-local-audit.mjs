import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {readdir,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const [base,candidate,out]=process.argv.slice(2);
assert(base&&candidate&&out,'Usage: node <script> <baseline visual-build root> <candidate visual-build root> <output directory>');
await mkdir(out,{recursive:true});
const {chromium}=createRequire(candidate+'/package.json')('@playwright/test');
const browser=await chromium.launch();const rows=[];
try{for(const [label,root,port] of [['baseline',base,4295],['candidate',candidate,4296]]){
 const server=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
 try{
  const url=`http://127.0.0.1:${port}`;
  for(let n=0;n<60;n++){try{if((await fetch(url+'/build-meta.json')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  const phaser=(await readdir(root+'/dist/assets')).find(name=>name.startsWith('phaser-')&&name.endsWith('.js'));
  for(const viewport of [{width:1280,height:720}]){
   const ctx=await browser.newContext({viewport,hasTouch:viewport.width===390,isMobile:viewport.width===390});const page=await ctx.newPage();
   await page.goto(url+'/?visual-test=1');await page.waitForFunction(()=>globalThis.__MEOWCENARY_VISUAL_TEST__?.showMenu('home'));await page.waitForTimeout(250);
   await page.keyboard.down('Enter');await page.waitForTimeout(60);await page.keyboard.up('Enter');await page.waitForTimeout(120);
   await page.waitForFunction(()=>globalThis.__MEOWCENARY_VISUAL_TEST__.isSceneActive('GameScene'));await page.evaluate(()=>globalThis.__MEOWCENARY_VISUAL_TEST__.resume());
   await page.waitForFunction(()=>globalThis.__MEOWCENARY_VISUAL_TEST__.showUpgradeChooser());
   const cdp=await ctx.newCDPSession(page);await cdp.send('Debugger.enable');
   const fn=await cdp.send('Runtime.evaluate',{expression:`import('/assets/${phaser}').then(m=>m.r().Game.prototype.step)`,awaitPromise:true});
   const paused=new Promise(resolve=>cdp.once('Debugger.paused',resolve));
   const bp=await cdp.send('Debugger.setBreakpointOnFunctionCall',{objectId:fn.result.objectId});
   const event=await paused;await cdp.send('Debugger.evaluateOnCallFrame',{callFrameId:event.callFrames[0].callFrameId,expression:'globalThis.__LOCAL_AUDIT_GAME__=this; true',returnByValue:true});
   await cdp.send('Debugger.removeBreakpoint',{breakpointId:bp.breakpointId});await cdp.send('Debugger.resume');const gameObject=(await cdp.send('Runtime.evaluate',{expression:'globalThis.__LOCAL_AUDIT_GAME__',objectGroup:'local-audit'})).result.objectId;
   const facts=async()=>{
    const result=await cdp.send('Runtime.callFunctionOn',{objectId:gameObject,returnByValue:true,functionDeclaration:`function(){
     const scene=this.scene.getScene('GameScene');const view=scene.hudController.view;
     const object=o=>o&&({x:o.x,y:o.y,width:o.width,height:o.height,alpha:o.alpha,visible:o.visible,fillAlpha:o.fillAlpha,depth:o.depth,renderFlags:o.renderFlags,cameraFilter:o.cameraFilter,alphaTL:o.alphaTopLeft,alphaTR:o.alphaTopRight,alphaBL:o.alphaBottomLeft,alphaBR:o.alphaBottomRight,blendMode:o.blendMode,scrollFactorX:o.scrollFactorX,scrollFactorY:o.scrollFactorY,tint:o.tint,bounds:o.getBounds(),texture:o.texture?.key,frame:o.frame?.name,uv:o.frame&&{u0:o.frame.u0,u1:o.frame.u1,v0:o.frame.v0,v1:o.frame.v1},children:o.list?.map(n=>({type:n.type,alpha:n.alpha,visible:n.visible,texture:n.texture?.key,frame:n.frame?.name}))});
     return {status:scene.runState.status,camera:{scrollX:scene.cameras.main.scrollX,scrollY:scene.cameras.main.scrollY,zoom:scene.cameras.main.zoom},backing:object(view.backing),frame:object(view.backingFrame),chooser:object(scene.upgradeChooser.view.root.list[0]),viewport:view.viewport,player:{x:scene.player.x,y:scene.player.y}};
    }`});assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;
   };
   const before=await facts();assert(await page.evaluate(()=>globalThis.__MEOWCENARY_VISUAL_TEST__.focusArtBackdrop()));await page.waitForTimeout(250);assert(await page.evaluate(()=>globalThis.__MEOWCENARY_VISUAL_TEST__.useAuthoredArenaArtReference()));await page.evaluate(()=>globalThis.__MEOWCENARY_VISUAL_TEST__.freeze());
   rows.push({label,viewport,before,after:await facts()});
   await page.screenshot({path:`${out}/${label}-ordinary.png`});
   for(const [name,code] of [
     ['historical-hud',"scene.hudController.view.backing.setFillStyle(scene.hudController.view.backing.fillColor,1);scene.hudController.view.backingFrame.setAlpha(0.9)"],
     ['restored-hud',"scene.hudController.view.backing.setFillStyle(scene.hudController.view.backing.fillColor,0.42);scene.hudController.view.backingFrame.setAlpha(0.48)"],
     ['no-chooser',"scene.upgradeChooser.view.root.visible=false"],
     ['no-hud-frame',"scene.hudController.view.backingFrame.visible=false"],
     ['no-hud-backing',"scene.hudController.view.backing.visible=false"],
   ]){
    const r=await cdp.send('Runtime.callFunctionOn',{objectId:gameObject,returnByValue:true,functionDeclaration:`function(){const scene=this.scene.getScene('GameScene');${code};this.step(performance.now(),0);return true;}`});assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));
    await page.screenshot({path:`${out}/${label}-${name}.png`});
   }
   await ctx.close();
  }
 }finally{server.kill()}
}}finally{await browser.close();await writeFile(out+'/facts.json',JSON.stringify(rows,null,2))}
