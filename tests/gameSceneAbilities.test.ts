import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import abilitiesJson from '../src/data/abilities.json';
import { GameScene } from '../src/scenes/GameScene';
import type { AbilityDefinition } from '../src/gameplay/abilities';
import { checkAbility } from '../src/systems/validation/abilities';

const abilities = new Map((abilitiesJson as AbilityDefinition[]).map((ability) => [ability.id, ability]));

// Mock getGameContext to return a minimal context with a bus
const mockBus = { emit: vi.fn(), on: vi.fn() };
vi.mock('../src/engine/context', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getGameContext: () => ({ bus: mockBus }),
    GAME_CONTEXT_REGISTRY_KEY: 'meowcenary.gameContext',
  };
});

function activate(id: string) {
  const scene = new GameScene() as any;
  const stats = { add: vi.fn(), remove: vi.fn() };
  const player = { x: 0, y: 0, heal: vi.fn(() => 0), grantInvulnerability: vi.fn() };
  scene.abilityDefinition = abilities.get(id);
  scene.runState = { status: 'active', stats };
  scene.player = player;
  scene.enemies = [];
  scene.activateCharacterAbility();
  return { scene, player, stats };
}

describe('GameScene character ability runtime bridge', () => {
  it('rejects a stat burst whose cleanup source is not its ability identity', () => {
    expect(checkAbility({ id: 'ability:fixture', name: 'Fixture', description: 'Fixture', cooldownMs: 1, durationMs: 1,
      effect: { kind: 'stat-burst', modifiers: [{ stat: 'damage', op: 'mult', value: 2, sourceId: 'ability:other' }] } }, 0))
      .toContain('effect.modifiers[0].sourceId: must equal ability ID');
  });

  it('executes heal and invulnerability through the live player owner exactly once per cooldown', () => {
    const heal = activate('ability:giga-chomp');
    heal.scene.controlsView = { setAbilityUiState: vi.fn() };
    heal.player.heal.mockClear();
    heal.scene.abilityState = { phase: 'ready', activeRemainingMs: 0, cooldownRemainingMs: 0 };
    heal.scene.activateCharacterAbility();
    expect(heal.player.heal).toHaveBeenCalledWith(40);
    expect(heal.scene.controlsView.setAbilityUiState).toHaveBeenCalledWith(expect.objectContaining({phase:'cooling',cooldownRemainingMs:18_000,activeRemainingMs:0}));
    heal.scene.activateCharacterAbility();
    expect(heal.player.heal).toHaveBeenCalledTimes(1);

    const shield = activate('ability:shield-flicker');
    expect(shield.player.grantInvulnerability).toHaveBeenCalledWith(1200);
  });

  it('refreshes ability feedback when an active effect moves to cooling', () => {
    const adrenaline = activate('ability:adrenaline');
    adrenaline.scene.controlsView = { setAbilityUiState: vi.fn() };
    adrenaline.scene.tickAbility(2500);
    expect(adrenaline.scene.controlsView.setAbilityUiState).toHaveBeenCalledWith(expect.objectContaining({phase:'cooling',cooldownRemainingMs:expect.any(Number)}));
  });

  it('refreshes cooldown feedback as the visible remaining second changes', () => {
    const shield = activate('ability:shield-flicker');
    shield.scene.controlsView = { setAbilityUiState: vi.fn() };
    shield.scene.tickAbility(1_000);
    expect(shield.scene.controlsView.setAbilityUiState).toHaveBeenCalledWith(expect.objectContaining({phase:'active',cooldownRemainingMs:14_000,activeRemainingMs:200}));
    shield.scene.controlsView.setAbilityUiState.mockClear();
    shield.scene.tickAbility(100);
    expect(shield.scene.controlsView.setAbilityUiState).toHaveBeenCalledWith(expect.objectContaining({phase:'active',activeRemainingMs:100,cooldownRemainingMs:13900}));
  });

  it('does not advance ability durations or cooldowns behind paused, clear, or terminal UI', () => {
    const adrenaline = activate('ability:adrenaline');
    const initial = adrenaline.scene.abilityState;
    adrenaline.scene.runState.status = 'paused';
    adrenaline.scene.tickAbility(5_000);
    expect(adrenaline.scene.abilityState).toEqual(initial);

    adrenaline.scene.runState.status = 'active';
    adrenaline.scene.stageRuntime = { pendingClear: {} };
    adrenaline.scene.tickAbility(5_000);
    expect(adrenaline.scene.abilityState).toEqual(initial);

    adrenaline.scene.stageRuntime = undefined;
    adrenaline.scene.runState.status = 'won';
    adrenaline.scene.tickAbility(5_000);
    expect(adrenaline.scene.abilityState).toEqual(initial);
  });

  it('executes temporary stat abilities through RunState and removes their exact sources at expiry', () => {
    const adrenaline = activate('ability:adrenaline');
    expect(adrenaline.stats.add).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'ability:adrenaline', stat: 'moveSpeed' }));
    adrenaline.scene.tickAbility(2500);
    expect(adrenaline.stats.remove).toHaveBeenCalledWith('ability:adrenaline');

    const mark = activate('ability:precision-mark');
    expect(mark.stats.add).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'ability:precision-mark', stat: 'damage' }));
    expect(mark.stats.add).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'ability:precision-mark', stat: 'pierce' }));

    const overclock = activate('ability:overclock');
    expect(overclock.stats.add).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'ability:overclock', stat: 'attackSpeed' }));
    expect(overclock.stats.add).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'ability:overclock', stat: 'moveSpeed' }));
  });

  it('executes nearby knockback and elemental damage against live enemy instances', () => {
    const knockback = activate('ability:scrap-burst');
    const pushed = { active:true,state:'pursuing', x: 30, y: 40, body: { setVelocity: vi.fn() }, takeDamageWithReceipt: vi.fn(()=>({applied:true,killed:false})) };
    knockback.scene.abilityState = { phase: 'ready', activeRemainingMs: 0, cooldownRemainingMs: 0 };
    knockback.scene.enemies = [pushed];
    knockback.scene.activateCharacterAbility();
    expect(pushed.body.setVelocity).toHaveBeenCalledWith(156, 208);

    const fire = activate('ability:heat-vent');
    const burned = { active:true,state:'pursuing', x: 10, y: 0, body: { setVelocity: vi.fn() }, takeDamageWithReceipt: vi.fn(()=>({applied:true,killed:false})) };
    fire.scene.abilityState = { phase: 'ready', activeRemainingMs: 0, cooldownRemainingMs: 0 };
    fire.scene.enemies = [burned];
    fire.scene.activateCharacterAbility();
    // applyEnemyDamage calls enemy.takeDamage internally
    expect(burned.takeDamageWithReceipt).toHaveBeenCalledWith(90, undefined);
  });

  it('rejects new activations at completed-objective and pending-clear boundaries', () => {
    const t=activate('ability:giga-chomp');t.player.heal.mockClear();
    for(const runtime of [{state:{status:'objective-complete'}},{pendingClear:{}}]) {
      t.scene.stageRuntime=runtime;t.scene.abilityState={phase:'ready',activeRemainingMs:0,cooldownRemainingMs:0};
      t.scene.activateCharacterAbility();
    }
    expect(t.player.heal).not.toHaveBeenCalled();
  });

  it('executes Scavenge Pulse through the drop-system collection boundary', () => {
    const scene = new GameScene() as any;
    const collectNearbyConsumables = vi.fn(()=>{scene.runState.status='paused';scene.runState.pauseReason='levelUp';return 3;});
    scene.abilityPresentationSystem={update:vi.fn()};
    scene.abilityDefinition = abilities.get('ability:scavenge-pulse');
    scene.runState = { status: 'active', stats: { add: vi.fn(), remove: vi.fn() } };
    scene.player = { x: 0, y: 0, heal: vi.fn(() => 0), grantInvulnerability: vi.fn() };
    scene.dropSystem = { collectNearbyConsumables };
    scene.activateCharacterAbility();
    expect(collectNearbyConsumables).toHaveBeenCalledWith(160);
    expect(scene.abilityPresentationSystem.update).toHaveBeenCalledWith(0,false);
    expect(scene.runState.pauseReason).toBe('levelUp');
    expect(mockBus.emit).toHaveBeenCalledWith('ability:resolved',expect.objectContaining({resolution:{kind:'loot-pulse',radius:160,collected:3}}));
  });
});
