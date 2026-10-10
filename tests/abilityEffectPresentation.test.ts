import { describe, expect, it } from 'vitest';
import definitions from '../src/data/abilities.json';
import { resolveAbilityEffectPresentation, resolveAbilityResolutionCopy } from '../src/presentation/abilityEffectPresentation';
import { activateAbility, applyAbilityEffect, createAbilityState, resolveAbilityUiState, tickAbility, type AbilityDefinition } from '../src/gameplay/abilities';
import { checkAbility } from '../src/systems/validation/abilities';

const abilities = definitions as AbilityDefinition[];
const ability = (id: string) => abilities.find((definition) => definition.id === `ability:${id}`)!;
describe('one shared mechanical explanation', () => {
  it('derives exact numeric explanation for all eight shipped abilities', () => {
    expect(abilities.map((definition) => {
      const explanation = resolveAbilityEffectPresentation(definition);
      return [explanation.headline, explanation.detail, explanation.cooldownLabel, explanation.durationLabel ?? null];
    })).toEqual([
      ['Scrap Burst', 'Knock back enemies within 90 range.', 'Cooldown 9s.', null],
      ['Overclock', 'Gain 50% fire rate and 25% movement speed for 3.5s.', 'Cooldown 12s.', 'Active 3.5s'],
      ['Shield Flicker', 'Become invulnerable for 1.2s.', 'Cooldown 15s.', 'Active 1.2s'],
      ['Giga Chomp', 'Restore up to 40 HP.', 'Cooldown 18s.', null],
      ['Adrenaline', 'Move 40% faster for 2.5s.', 'Cooldown 10s.', 'Active 2.5s'],
      ['Heat Vent', 'Deal 90 damage to enemies within 110 range.', 'Cooldown 11s.', null],
      ['Scavenge Pulse', 'Collect nearby Scrap and XP within 160 range.', 'Cooldown 8s.', null],
      ['Precision Mark', 'Gain 30% damage and +1 pierce for 4s.', 'Cooldown 14s.', 'Active 4s'],
    ]);
  });
  it('uses immutable stat chips with player-facing labels', () => {
    const result = resolveAbilityEffectPresentation(ability('overclock'));
    expect(result.statChips).toEqual([{stat:'attackSpeed',label:'+50% fire rate'}, {stat:'moveSpeed',label:'+25% movement speed'}]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.statChips)).toBe(true);
    expect(result.statChips.every(Object.isFrozen)).toBe(true);
  });
  it('supports a new content fixture through data alone without trusting description or style geometry', () => {
    const fixture: AbilityDefinition = {...ability('heat-vent'), id: 'ability:proof-burst', name: 'Proof Burst', description: 'incorrect flavour numbers', cooldownMs: 12500,
      effect: {kind:'elemental-burst',radius:75,power:33}, presentation:{cue:'heat-ring',color:'#ffffff',iconArtId:'ability-icon:proof-burst'}};
    expect(checkAbility(fixture, 0)).toEqual([]);
    expect(resolveAbilityEffectPresentation(fixture)).toEqual({headline:'Proof Burst',detail:'Deal 33 damage to enemies within 75 range.',cooldownLabel:'Cooldown 12.5s.',targetKind:'self-area',radius:75,statChips:[]});
  });
  it('preserves negative modifiers and scope instead of falsely claiming every change is a gain', () => {
    const fixture: AbilityDefinition = {...ability('overclock'), effect:{kind:'stat-burst',modifiers:[
      {stat:'damage',op:'mult',value:1.2,sourceId:'ability:overclock',scope:{kind:'weapon-family',family:'shotgun'}},
      {stat:'moveSpeed',op:'mult',value:0.8,sourceId:'ability:overclock'},
    ]}};
    expect(resolveAbilityEffectPresentation(fixture).detail).toBe('Apply +20% damage (shotgun) and -20% movement speed for 3.5s.');
  });
  it('rejects unsupported effect and modifier shapes', () => {
    expect(() => resolveAbilityEffectPresentation({...ability('heat-vent'),effect:{kind:'new-unregistered'}} as never)).toThrow('Unsupported ability effect');
    expect(() => resolveAbilityEffectPresentation({...ability('overclock'),effect:{kind:'stat-burst',modifiers:[{stat:'bogus',op:'mult',value:2}]}} as never)).toThrow('Unsupported ability modifier');
    expect(() => resolveAbilityEffectPresentation({...ability('overclock'),effect:{kind:'stat-burst',modifiers:[{stat:'toString',op:'mult',value:2}]}} as never)).toThrow('Unsupported ability modifier');
    expect(() => resolveAbilityEffectPresentation({...ability('heat-vent'),effect:{kind:'elemental-burst',radius:Infinity,power:90}})).toThrow('finite mechanical values');
    expect(checkAbility({...ability('overclock'),effect:{kind:'stat-burst',modifiers:[]}},0)).toContain('effect.modifiers: must be a non-empty array');
    expect(checkAbility({...ability('heat-vent'),presentation:{...ability('heat-vent').presentation,visualRadius:2}},0)).toContain('presentation.visualRadius: decorative self geometry is not allowed on area effects');
  });
  it('formats each actual resolution without inventing gains or counts', () => {
    expect(resolveAbilityResolutionCopy({kind:'heal',requested:40,applied:0})).toBe('+0 HP');
    expect(resolveAbilityResolutionCopy({kind:'loot-pulse',radius:160,collected:3})).toBe('Collected 3');
    expect(resolveAbilityResolutionCopy({kind:'knockback',radius:90,affected:0})).toBe('Knocked back 0');
    expect(resolveAbilityResolutionCopy({kind:'elemental-burst',radius:110,affected:2})).toBe('Hit 2');
    expect(resolveAbilityResolutionCopy({kind:'invulnerable',durationMs:1200})).toBe('INVULNERABLE 1.2s');
    const effect = ability('precision-mark').effect;
    if (effect.kind !== 'stat-burst') throw new Error('fixture');
    expect(resolveAbilityResolutionCopy({kind:'stat-burst',durationMs:4000,modifiers:effect.modifiers})).toBe('+30% damage • +1 pierce 4s');
  });
  it('freezes exact modifier and nested scope receipts separately from mutable input data', () => {
    const fixture: AbilityDefinition = structuredClone(ability('precision-mark'));
    if (fixture.effect.kind !== 'stat-burst') throw new Error('fixture');
    fixture.effect.modifiers[0].scope = {kind:'weapon-family',family:'shotgun'};
    const result = applyAbilityEffect(fixture,{player:{x:0,y:0,heal:()=>0,grantInvulnerability:()=>{}},stats:{add:()=>{},remove:()=>{}},enemies:[],damageEnemy:()=>false,collectNearbyConsumables:()=>0});
    if (result.kind !== 'stat-burst') throw new Error('receipt');
    expect(result.durationMs).toBe(4000);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.modifiers)).toBe(true);
    expect(Object.isFrozen(result.modifiers[0])).toBe(true);
    expect(Object.isFrozen(result.modifiers[0].scope)).toBe(true);
    fixture.effect.modifiers[0].value = 10;
    (fixture.effect.modifiers[0].scope as {family: string}).family = 'smg';
    expect(result.modifiers[0].value).toBe(1.3);
    expect(result.modifiers[0].scope?.family).toBe('shotgun');
  });
});

