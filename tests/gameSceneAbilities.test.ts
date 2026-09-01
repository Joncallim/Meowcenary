import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import abilitiesJson from '../src/data/abilities.json';
import { GameScene } from '../src/scenes/GameScene';
import type { AbilityDefinition } from '../src/gameplay/abilities';
import { checkAbility } from '../src/systems/validation/abilities';

const abilities = new Map((abilitiesJson as AbilityDefinition[]).map((ability) => [ability.id, ability]));

function activate(id: string) {
  const scene = new GameScene() as any;
  const stats = { add: vi.fn(), remove: vi.fn() };
  const player = { x: 0, y: 0, heal: vi.fn(), grantInvulnerability: vi.fn() };
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
    heal.scene.hudController = { requestRender: vi.fn() };
    heal.player.heal.mockClear();
    heal.scene.abilityState = { phase: 'ready', activeRemainingMs: 0, cooldownRemainingMs: 0 };
    heal.scene.activateCharacterAbility();
    expect(heal.player.heal).toHaveBeenCalledWith(40);
    expect(heal.scene.hudController.requestRender).toHaveBeenCalledTimes(1);
    heal.scene.activateCharacterAbility();
    expect(heal.player.heal).toHaveBeenCalledTimes(1);

    const shield = activate('ability:shield-flicker');
    expect(shield.player.grantInvulnerability).toHaveBeenCalledWith(1200);
  });

  it('refreshes ability feedback when an active effect moves to cooling', () => {
    const adrenaline = activate('ability:adrenaline');
    adrenaline.scene.hudController = { requestRender: vi.fn() };
    adrenaline.scene.tickAbility(2500);
    expect(adrenaline.scene.hudController.requestRender).toHaveBeenCalledTimes(1);
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
    const pushed = { x: 30, y: 40, body: { setVelocity: vi.fn() }, takeDamage: vi.fn() };
    knockback.scene.abilityState = { phase: 'ready', activeRemainingMs: 0, cooldownRemainingMs: 0 };
    knockback.scene.enemies = [pushed];
    knockback.scene.activateCharacterAbility();
    expect(pushed.body.setVelocity).toHaveBeenCalledWith(156, 208);

    const fire = activate('ability:heat-vent');
    const burned = { x: 10, y: 0, body: { setVelocity: vi.fn() }, takeDamage: vi.fn() };
    fire.scene.abilityState = { phase: 'ready', activeRemainingMs: 0, cooldownRemainingMs: 0 };
    fire.scene.enemies = [burned];
    fire.scene.activateCharacterAbility();
    expect(burned.takeDamage).toHaveBeenCalledWith(90);
  });

  it('executes Scavenge Pulse through the drop-system collection boundary', () => {
    const scene = new GameScene() as any;
    const collectNearbyConsumables = vi.fn();
    scene.abilityDefinition = abilities.get('ability:scavenge-pulse');
    scene.runState = { status: 'active', stats: { add: vi.fn(), remove: vi.fn() } };
    scene.player = { x: 0, y: 0, heal: vi.fn(), grantInvulnerability: vi.fn() };
    scene.dropSystem = { collectNearbyConsumables };
    scene.activateCharacterAbility();
    expect(collectNearbyConsumables).toHaveBeenCalledWith(160);
  });
});
