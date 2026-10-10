import { describe, expect, it, vi } from 'vitest';
import { applyAbilityEffect, type AbilityDefinition, type AbilityRuntime } from '../src/gameplay/abilities';
import abilities from '../src/data/abilities.json';
import { checkAbility } from '../src/systems/validation/abilities';

const definition = (id: string) => abilities.find((ability) => ability.id === `ability:${id}`) as AbilityDefinition;
function runtime(overrides: Partial<AbilityRuntime> = {}): AbilityRuntime {
  return { player: { x: 0, y: 0, heal: vi.fn(() => 7), grantInvulnerability: vi.fn() },
    stats: { add: vi.fn(), remove: vi.fn() }, enemies: [], damageEnemy: vi.fn(() => true),
    collectNearbyConsumables: vi.fn(() => 3), ...overrides };
}
describe('authoritative ability resolution', () => {
  it('reports actual clamped healing, including zero, as immutable facts', () => {
    const result = applyAbilityEffect(definition('giga-chomp'), runtime());
    expect(result).toEqual({ kind: 'heal', requested: 40, applied: 7 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(applyAbilityEffect(definition('giga-chomp'), runtime({player: {x: 0, y: 0, heal: () => 0, grantInvulnerability: vi.fn()}})))
      .toEqual({kind: 'heal', requested: 40, applied: 0});
  });
  it('forwards the real admitted collection count', () => {
    expect(applyAbilityEffect(definition('scavenge-pulse'), runtime())).toEqual({ kind: 'loot-pulse', radius: 160, collected: 3 });
  });
  it('counts only live eligible successful damage and preserves no-source damage semantics', () => {
    const enemies = [
      { x: 10, y: 0, active: true, state: 'pursuing', body: {setVelocity: vi.fn()} },
      { x: 20, y: 0, active: true, state: 'pursuing', body: {setVelocity: vi.fn()} },
      { x: 20, y: 0, active: false, state: 'dead', body: {setVelocity: vi.fn()} },
      { x: 200, y: 0, active: true, state: 'pursuing', body: {setVelocity: vi.fn()} },
    ];
    const damageEnemy = vi.fn((enemy) => enemy === enemies[0]);
    expect(applyAbilityEffect(definition('heat-vent'), runtime({enemies, damageEnemy})))
      .toEqual({kind: 'elemental-burst', radius: 110, affected: 1});
    expect(damageEnemy.mock.calls).toEqual([[enemies[0], 90], [enemies[1], 90]]);
  });
  it('counts owner-approved knockback and leaves dead targets untouched', () => {
    const yes = { x: 30, y: 40, active: true, state: 'pursuing', body: {setVelocity: vi.fn()}, applyKnockback: vi.fn(() => true) };
    const no = {...yes, applyKnockback: vi.fn(() => false)};
    const dead = {...yes, state: 'dead', applyKnockback: vi.fn(() => true)};
    expect(applyAbilityEffect(definition('scrap-burst'), runtime({enemies: [yes, no, dead]})))
      .toEqual({kind: 'knockback', radius: 90, affected: 1});
    expect(yes.applyKnockback).toHaveBeenCalledWith(156, 208);
    expect(dead.applyKnockback).not.toHaveBeenCalled();
  });
  it('preserves the zero-distance impulse and includes the exact radius boundary', () => {
    const atOrigin = {x:0,y:0,active:true,state:'pursuing',body:{setVelocity:vi.fn()},applyKnockback:vi.fn(() => true)};
    const boundary = {...atOrigin,x:90,applyKnockback:vi.fn(() => true)};
    const outside = {...atOrigin,x:90.01,applyKnockback:vi.fn(() => true)};
    expect(applyAbilityEffect(definition('scrap-burst'),runtime({enemies:[atOrigin,boundary,outside]})))
      .toEqual({kind:'knockback',radius:90,affected:2});
    expect(atOrigin.applyKnockback).toHaveBeenCalledWith(0,0);
    expect(boundary.applyKnockback).toHaveBeenCalledWith(260,0);
    expect(outside.applyKnockback).not.toHaveBeenCalled();
  });
  it('rejects a second mechanical radius in presentation data', () => {
    const ability = structuredClone(definition('heat-vent'));
    expect(checkAbility({...ability, presentation: {...ability.presentation, radius: 999}}, 0))
      .toContain('presentation.radius: gameplay geometry belongs only to effect.radius');
  });
});
