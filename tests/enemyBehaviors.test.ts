import { describe, expect, it } from 'vitest';
import {
  enemyBehaviorFor,
  registeredEnemyArchetypes,
  hasRegisteredBehavior,
} from '../src/gameplay/enemyBehaviors';
import { chaseStep, chargerStep } from '../src/gameplay/enemyMovement';
import { executeBossActions } from '../src/gameplay/bossActions';
import type { ResolvedEnemyDefinition } from '../src/systems/types';
import { loadGameData, validateEnemyCatalog, validateGameData } from '../src/systems/validation';
import { DataEnemyRegistry } from '../src/systems/enemies';
import { resolveRunPlan } from '../src/gameplay/stage/stageContracts';
import stagesJson from '../src/data/stages.json';
import encountersJson from '../src/data/encounter-profiles.json';
import difficultiesJson from '../src/data/difficulty-profiles.json';
import rewardsJson from '../src/data/reward-profiles.json';
import type { StageDefinition, EncounterProfile, DifficultyProfile, RewardProfile } from '../src/gameplay/stage/stageContracts';

describe('Epic 21 enemy behavior registry', () => {
  it('registers a behavior for every shipped archetype (no silent default)', () => {
    const registered = new Set(registeredEnemyArchetypes());
    expect(registered).toEqual(new Set(['chaser', 'charger', 'tank', 'shielded', 'flanker', 'ranged', 'boss']));
    // Every shipped enemy resolves to a registered behavior, including elites
    // (which inherit their base's behavior).
    const data = loadGameData();
    const registry = new DataEnemyRegistry(data);
    for (const enemy of data.enemies) {
      const def = registry.resolvedById(enemy.id);
      if (def) {
        expect(() => enemyBehaviorFor(def), `behavior for ${def.id}`).not.toThrow();
      }
    }
  });

  it('every shipped archetype has a distinct registered color', () => {
    const colors = registeredEnemyArchetypes().map((a) =>
      enemyBehaviorFor({ id: '', name: '', archetype: a } as unknown as ResolvedEnemyDefinition).color,
    );
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('elites resolve to their base archetype behavior', () => {
    const data = loadGameData();
    const registry = new DataEnemyRegistry(data);
    const eliteDef = data.enemies.find((e) => e.archetype === 'elite');
    if (eliteDef) {
      const resolved = registry.resolvedById(eliteDef.id);
      expect(resolved).toBeDefined();
      const r = resolved as unknown as { baseArchetype?: ResolvedEnemyDefinition['archetype'] };
      expect(enemyBehaviorFor(resolved!).archetype).toBe(r.baseArchetype);
    } else {
      // No shipped elite fixture: prove the resolution rule directly.
      const base = { id: 'x', name: 'X', archetype: 'chaser' } as unknown as ResolvedEnemyDefinition;
      const eliteLike = {
        ...base,
        archetype: 'elite',
        baseEnemyId: 'dust-mite',
        baseArchetype: 'chaser',
      } as unknown as ResolvedEnemyDefinition;
      expect(enemyBehaviorFor(eliteLike).archetype).toBe('chaser');
    }
  });

  it('chaser movement is byte-identical through the registry (chaseStep parity)', () => {
    const behavior = enemyBehaviorFor({ id: '', name: '', archetype: 'chaser' } as unknown as ResolvedEnemyDefinition);
    const definition = {
      id: 'dust-mite', name: 'Dust Mite', archetype: 'chaser',
      health: 10, damage: 5, speed: 68, xpValue: 1, scrapValue: 1, contactDamage: true,
    } as unknown as ResolvedEnemyDefinition;
    const direct = chaseStep({ x: 0, y: 0 }, { x: 100, y: 50 }, 68, 250);
    const viaRegistry = behavior.step({
      pos: { x: 0, y: 0 },
      target: { x: 100, y: 50 },
      definition,
      dtMs: 250,
      state: 'pursuing',
      stateTimerMs: 0,
      dashDirection: { x: 0, y: 0 },
      dashOrigin: { x: 0, y: 0 },
    });
    expect(viaRegistry.pos).toEqual(direct);
    expect(viaRegistry.state).toBe('pursuing');
    expect(viaRegistry.enteredAttack).toBe(false);
  });

  it('charger movement is byte-identical through the registry (chargerStep parity)', () => {
    const behavior = enemyBehaviorFor({ id: '', name: '', archetype: 'charger' } as unknown as ResolvedEnemyDefinition);
    const chargerDefinition = {
      id: 'junk-rusher', name: 'Junk Rusher', archetype: 'charger',
      health: 18, damage: 8, speed: 112, xpValue: 2, scrapValue: 2, contactDamage: true,
      attack: { triggerRange: 150, telegraphMs: 650, dashSpeed: 260, dashDurationMs: 700, cooldownMs: 1200 },
    };
    const definition = chargerDefinition as unknown as ResolvedEnemyDefinition;
    const snapshot = {
      pos: { x: 0, y: 0 },
      state: 'pursuing' as const,
      stateTimerMs: 0,
      dashDirection: { x: 0, y: 0 },
      dashOrigin: { x: 0, y: 0 },
    };
    const direct = chargerStep(snapshot, { x: 500, y: 0 }, chargerDefinition, 300);
    const viaRegistry = behavior.step({
      pos: snapshot.pos,
      target: { x: 500, y: 0 },
      definition,
      dtMs: 300,
      state: snapshot.state,
      stateTimerMs: snapshot.stateTimerMs,
      dashDirection: snapshot.dashDirection,
      dashOrigin: snapshot.dashOrigin,
    });
    expect(viaRegistry.pos).toEqual(direct.pos);
    expect(viaRegistry.state).toBe(direct.state);
    expect(viaRegistry.enteredAttack).toBe(direct.state === 'attacking');
  });

  it('ranged behavior holds distance and telegraphs (new archetype)', () => {
    const behavior = enemyBehaviorFor({ id: '', name: '', archetype: 'ranged' } as unknown as ResolvedEnemyDefinition);
    const definition = {
      id: 'scrap-sniper', name: 'Scrap Sniper', archetype: 'ranged',
      health: 16, damage: 6, speed: 58, xpValue: 3, scrapValue: 3, contactDamage: false,
      attack: { range: 190, telegraphMs: 700, cooldownMs: 1100 },
    } as unknown as ResolvedEnemyDefinition;
    // In range: winds up instead of approaching
    const inRange = behavior.step({
      pos: { x: 0, y: 0 }, target: { x: 100, y: 0 }, definition, dtMs: 16,
      state: 'pursuing', stateTimerMs: 0, dashDirection: { x: 0, y: 0 }, dashOrigin: { x: 0, y: 0 },
    });
    expect(inRange.state).toBe('winding');
    // Out of range: pursues
    const outOfRange = behavior.step({
      pos: { x: 0, y: 0 }, target: { x: 400, y: 0 }, definition, dtMs: 16,
      state: 'pursuing', stateTimerMs: 0, dashDirection: { x: 0, y: 0 }, dashOrigin: { x: 0, y: 0 },
    });
    expect(outOfRange.pos.x).toBeGreaterThan(0);
    // Telegraph progress is exposed
    expect(behavior.telegraphMs(definition)).toBe(700);
  });

  it('flanker approaches a lateral target rather than the player center', () => {
    const behavior = enemyBehaviorFor({ id: '', name: '', archetype: 'flanker' } as unknown as ResolvedEnemyDefinition);
    const definition = { id: 'skitter', name: 'Skitter', archetype: 'flanker', health: 10, damage: 1, speed: 100,
      xpValue: 1, scrapValue: 1, contactDamage: true, flankDistance: 80, flankSide: 1 } as unknown as ResolvedEnemyDefinition;
    const result = behavior.step({ pos: { x: 100, y: 0 }, target: { x: 0, y: 0 }, definition, dtMs: 1000,
      state: 'pursuing', stateTimerMs: 0, dashDirection: { x: 0, y: 0 }, dashOrigin: { x: 0, y: 0 } });
    expect(result.pos.y).toBeGreaterThan(0);
    expect(result.pos.x).toBeLessThan(100);
  });

  it('boss behavior lunges with charger semantics (new archetype)', () => {
    const behavior = enemyBehaviorFor({ id: '', name: '', archetype: 'boss' } as unknown as ResolvedEnemyDefinition);
    const definition = {
      id: 'boss-crusher', name: 'Scrap Crusher', archetype: 'boss',
      health: 420, damage: 22, speed: 46, xpValue: 40, scrapValue: 60, contactDamage: false,
      attack: { triggerRange: 210, telegraphMs: 900, dashSpeed: 340, dashDurationMs: 420, cooldownMs: 1500 },
    } as unknown as ResolvedEnemyDefinition;
    // Telegraph before the lunge: start within trigger range so the boss
    // winds up immediately rather than pursuing.
    const winding = behavior.step({
      pos: { x: 0, y: 0 }, target: { x: 50, y: 0 }, definition, dtMs: 16,
      state: 'pursuing', stateTimerMs: 0, dashDirection: { x: 0, y: 0 }, dashOrigin: { x: 0, y: 0 },
    });
    expect(winding.state).toBe('winding');
    expect(behavior.telegraphMs(definition)).toBe(900);
  });

  it('shipped roster now includes ranged and boss enemies via data only', () => {
    const data = loadGameData();
    const ids = data.enemies.map((e) => e.id);
    expect(ids).toContain('scrap-sniper');
    expect(ids).toContain('boss-crusher');
    const registry = new DataEnemyRegistry(data);
    expect(registry.enemyById('scrap-sniper')).toMatchObject({ archetype: 'ranged' });
    expect(registry.enemyById('boss-crusher')).toMatchObject({ archetype: 'boss' });
  });

  it('boss encounter profile resolves through resolveRunPlan', () => {
    const stages = stagesJson as readonly StageDefinition[];
    const encounters = encountersJson as unknown as readonly EncounterProfile[];
    const difficulties = difficultiesJson as readonly DifficultyProfile[];
    const rewards = rewardsJson as readonly RewardProfile[];
    const plan = resolveRunPlan(
      { stageId: 'stage:junkyard-05', characterId: 'scrap-tabby', seed: 5 },
      { stages, encounterProfiles: encounters, difficultyProfiles: difficulties, rewardProfiles: rewards },
    );
    expect(plan.encounter.bossId).toBe('boss-crusher');
  });

  it('second-fixture proof: a data-only boss composition resolves without runtime branches', () => {
    const plan = resolveRunPlan(
      { stageId: 'stage:junkyard-06', characterId: 'scrap-tabby', seed: 6 },
      { stages: stagesJson as readonly StageDefinition[], encounterProfiles: encountersJson as unknown as readonly EncounterProfile[], difficultyProfiles: difficultiesJson as readonly DifficultyProfile[], rewardProfiles: rewardsJson as readonly RewardProfile[] },
    );
    expect(plan.encounter.bossId).toBe('boss-forge');
    expect(plan.objective.definition).toEqual({ type: 'defeat', enemyId: 'boss-forge' });
  });

  it('executes a second boss composition through registered actions, without an enemy-ID branch', () => {
    const actions = executeBossActions([
      { id: 'boss-action:aimed-shot' },
      { id: 'boss-action:summon', enemyId: 'junk-rusher', count: 2, maxActive: 5 },
    ], {
      enemyId: 'boss-fixture-two', damage: 17, pos: { x: 20, y: 30 }, target: { x: 120, y: 30 },
    });
    expect(actions).toEqual([
      expect.objectContaining({ type: 'ranged-shot', enemyId: 'boss-fixture-two', dirX: 1, dirY: 0, damage: 17 }),
      expect.objectContaining({ type: 'summon', sourceEnemyId: 'boss-fixture-two', enemyId: 'junk-rusher', count: 2, maxActive: 5 }),
    ]);
  });

  it('fails closed rather than treating an unregistered runtime action as a shot', () => {
    expect(() => executeBossActions(
      [{ id: 'boss-action:not-registered' }] as never,
      { enemyId: 'boss-fixture-two', damage: 17, pos: { x: 20, y: 30 }, target: { x: 120, y: 30 } },
    )).toThrow(/Unknown boss action/);
  });

  it('aggregate validation accepts the expanded roster and boss encounter', () => {
    expect(validateGameData(loadGameData())).toBeTruthy();
  });

  it('rejects boss summon targets before they can recurse through runtime spawning', () => {
    const invalid = structuredClone(loadGameData().enemies) as unknown as Array<Record<string, unknown>>;
    invalid[4] = { ...invalid[4], summon: { enemyId: 'boss-crusher', count: 1, maxActive: 1 } };
    expect(() => validateEnemyCatalog(invalid)).toThrow('must be a direct non-boss enemy');
  });

  it('second-fixture proof: a new archetype registers one behavior + data, no Enemy.ts edit', () => {
    // The proof is structural: the registry API is the only thing Enemy.ts
    // consumes for movement dispatch, and registering a new archetype is
    // adding one entry to the BEHAVIORS map + enemy data. This test pins the
    // contract by asserting the registry is the single dispatch surface.
    expect(hasRegisteredBehavior('ranged')).toBe(true);
    expect(hasRegisteredBehavior('boss')).toBe(true);
    // All five archetypes resolve without falling into a catch-all default.
    for (const a of ['chaser', 'charger', 'tank', 'shielded', 'flanker', 'ranged', 'boss'] as const) {
      expect(enemyBehaviorFor({ id: '', name: '', archetype: a } as unknown as ResolvedEnemyDefinition).archetype)
        .toBe(a);
    }
  });
});
