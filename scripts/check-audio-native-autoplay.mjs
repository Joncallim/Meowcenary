#!/usr/bin/env node
// Dedicated loopback-only Chromium/Phaser HTML5 policy gate; no media monkeypatches.
// Node 22, installed dependencies/browser required. Does not run the full game.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectation = process.argv.includes('--expect-red') ? 'red' : 'green';
const outputArgument = process.argv.indexOf('--output');
if (outputArgument < 0 || !process.argv[outputArgument + 1]) throw new Error('Supply --output /absolute/path/result.json');
const output = resolve(process.argv[outputArgument + 1]);
mkdirSync(dirname(output), { recursive: true });
const require = createRequire(resolve(repo, 'package.json'));
const { build } = require('esbuild');
const { chromium } = require('@playwright/test');
const phaserVersion = require('phaser/package.json').version;
if (phaserVersion !== '3.90.0') throw new Error('Revalidate native Promise seam for Phaser ' + phaserVersion);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repo, encoding: 'utf8' });
const wavPath = 'public/assets/audio/music-menu.wav';
const wav = readFileSync(resolve(repo, wavPath));
const boot = `
import {AudioManager} from './src/systems/audio.ts';
import {createEventBus} from './src/engine/eventBus.ts';
import HtmlManager from 'phaser/src/sound/html5/HTML5AudioSoundManager.js';
import EventEmitter from 'eventemitter3';
const scenario = location.pathname.slice(1);
const evidence = {scenario, warnings:[], nativeEvents:[], clicks:[], states:[], pageErrors:[]};
const activation = () => ({isActive:navigator.userActivation.isActive,hasBeenActive:navigator.userActivation.hasBeenActive});
addEventListener('error', e => evidence.pageErrors.push(String(e.message)));
addEventListener('unhandledrejection', e => evidence.pageErrors.push('unhandled: '+String(e.reason)));
const warn = console.warn;
console.warn = reason => {
  evidence.warnings.push({name:reason?.name,message:reason?.message,isDOMException:reason instanceof DOMException,time:performance.now()});
  warn(reason);
};
const tag = new Audio('/music.wav');
tag.preload = 'auto';
// Match the ordinary desktop unlocked/unused cache shape expected by Phaser's
// HTML5 loader; the actual loader/full scene composition is outside this harness.
tag.dataset.used = 'false'; tag.dataset.locked = 'false';
for (const name of ['play','playing','pause','error','ended']) tag.addEventListener(name, event => evidence.nativeEvents.push({name,trusted:event.isTrusted,time:performance.now(),currentTime:tag.currentTime,paused:tag.paused,errorCode:tag.error?.code??null}));
await new Promise((yes,no) => {tag.addEventListener('loadedmetadata',yes,{once:true});tag.addEventListener('error',no,{once:true});tag.load()});
const tags = new Map([['music-menu',[tag]]]);
const cache = {get:key=>tags.get(key),exists:key=>tags.has(key)};
const sound = new HtmlManager({events:new EventEmitter(),cache:{json:{},audio:cache}});
const audio = new AudioManager({sound,cache:{audio:cache}});
audio.init(createEventBus(),{muted:false,musicVolume:.7,sfxVolume:.8,reducedMotion:false},{assets:{sfx:[],music:[]},map:[]});
const frameState = label => {
  sound.update(0,16); audio.update(16);
  const snapshot = {label,time:performance.now(),activation:activation(),managerLocked:sound.locked,handleCount:sound.sounds.length,handles:sound.sounds.map((voice,index)=>({index,key:voice.key,isPlaying:voice.isPlaying,isPaused:voice.isPaused,pendingRemove:voice.pendingRemove,hasTag:voice.audio===tag})),native:{paused:tag.paused,currentTime:tag.currentTime,readyState:tag.readyState,duration:tag.duration,errorCode:tag.error?.code??null,used:tag.dataset.used}};
  evidence.states.push(snapshot);
};
async function post(phase) {
  const response=await fetch('/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phase,...evidence})});
  if (!response.ok) throw new Error('Evidence transport failed');
}
// Runs from the parser-loaded module. The driver waits for the server POST
// before making its first click; it performs no evaluate/polling in the page.
evidence.initialAttempt = {time:performance.now(),activation:activation(),managerLocked:sound.locked};
audio.playMusic('music-menu');
setTimeout(async()=>{frameState('automatic first attempt');await post('initial')},100);
document.querySelector('button').addEventListener('click',event=>{
  evidence.clicks.push({trusted:event.isTrusted,scenario,time:performance.now(),activation:activation()});
  if (scenario==='same-key') { audio.playMusic('music-menu'); }
  else if (scenario==='unlock-only') { audio.unlock(); }
  else { audio.stopMusic(); audio.playMusic('music-menu'); }
  setTimeout(async()=>{frameState('after trusted action');await post('final')},250);
});
`;
const result = await build({ stdin: { contents: boot, resolveDir: repo, sourcefile: 'external-native-autoplay-probe.ts', loader: 'ts' }, bundle: true, write: false, metafile: true, format: 'esm', platform: 'browser', define: { 'import.meta.env.DEV': 'false' }, absWorkingDir: repo });
const sourceHashes = Object.fromEntries(Object.keys(result.metafile.inputs).filter(path => path !== 'external-native-autoplay-probe.ts').map(path => [path, sha256(readFileSync(resolve(repo,path)))]));
// Save both worktree and committed input identities so dirty RED/GREEN runs
// remain attributable without pretending the current source equals HEAD.
const committedSourceHashes = Object.fromEntries(Object.keys(sourceHashes).filter(path => path.startsWith('src/')).map(path => [path, sha256(execFileSync('git', ['show', `${head}:${path}`], { cwd: repo }))]));
if (!wav.equals(execFileSync('git', ['show', `${head}:${wavPath}`], { cwd: repo }))) throw new Error('WAV differs from HEAD');
const posts = new Map(), waiters = new Map();
function waitForPost(key) {
  if (posts.has(key)) return Promise.resolve(posts.get(key));
  return new Promise((yes,no)=>{
    const timer=setTimeout(()=>{waiters.delete(key);no(new Error('Timed out: '+key))},15000);
    waiters.set(key,value=>{clearTimeout(timer);yes(value)});
  });
}
const server = createServer((req,res)=>{
  if(req.url==='/evidence'&&req.method==='POST'){
    let text='';req.on('data',chunk=>{text+=chunk;if(text.length>100000)req.destroy()});
    req.on('end',()=>{try{const value=JSON.parse(text);if(!['same-key','unlock-only','reset-control'].includes(value.scenario)||!['initial','final'].includes(value.phase))throw new Error('Unexpected evidence');const key=value.scenario+':'+value.phase;posts.set(key,value);waiters.get(key)?.(value);waiters.delete(key);res.writeHead(204);res.end()}catch{res.writeHead(400);res.end()}});
  } else if(req.url==='/music.wav'){res.writeHead(200,{'Content-Type':'audio/wav'});res.end(wav)}
  else if(req.url==='/probe.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(result.outputFiles[0].text)}
  else if(['/same-key','/unlock-only','/reset-control'].includes(req.url)){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><button>Trusted action</button><script type="module" src="/probe.js"></script>')}
  else{res.writeHead(404);res.end()}
});
await new Promise(yes=>server.listen(0,'127.0.0.1',yes));
let browser;
const scenarios=[];
try {
  browser=await chromium.launch({headless:true,args:['--autoplay-policy=user-gesture-required']});
  for(const scenario of ['same-key','unlock-only','reset-control']){
    // Fresh context/page for the control ensures prior gestures cannot unlock it.
    const context=await browser.newContext();
    const page=await context.newPage();
    const driverPageErrors=[];page.on('pageerror',e=>driverPageErrors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/'+scenario);
    const initial=await waitForPost(scenario+':initial');
    await page.getByRole('button').click();
    const final=await waitForPost(scenario+':final');
    scenarios.push({scenario,initial,final,driverPageErrors});
    await context.close();
  }
  const observed=scenarios.every(({initial,final})=>initial.initialAttempt.activation.isActive===false&&initial.initialAttempt.activation.hasBeenActive===false&&initial.warnings.some(x=>x.name==='NotAllowedError'&&x.isDOMException)&&initial.states[0].native.paused&&final.clicks.length===1&&final.clicks[0].trusted);
  const same=scenarios[0].final.states.at(-1),unlock=scenarios[1].final.states.at(-1),control=scenarios[2].final.states.at(-1);
  const healthy = state => !state.native.paused && state.native.currentTime>0 && state.handleCount===1 && state.handles[0].key==='music-menu' && state.handles[0].isPlaying;
  const validInputs = scenarios.every(({initial,final,driverPageErrors}) => initial.states[0].native.readyState>=2 && initial.states[0].native.duration===4 && initial.states[0].native.errorCode===null && !initial.pageErrors.length && !final.pageErrors.length && !driverPageErrors.length && final.nativeEvents.some(event=>event.name==='playing') === !final.states.at(-1).native.paused);
  const reproduced=observed&&same.native.paused&&same.native.currentTime===0&&same.handles[0]?.isPlaying&&unlock.native.paused&&!control.native.paused&&control.native.currentTime>0;
  const recovered=observed&&validInputs&&healthy(same)&&healthy(unlock)&&healthy(control)&&scenarios.every(({initial})=>initial.states[0].handleCount===0);
  const passed=expectation==='red'?reproduced&&validInputs:recovered;
  const raw={timeUTC:new Date().toISOString(),head,status,expectation,passed,repo,node:process.version,phaser:phaserVersion,browser:browser.version(),launchPolicy:'--autoplay-policy=user-gesture-required',driver:'No evaluate or browser polling; initial/final snapshots POST from parser-loaded module; fresh context for each scenario; trusted click only after initial POST.',reproducerSha256:sha256(readFileSync(fileURLToPath(import.meta.url))),bundleSha256:sha256(result.outputFiles[0].text),wav:{path:wavPath,bytes:wav.length,sha256:sha256(wav)},sourceHashes,committedSourceHashes,scenarios,reproduced,recovered,limitations:['Minimal scene/cache harness; actual game loader and backend-selection journey not exercised.','HTML5 backend explicitly instantiated; does not establish default WebAudio behavior.','Native playback clock/event evidence is not audible or device/listening acceptance.']};
  writeFileSync(output,JSON.stringify(raw,null,2)+'\n');
  console.log(JSON.stringify({output,expectation,passed,reproduced,recovered,initialActivations:scenarios.map(x=>x.initial.initialAttempt.activation),sameKey:same,unlockOnly:unlock,resetControl:control},null,2));
  if(!passed)process.exitCode=1;
} catch (error) {
  writeFileSync(output,JSON.stringify({timeUTC:new Date().toISOString(),head,status,repo,expectation,passed:false,node:process.version,phaser:phaserVersion,browser:browser?.version(),launchPolicy:'--autoplay-policy=user-gesture-required',reproducerSha256:sha256(readFileSync(fileURLToPath(import.meta.url))),sourceHashes,committedSourceHashes,scenarios,partialPosts:[...posts.values()],failure:String(error)},null,2)+'\n');
  console.error('Native HTML5 gate failed; partial evidence at '+output+': '+String(error));
  process.exitCode=1;
} finally {await browser?.close();await new Promise(yes=>server.close(yes))}
