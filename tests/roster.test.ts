import { describe, expect, it } from 'vitest';
import charactersJson from '../src/data/characters.json';
import abilitiesJson from '../src/data/abilities.json';
import { loadGameData, validateGameData } from '../src/systems/validation';
import { DataCharacterRegistry } from '../src/systems/characters';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createGameContext } from '../src/engine/context';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { SaveManager, MemoryStorageAdapter } from '../src/systems/save';
import { DataArenaRegistry } from '../src/systems/arenas';
import { StageRegistry } from '../src/systems/stageRegistry';
import { selectableCharacters, canSelectCharacter } from '../src/gameplay/characterSelection';
import {
  activateAbility,
  createAbilityState,
  tickAbility,
  abilityReadiness,
  type AbilityDefinition,
} from '../src/gameplay/abilities';
import type { CharacterDefinition } from '../src/systems/types';

const characters = charactersJson as unknown as CharacterDefinition[];
const abilities = abilitiesJson as unknown as AbilityDefinition[];

function abilityMap() {
  return new Map(abilities.map((a) => [a.id, a]));
}

describe('Epic 24 roster conformance', () => {
  it('ships a roster of 8 playable characters with unique ids', () => {
    expect(characters.length).toBe(8);
    const ids = characters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('validates through the aggregate game-data validation', () => {
    const data = loadGameData();
    expect(data.characters.length).toBe(8);
    expect(data.abilities?.length).toBe(abilities.length);
    expect(validateGameData(data)).toBeTruthy();
  });

  it('every character abilityId resolves to a registered ability', () => {
    const map = abilityMap();
    const withAbility = characters.filter((c) => c.abilityId !== undefined);
    expect(withAbility.length).toBe(characters.length); // all eight have an ability
    for (const c of withAbility) {
      expect(map.has(c.abilityId!), `character ${c.id} ability ${c.abilityId}`).toBe(true);
    }
  });

  it('characters are differentiated beyond +10% stat tweaks (distinct abilities/passives)', () => {
    const abilityIds = new Set(characters.map((c) => c.abilityId).filter(Boolean));
    expect(abilityIds.size).toBeGreaterThanOrEqual(6);
    const passiveIds = new Set(characters.flatMap((c) => c.passives.map((p) => p.id)));
    expect(passiveIds.size).toBeGreaterThanOrEqual(6);
  });

  it('unlock conditions are explicit and inspectable (no hidden random drops)', () => {
    for (const c of characters) {
      expect(c.unlock).toBeDefined();
      if (c.unlock.type === 'meta') {
        expect(typeof c.unlock.requiresUnlockId).toBe('string');
      }
    }
  });

  it('routes Scrap Weasel through a real achievement grant instead of a self-lock', () => {
    const weasel = characters.find((character) => character.id === 'scrap-weasel')!;
    expect(weasel.unlock).toEqual({ type: 'meta', requiresUnlockId: 'achievement:kill-milestone-100' });
    expect(canSelectCharacter(weasel, { scrap: 0, permanentUpgrades: {}, unlocks: [] })).toBe(false);
    expect(canSelectCharacter(weasel, { scrap: 0, permanentUpgrades: {}, unlocks: ['achievement:kill-milestone-100', 'character:scrap-weasel'] })).toBe(true);
  });

  it('starting weapons resolve to shipped weapons', () => {
    const data = loadGameData();
    const weaponIds = new Set(data.weapons.map((w) => w.id));
    for (const c of characters) {
      for (const weaponId of c.startingWeaponIds) {
        expect(weaponIds.has(weaponId), `character ${c.id} weapon ${weaponId}`).toBe(true);
      }
    }
  });

  it('exactly one default-unlock character exists (fresh-save selectable)', () => {
    const defaults = characters.filter((c) => c.unlock.type === 'default');
    expect(defaults.length).toBe(1);
    expect(defaults[0].id).toBe('scrap-tabby');
  });
});

describe('Epic 24 ability state machine (pure, deterministic, pause-safe)', () => {
  const def: AbilityDefinition = {
    id: 'ability:test', name: 'Test', description: 't',
    cooldownMs: 10000, durationMs: 2000,
    effect: { kind: 'knockback', radius: 50, power: 100 },
  };

  it('starts ready; activation fires exactly once per cooldown', () => {
    let state = createAbilityState();
    expect(state.phase).toBe('ready');
    const first = activateAbility(state, def);
    expect(first.fired).toBe(true);
    expect(first.state.phase).toBe('active');
    state = first.state;
    const second = activateAbility(state, def);
    expect(second.fired).toBe(false);
    expect(second.state).toBe(state);
  });

  it('active → cooling → ready across ticks (deterministic)', () => {
    let state = createAbilityState();
    state = activateAbility(state, def).state;
    state = tickAbility(state, 500);
    expect(state.phase).toBe('active');
    state = tickAbility(state, 1500);
    expect(state.phase).toBe('cooling');
    expect(state.cooldownRemainingMs).toBe(8000);
    state = tickAbility(state, 8000);
    expect(state.phase).toBe('ready');
  });

  it('pause-safe: no ticking means frozen state', () => {
    let state = createAbilityState();
    state = activateAbility(state, def).state;
    const paused = tickAbility(state, 0);
    expect(paused).toBe(state);
    expect(tickAbility(state, Number.NaN)).toBe(state);
  });

  it('readiness meter is deterministic (1 ready, 0 active, fraction cooling)', () => {
    let state = createAbilityState();
    expect(abilityReadiness(state, def)).toBe(1);
    state = activateAbility(state, def).state;
    expect(abilityReadiness(state, def)).toBe(0);
    state = tickAbility(state, 2500); // active expired, cooling with 7500 left of 10000
    const readiness = abilityReadiness(state, def);
    expect(readiness).toBeCloseTo(0.25, 5);
  });

  it('large ticks spanning active + cooldown return to ready', () => {
    let state = createAbilityState();
    state = activateAbility(state, def).state;
    state = tickAbility(state, 50000);
    expect(state.phase).toBe('ready');
  });
});

describe('Epic 24 unlock gating through progression', () => {
  function harness() {
    const data = loadGameData();
    const context = createGameContext({
      bus: createEventBus(),
      menuRng: createRng(1),
      data,
      metaUpgrades: new DataMetaUpgradeRegistry(data),
      save: new SaveManager(new MemoryStorageAdapter(), 'test', {}),
      characters: new DataCharacterRegistry(data),
      arenas: new DataArenaRegistry(data),
      stages: new StageRegistry(data),
    });
    const registry = new DataCharacterRegistry(data);
    return { context, registry };
  }

  it('fresh save: only the default character is selectable', () => {
    const { context, registry } = harness();
    const selectable = selectableCharacters(registry, context.saveData.progression);
    expect(selectable.map((c) => c.id)).toEqual(['scrap-tabby']);
    expect(canSelectCharacter(registry.characterById('volt-lynx')!, context.saveData.progression)).toBe(false);
  });

  it('unlocking the achievement referenced by a character unlock makes it selectable', () => {
    const { context, registry } = harness();
    const lynx = registry.characterById('volt-lynx')!;
    expect(lynx.unlock).toMatchObject({ type: 'meta', requiresUnlockId: 'achievement:kill-milestone-25' });
    const meta = {
      ...context.saveData.progression,
      unlocks: [...context.saveData.progression.unlocks, 'achievement:kill-milestone-25'],
    };
    expect(canSelectCharacter(lynx, meta)).toBe(true);
  });
});

describe('Epic 24 second-fixture proof (data-only extensibility)', () => {
  it('a new character using an existing ability + passive is data only', () => {
    const extra: CharacterDefinition = {
      id: 'proof-sphinx',
      name: 'Proof Sphinx',
      description: 'Second-fixture proof character.',
      baseStats: { maxHealth: 100, moveSpeed: 175 },
      startingWeaponIds: ['scrap-pistol-t1'],
      abilityId: 'ability:scrap-burst', // existing registered ability
      passives: [{
        id: 'proof-static',
        kind: 'static',
        name: 'Proof Static',
        description: 'No-op proof passive.',
        effects: [{ stat: 'pickupRadius', op: 'add', value: 5 }],
      } as unknown as CharacterDefinition['passives'][number]],
      unlock: { type: 'meta', requiresUnlockId: 'achievement:first-victory' },
      cosmeticSkinIds: [],
    };
    const registry = new DataCharacterRegistry({ characters: [...charactersJson, extra] as unknown as CharacterDefinition[] });
    expect(registry.characterById('proof-sphinx')).toBeDefined();
    expect(abilityMap().has(extra.abilityId!)).toBe(true);
  });
});
