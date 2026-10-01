import { describe, it, expect, vi } from 'vitest';
import {createGameContext} from '../src/engine/context';
import {createEventBus} from '../src/engine/eventBus';
import {createRng} from '../src/engine/rng';
import {loadGameData} from '../src/systems/validation';
import {DataArenaRegistry} from '../src/systems/arenas';
import {DataCharacterRegistry} from '../src/systems/characters';
import {MemoryStorageAdapter,SaveManager,createDefaultSaveV4} from '../src/systems/save';
class AdversarialReadStorage extends MemoryStorageAdapter {
 mode:'normal'|'throw'|'null'|'stale'='normal';
 stale=JSON.stringify(createDefaultSaveV4());
 override getItem(key:string) {
  if(this.mode==='throw') throw new Error('transient read unavailable');
  if(this.mode==='null') return null;
  if(this.mode==='stale') return this.stale;
  return super.getItem(key);
 }
}
function setup(){
 const data=loadGameData(),storage=new AdversarialReadStorage();
 storage.setItem('review201',JSON.stringify({...createDefaultSaveV4(),progression:{scrap:999,unlocks:[]},
  stages:{'stage:junkyard-01':{completed:true,bestTimeMs:12345},'stage:junkyard-03':{completed:true,bestTimeMs:19000}},
  achievements:{'achievement:review201':{completed:true,progress:4,completedAt:12345}},
  equipment:{helmet:{equipmentId:'equipment:recon-helmet',tier:1}}}));
 const ctx=createGameContext({data,bus:createEventBus(),menuRng:createRng(1),save:new SaveManager(storage,'review201'),arenas:new DataArenaRegistry(data),characters:new DataCharacterRegistry(data)});
 return {ctx,storage};
}
const cases=(['equipment','gunsmith'] as const).flatMap(kind=>(['throw','null','stale'] as const).flatMap(mode=>(['publication','later save'] as const).map(phase=>({kind,mode,phase}))));
describe('201 independent canonical commit boundary',()=>{
 it.each(cases)('$kind $mode readback preserves career during $phase',({kind,mode,phase})=>{
  const {ctx,storage}=setup();storage.mode=mode;
  const result=kind==='equipment'?ctx.updateEquipment(({equipment})=>({equipment,loadout:{helmet:'helmet'}})):ctx.updateGunsmith(s=>({...s,builds:[{id:'build:pistol',name:'Sidearm',baseWeaponFamily:'pistol',fitted:{},traitParts:[]}],selectedBuildId:'build:pistol'}));
  expect(result.persisted).toBe(true);storage.mode='normal';
  expect(JSON.parse(storage.getItem('review201')!).progression.scrap).toBe(999);
  if(phase==='later save')ctx.updateSettings({muted:!ctx.settings.muted});
  const actual=phase==='later save'?JSON.parse(storage.getItem('review201')!):ctx.saveData;
  expect(actual.progression.scrap).toBe(999);
  expect(actual.stages['stage:junkyard-01']).toEqual({completed:true,bestTimeMs:12345});
  expect(actual.achievements['achievement:review201']).toEqual({completed:true,progress:4,completedAt:12345});
  expect(actual.equipment.helmet.tier).toBe(1);
  if(kind==='equipment')expect(actual.equipmentLoadout.helmet).toBe('helmet');
  else expect(actual.gunsmith.selectedBuildId).toBe('build:pistol');
 });
 it('publishes normalized parts rather than invalid optimistic input',()=>{
  const {ctx}=setup();expect(ctx.updateGunsmith(s=>({...s,parts:{bad:{partId:'bad',tier:999,infusedTraits:[]},good:{partId:'part:barrel-standard',tier:999,infusedTraits:['invalid']}}})).persisted).toBe(true);
  expect(ctx.saveData.gunsmith.parts.bad).toBeUndefined();
  expect(ctx.saveData.gunsmith.parts.good).toEqual({partId:'part:barrel-standard',tier:5,infusedTraits:[]});
 });
 it('publishes normalized equipment rather than invalid optimistic input',()=>{
  const {ctx}=setup();expect(ctx.updateEquipment(()=>({equipment:{bad:{equipmentId:'bad',tier:999},good:{equipmentId:'equipment:recon-helmet',tier:999}},loadout:{helmet:'good'}})).persisted).toBe(true);
  expect(ctx.saveData.equipment.bad).toBeUndefined();expect(ctx.saveData.equipment.good.tier).toBe(4);expect(ctx.saveData.equipmentLoadout?.helmet).toBe('good');
 });
});


describe('canonical commits for other durable domain commands', () => {
  const actions = [
    { name: 'Equipment fabrication', run: (ctx: ReturnType<typeof setup>['ctx']) => ctx.fabricateEquipment('equipment:commando-helmet') },
    { name: 'Part fabrication', run: (ctx: ReturnType<typeof setup>['ctx']) => ctx.fabricatePart('part:barrel-standard') },
    { name: 'Compendium discovery', run: (ctx: ReturnType<typeof setup>['ctx']) => ctx.recordCompendiumDiscovery('dust-mite', 'encountered') },
    { name: 'Equipment upgrade', run: (ctx: ReturnType<typeof setup>['ctx']) => ctx.commitEquipmentUpgrade('helmet', 1, 2, 100) },
    { name: 'Character mastery', run: (ctx: ReturnType<typeof setup>['ctx']) => ctx.recordCharacterMastery('scrap-tabby', 100) },
  ];
  it.each(actions.flatMap(action => (['throw', 'null', 'stale'] as const).map(mode => ({ ...action, mode }))))(
    '$name preserves its written snapshot with $mode readback', ({ run, mode }) => {
      const { ctx, storage } = setup();
      storage.mode = mode;
      expect(run(ctx)).toBe(true);
      storage.mode = 'normal';
      const written = JSON.parse(storage.getItem('review201')!);
      expect(ctx.saveData).toEqual(written);
      expect(written.stages['stage:junkyard-01']).toEqual({ completed: true, bestTimeMs: 12345 });
      expect(written.achievements['achievement:review201'].completed).toBe(true);
      ctx.updateSettings({ muted: !ctx.settings.muted });
      const after = JSON.parse(storage.getItem('review201')!);
      expect({ ...after, settings: written.settings }).toEqual(written);
    },
  );

  it('does not publish an earlier canonical snapshot after a rejected write', () => {
    const storage = new MemoryStorageAdapter();
    const save = new SaveManager(storage, 'canonical-rejection');
    const first = save.commit(createDefaultSaveV4())!;
    expect(Object.isFrozen(first)).toBe(true);
    vi.spyOn(storage, 'setItem').mockReturnValue(false);
    expect(save.commit({ ...first, progression: { ...first.progression, scrap: 10 } })).toBeUndefined();
    expect(JSON.parse(storage.getItem('canonical-rejection')!)).toEqual(first);
  });

  it('rejects a reported success that did not produce a fresh canonical write', () => {
    const storage = new MemoryStorageAdapter();
    const save = new SaveManager(storage, 'canonical-false-success');
    const first = save.commit(createDefaultSaveV4())!;
    vi.spyOn(save, 'save').mockReturnValue(true);
    expect(save.commit({ ...first, progression: { ...first.progression, scrap: 10 } })).toBeUndefined();
    expect(JSON.parse(storage.getItem('canonical-false-success')!)).toEqual(first);
  });
});