describe('authoritative ability HUD snapshot', () => {
  it('maps all one-shot internal active phases to cooling without changing mechanical timers', () => {
    for (const id of ['giga-chomp','scrap-burst','heat-vent','scavenge-pulse']) {
      const definition = ability(id);
      const state = activateAbility(createAbilityState(),definition).state;
      expect(state.phase).toBe('active');
      const ui = resolveAbilityUiState(state,definition);
      expect(ui).toEqual({phase:'cooling',activeRemainingMs:0,cooldownRemainingMs:definition.cooldownMs,readiness:0,activeProgress:0});
      expect(Object.isFrozen(ui)).toBe(true);
      const next = tickAbility(state,100);
      expect(resolveAbilityUiState(next,definition).cooldownRemainingMs).toBe(definition.cooldownMs-100);
    }
  });
  it('sustained effects have independent active and cooldown remaining values and exact expiry', () => {
    const definition = ability('shield-flicker');
    const start = activateAbility(createAbilityState(),definition).state;
    const state = tickAbility(start,600);
    expect(resolveAbilityUiState(state,definition)).toMatchObject({phase:'active',activeRemainingMs:600,cooldownRemainingMs:14400,activeProgress:0.5});
    expect(resolveAbilityUiState(state,definition).readiness).toBeCloseTo(0.04);
    const expired = tickAbility(state,600);
    expect(resolveAbilityUiState(expired,definition)).toMatchObject({phase:'cooling',activeRemainingMs:0,cooldownRemainingMs:13800,activeProgress:0});
    expect(resolveAbilityUiState(expired,definition).readiness).toBeCloseTo(0.08);
    expect(tickAbility(state,0)).toBe(state);
    expect(resolveAbilityUiState(tickAbility(state,50000),definition)).toEqual({phase:'ready',activeRemainingMs:0,cooldownRemainingMs:0,readiness:1,activeProgress:0});
  });
});
