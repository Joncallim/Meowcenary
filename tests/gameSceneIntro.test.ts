import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { GameScene } from '../src/scenes/GameScene';
import { createRunState, tickRun } from '../src/gameplay/runState';
import { createEventBus } from '../src/engine/eventBus';
vi.mock('../src/engine/context', async (original) => ({ ...await original(), getGameContext: (scene: any) => scene.testContext }));
function intro() {
 const scene = new GameScene() as any;
 scene.runState = createRunState({seed:42,characterId:'scrap-tabby',arenaId:'junkyard'});
 scene.testContext = {bus:createEventBus()};
 scene.inputController = {quarantineUntilNeutral:vi.fn(),suspendGameplayPointer:vi.fn(),resumeGameplayPointer:vi.fn()};
 scene.physics = {world:{pause:vi.fn(),resume:vi.fn()}};
 scene.physicsPausedByRun = true;
 scene.runStartBrief = {destroy:vi.fn(),confirmFocused:vi.fn(()=>scene.beginRunFromBrief()),moveFocus:vi.fn()};
 scene.pauseController = {snapshot:()=>({panel:'closed'}),pause:vi.fn()};
 scene.scene = {start:vi.fn()};
 return scene;
}
describe('run-start intro logical command boundary',()=>{
 it('Confirm starts once, quarantines before start publication and destroys the brief',()=>{
  const scene=intro(); const brief=scene.runStartBrief; const start=vi.fn(()=>expect(scene.inputController.quarantineUntilNeutral).toHaveBeenCalled());
  scene.testContext.bus.on('run:start',start);
  scene.routeAction('confirm');scene.routeAction('confirm');
  expect(scene.runState.status).toBe('active');expect(start).toHaveBeenCalledTimes(1);expect(brief.destroy).toHaveBeenCalledTimes(1);
 });
 it('intro freezes simulation and discards combat/manual pause/inventory commands',()=>{
  const scene=intro(); const ability=vi.spyOn(scene,'activateCharacterAbility');
  for(const action of ['ability','pause','inventory'])scene.routeAction(action);
  tickRun(scene.runState,9000);expect(scene.runState.timeMs).toBe(0);expect(scene.runState.status).toBe('intro');
  expect(ability).not.toHaveBeenCalled();expect(scene.pauseController.pause).not.toHaveBeenCalled();
 });
 it('the real scene frame keeps player, spawning and combat systems suspended in intro',()=>{
  const scene=intro();
  scene.testContext.settings={reducedMotion:false};
  scene.inputController.update=vi.fn();
  scene.inputController.getMoveVector=()=>({x:0,y:0});
  scene.inputController.getPointer=()=>undefined;
  scene.player={update:vi.fn(),health:100,maxHealth:100};
  const combat={update:vi.fn()};scene.systems=[combat];scene.enemies=[];
  scene.runStartBrief.refreshInputPresentation=vi.fn();
  scene.abilityPresentationSystem={update:vi.fn()};
  vi.spyOn(scene,'syncGameplayPointerOwnership').mockImplementation(()=>undefined);
  const ability=vi.spyOn(scene,'tickAbility');
  scene.update(0,5000);
  expect(scene.runState.timeMs).toBe(0);
  expect(scene.player.update).not.toHaveBeenCalled();
  expect(combat.update).not.toHaveBeenCalled();
  expect(ability).not.toHaveBeenCalled();
  expect(scene.physics.world.resume).not.toHaveBeenCalled();
 });
 it('Back revokes the brief and returns to Menu without terminal/start facts',()=>{
  const scene=intro();const emit=vi.spyOn(scene.testContext.bus,'emit');const brief=scene.runStartBrief;
  scene.routeAction('back');expect(scene.scene.start).toHaveBeenCalledWith('MenuScene',{quarantineInput:true});expect(brief.destroy).toHaveBeenCalledTimes(1);
  expect(emit).not.toHaveBeenCalledWith('run:start',expect.anything());expect(emit).not.toHaveBeenCalledWith('run:won',expect.anything());expect(emit).not.toHaveBeenCalledWith('run:lost',expect.anything());
  scene.beginRunFromBrief();expect(scene.runState.status).toBe('intro');
 });
});
