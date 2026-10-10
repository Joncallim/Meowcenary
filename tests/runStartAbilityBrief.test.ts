import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { RunStartAbilityBrief } from '../src/ui/runStartAbilityBrief';
import { loadGameData } from '../src/systems/validation';
import { DataVisualArtRegistry } from '../src/systems/visualArt';
import { resolveAbilityEffectPresentation } from '../src/presentation/abilityEffectPresentation';
class Node extends EventEmitter {
 destroyed=false; height=20; width=100; list:Node[]=[];
 constructor(public x:number,public y:number,public text=''){super();}
 setDepth(){return this;}setScrollFactor(){return this;}setOrigin(){return this;}setInteractive(){return this;}setDisplaySize(){return this;}setStrokeStyle(){return this;}setFillStyle(){return this;}setStyle(){return this;}
 setWordWrapWidth(){return this;}setText(text:string){if(this.destroyed)throw Error('dead text');this.text=text;return this;}
 add(node:Node){this.list.push(node);return this;}
 destroy(children=false){this.destroyed=true;if(children)this.list.forEach(n=>n.destroy(true));this.removeAllListeners();}
}
function setup() {
 const created:Node[]=[];const scale=new EventEmitter() as EventEmitter&{width:number;height:number};scale.width=390;scale.height=844;
 const node=(x:number,y:number,text='')=>{const n=new Node(x,y,text);created.push(n);return n;};
 const scene={scale,add:{container:node,rectangle:node,image:node,text:node}};
 const data=loadGameData(),art=new DataVisualArtRegistry(data);const start=vi.fn(),back=vi.fn();
 const model=Object.freeze({mercenaryName:'Scrap Tabby',portrait:art.bindingById('character-portrait:scrap-tabby')!,icon:art.bindingById('ability-icon:scrap-burst')!,ability:resolveAbilityEffectPresentation(data.abilities![0])});
 const view=new RunStartAbilityBrief(scene as never,model,()=> 'keyboard',start,back);
 return {view,scene,scale,created,start,back};
}
describe('run-start brief surface ownership',()=>{
 it('explains all logical bindings before quarantined launch input can establish modality',()=>{
  const t=setup();const hint=(t.view as any).hint.text;
  for(const binding of ['Q','left face','tap card','Enter/Space','bottom face'])expect(hint).toContain(binding);
  t.view.destroy();
 });
 it('touch and logical Confirm share guarded Start; navigation can select Back',()=>{
  const t=setup();const buttons=(t.view as any).buttons;
  buttons[0].target.emit('pointerdown');buttons[0].target.emit('pointerup');t.view.confirmFocused();
  expect(t.start).toHaveBeenCalledTimes(1);
  t.view.moveFocus('down');t.view.confirmFocused();expect(t.back).toHaveBeenCalledTimes(1);t.view.destroy();
 });
 it('resize preserves semantic focus and revokes a gesture from the old display',()=>{
  const t=setup();t.view.moveFocus('down');const old=(t.view as any).buttons[1].target;
  old.emit('pointerdown');const queued=old.listeners('pointerup')[0];t.scale.width=844;t.scale.height=390;t.scale.emit('resize');
  queued();expect(t.start).not.toHaveBeenCalled();expect(t.back).not.toHaveBeenCalled();
  t.view.confirmFocused();expect(t.back).toHaveBeenCalledTimes(1);t.view.destroy();
 });
 it('shutdown disposes objects/listener and captured callbacks cannot resurrect the view',()=>{
  const t=setup();const target=(t.view as any).buttons[0].target;target.emit('pointerdown');const queued=target.listeners('pointerup')[0];
  t.view.destroy();t.view.destroy();queued();t.scale.emit('resize');t.view.confirmFocused();t.view.refreshInputPresentation();
  expect(t.start).not.toHaveBeenCalled();expect(t.scale.listenerCount('resize')).toBe(0);expect(t.created.every(n=>n.destroyed)).toBe(true);
 });
});
