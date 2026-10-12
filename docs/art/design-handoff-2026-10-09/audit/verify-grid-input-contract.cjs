/* Architecture proof only. Does not change repository/runtime source. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const source = process.argv[2] || path.join(__dirname, 'source');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meowcenary-grid-proof-'));
const hashes = {'focusList.ts':'9d31f9f79de0c255aea8d75238862bc944641ae9', 'scrollableFocus.ts':'6bc398c3a74a173e6fd298128fa8b317f114a18d'};
const directMethod = `  setFocusedIndex(index: number, options: { readonly reveal?: boolean } = {}): boolean {
    if (!Number.isSafeInteger(index)) throw new RangeError('index must be a safe integer');
    if (index < 0 || index >= this.items.length) return false;
    const changed = this.navigator.setIndex(index);
    this.prefixRevealed = false;
    if (options.reveal !== false) this.ensureVisible(index);
    return changed;
  }

`;
let directCases = 0, modelCases = 0;
try {
  for (const variant of ['baseline','candidate']) {
    const dir=path.join(temp,variant);fs.mkdirSync(dir);
    for (const [name,expected] of Object.entries(hashes)) {
      const bytes=fs.readFileSync(path.join(source,name));
      const actual=crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      assert.equal(actual,expected,`source parity: ${name}`);
      let text=bytes.toString('utf8');
      if (variant==='candidate' && name==='scrollableFocus.ts') {
        const marker='  /** Move focus in the given direction.  Returns true if focus changed. */';
        assert.equal(text.split(marker).length,2);text=text.replace(marker,directMethod+marker);
      }
      fs.writeFileSync(path.join(dir,name),text);
    }
    execFileSync('tsc',['--target','ES2022','--module','commonjs','--strict','--skipLibCheck','--outDir',path.join(dir,'out'),path.join(dir,'focusList.ts'),path.join(dir,'scrollableFocus.ts')],{stdio:'pipe',timeout:20000});
  }
  const Base=require(path.join(temp,'baseline/out/scrollableFocus.js')).ScrollableFocusRegion;
  const Candidate=require(path.join(temp,'candidate/out/scrollableFocus.js')).ScrollableFocusRegion;
  function region(Type,count,columns,mode='grid') {
    const r=new Type({viewportTop:100,viewportBottom:340,mode,columns});
    r.setItems(Array.from({length:count},(_,i)=>({index:i,top:100+Math.floor(i/columns)*96,bottom:188+Math.floor(i/columns)*96})));
    return r;
  }
  function oldSync(count,columns,start,target) {
    const r=region(Base,count,columns);r.navigator.setIndex(start); // fixture setup, not production API
    const trace=[start];let budget=count*3+3;
    for (const [direction,predicate] of [['down',()=>r.focusedIndex<target],['up',()=>r.focusedIndex>target]]) {
      while(predicate()) {
        if (--budget<0) return {status:'nonterminating',final:r.focusedIndex,trace:trace.slice(0,8)};
        r.moveFocus(direction);trace.push(r.focusedIndex);
      }
    }
    return {status:r.focusedIndex===target?'exact':'wrong-index',final:r.focusedIndex,trace};
  }
  const witnesses={priorExample:oldSync(9,2,0,1),topRowStall:oldSync(9,2,1,0),bottomRowStall:oldSync(10,2,0,9)};
  assert.equal(witnesses.priorExample.status,'wrong-index');assert.deepEqual(witnesses.priorExample.trace,[0,2,0]);
  assert.equal(witnesses.topRowStall.status,'nonterminating');assert.equal(witnesses.bottomRowStall.status,'nonterminating');
  for (const mode of ['linear','grid']) for (const columns of [1,2,3]) for (const count of [0,1,2,8,9,10,50]) {
    for (let start=0;start<Math.max(1,count);start++) {
      const r=region(Candidate,count,columns,mode);r.navigator.setIndex(start);
      r.moveFocus=()=>{throw new Error('Direct reconciliation called directional navigation');};
      for (let target=0;target<count;target++) {
        r.navigator.setIndex(start); // reset for every start/target pair
        r.setScrollOffset(52);const offset=r.scrollOffset;
        r.setFocusedIndex(target,{reveal:false});assert.equal(r.focusedIndex,target);assert.equal(r.scrollOffset,offset);directCases++;
        r.setFocusedIndex(target);assert.equal(r.focusedIndex,target);
        const item=r.itemLayout(target);assert.ok(item.top-r.scrollOffset>=100);assert.ok(item.bottom-r.scrollOffset<=340);directCases++;
      }
      const before=[r.focusedIndex,r.scrollOffset];
      for (const invalid of [-1,count,count+100]) {assert.equal(r.setFocusedIndex(invalid),false);assert.deepEqual([r.focusedIndex,r.scrollOffset],before);}
      for (const invalid of [NaN,Infinity,0.5]) {assert.throws(()=>r.setFocusedIndex(invalid),RangeError);assert.deepEqual([r.focusedIndex,r.scrollOffset],before);}
      r.destroy();assert.equal(r.focusedIndex,-1);assert.equal(r.setFocusedIndex(0),false);
    }
  }
  // Proposal model: half-open rectangle, one pinned gesture, one mount generation.
  const rect={x:16,y:120,width:600,height:400};
  const inside=(p,r)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=r.x&&p.x<r.x+r.width&&p.y>=r.y&&p.y<r.y+r.height;
  function begin(id,p,generation,key){return inside(p,rect)?{id,x:p.x,y:p.y,generation,key,dragged:false}:null;}
  function move(g,id,p,generation){if(!g||g.id!==id||g.generation!==generation)return;g.dragged ||= Math.hypot(p.x-g.x,p.y-g.y)>=8;}
  function release(g,id,p,generation,key){return !!g&&g.id===id&&g.generation===generation&&!g.dragged&&g.key===key&&inside(p,rect);}
  for (let n=0;n<100;n++) {
    const x=30+n,y=200;const g=begin(1,{x,y},1,'item:a');assert.ok(g);
    move(g,2,{x,y:y+30},1);assert.equal(g.dragged,false);assert.equal(release(g,2,{x,y},1,'item:a'),false);
    assert.equal(release(g,1,{x,y},2,'item:a'),false);assert.equal(release(g,1,{x,y},1,'item:b'),false);
    assert.equal(release(g,1,{x:650,y},1,'item:a'),false);assert.equal(release(g,1,{x,y},1,'item:a'),true);
    move(g,1,{x,y:y+8},1);move(g,1,{x,y},1);assert.equal(release(g,1,{x,y},1,'item:a'),false);modelCases++;
  }
  for (const p of [{x:650,y:200},{x:616,y:200},{x:20,y:520},{x:NaN,y:200},{x:20,y:119}]) {assert.equal(inside(p,rect),false);assert.equal(begin(1,p,1,'item:a'),null);modelCases++;}
  // Semantic anchor restoration uses key + row-local offset, not old list index.
  const anchorOffset=(rowTop,rowHeight,intra,viewportTop,contentBottom,viewportHeight)=>Math.max(0,Math.min(rowTop+Math.max(0,Math.min(intra,rowHeight-1))-viewportTop,Math.max(0,contentBottom-viewportTop-viewportHeight)));
  for(const count of [8,9,10,50]) for(const fromColumns of [2,3]) for(const toColumns of [2,3]) for(let i=0;i<count;i++) {
    const oldTop=100+Math.floor(i/fromColumns)*96,newTop=100+Math.floor(i/toColumns)*96;
    const bottom=100+Math.ceil(count/toColumns)*96;
    const offset=anchorOffset(newTop,96,12,100,bottom,240);
    assert.ok(offset>=0&&offset<=Math.max(0,bottom-340));
    if (newTop+12-100<=Math.max(0,bottom-340)) assert.equal(offset,newTop+12-100);
    assert.ok(Number.isFinite(oldTop));modelCases++;
  }
  console.log(JSON.stringify({node:process.version,sourceHashes:hashes,witnesses,directFocusCases:directCases,geometryGestureAnchorModelCases:modelCases,result:'PASS',limits:'Temporary pure-primitive candidate and specification models only; no integrated Phaser/browser/device or full repository test run.'},null,2));
} finally {fs.rmSync(temp,{recursive:true,force:true});}
