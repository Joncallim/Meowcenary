import { describe, expect, it } from 'vitest';
import { CharacterSelectionController } from '../src/ui/characterSelectionController';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { resolveCharacterRunContribution } from '../src/gameplay/characterContribution';
import { prepareRun } from '../src/gameplay/runStart';
import { assembleRunRequest } from '../src/gameplay/runRequest';
import { RuntimeConfig } from '../src/engine/config';

describe('character selection integration', () => {
  it('end-to-end: select a non-default character and observe its stats/loadout on RunState', () => {
    const data = loadGameData();
    const arenas = new DataArenaRegistry(data);
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const save = new SaveManager(new MemoryStorageAdapter(), 'integration-test', metaUpgrades.maxLevels());
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data, arenas, metaUpgrades, characters, save,
    });

    context.updateMeta((meta) => ({
      ...meta,
      unlocks: [...meta.unlocks, 'achievement:first-victory'],
    }));

    const controller = new CharacterSelectionController(context);
    const selectResult = controller.select('bolt-hound', context.selectionRevision);
    expect(selectResult.ok).toBe(true);

    const rng = createRng(42);
    const request = assembleRunRequest(context, rng);
    expect(request.characterId).toBe('bolt-hound');

    const character = characters.characterById(request.characterId);
    if (!character) throw new Error('missing character');

    const weaponRegistry = new DataWeaponRegistry(data);
    const contribution = resolveCharacterRunContribution(character, weaponRegistry);
    const prepared = prepareRun({
      state: { seed: request.seed, characterId: request.characterId, arenaId: request.arenaId },
      basePlayer: {
        maxHealth: RuntimeConfig.gameplay.player.baseMaxHealth,
        moveSpeed: RuntimeConfig.gameplay.player.baseMoveSpeed,
      },
      meta: context.saveData.meta,
      metaUpgrades,
      character: contribution,
    });

    expect(prepared.run.characterId).toBe('bolt-hound');
    expect(prepared.run.arenaId).toBe('junkyard-lot');

    // bolt-hound has base maxHealth 80 (overriding default 100)
    expect(prepared.basePlayer.maxHealth).toBe(80);
    expect(prepared.basePlayer.moveSpeed).toBe(205);

    // bolt-hound has quick-tail passive: moveSpeed * 1.05
    const quickTailSource = 'character:bolt-hound:quick-tail';
    expect(prepared.run.stats.countBySource(quickTailSource)).toBe(1);

    // bolt-hound starts with only can-smg-t1
    expect(prepared.run.equipped).toHaveLength(1);
    expect(prepared.run.equipped[0].family).toBe('smg');
  });

  it('restart: same character and arena, different seed', () => {
    const data = loadGameData();
    const arenas = new DataArenaRegistry(data);
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const save = new SaveManager(new MemoryStorageAdapter(), 'restart-test', metaUpgrades.maxLevels());
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data, arenas, metaUpgrades, characters, save,
    });

    const rng = createRng(42);
    const request1 = assembleRunRequest(context, rng);

    const character = characters.characterById(request1.characterId);
    if (!character) throw new Error('missing character');
    const weaponRegistry1 = new DataWeaponRegistry(data);
    const contribution1 = resolveCharacterRunContribution(character, weaponRegistry1);
    const prepared1 = prepareRun({
      state: { seed: request1.seed, characterId: request1.characterId, arenaId: request1.arenaId },
      basePlayer: { maxHealth: 100, moveSpeed: 175 },
      meta: context.saveData.meta,
      metaUpgrades,
      character: contribution1,
    });

    // Simulate restart: new RunRequest, same ctx
    const request2 = assembleRunRequest(context, rng);

    const character2 = characters.characterById(request2.characterId);
    if (!character2) throw new Error('missing character');
    const weaponRegistry2 = new DataWeaponRegistry(data);
    const contribution2 = resolveCharacterRunContribution(character2, weaponRegistry2);
    const prepared2 = prepareRun({
      state: { seed: request2.seed, characterId: request2.characterId, arenaId: request2.arenaId },
      basePlayer: { maxHealth: 100, moveSpeed: 175 },
      meta: context.saveData.meta,
      metaUpgrades,
      character: contribution2,
    });

    expect(prepared1.run.characterId).toBe(prepared2.run.characterId);
    expect(prepared1.run.arenaId).toBe(prepared2.run.arenaId);
    expect(prepared1.run.seed).not.toBe(prepared2.run.seed);
  });

  it('default character (scrap-tabby) has correct starting weapons and passive', () => {
    const data = loadGameData();
    const arenas = new DataArenaRegistry(data);
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const save = new SaveManager(new MemoryStorageAdapter(), 'default-test', metaUpgrades.maxLevels());
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data, arenas, metaUpgrades, characters, save,
    });

    const request = assembleRunRequest(context, createRng(42));

    const character = characters.characterById(request.characterId);
    if (!character) throw new Error('missing character');

    const weaponRegistry = new DataWeaponRegistry(data);
    const contribution = resolveCharacterRunContribution(character, weaponRegistry);
    const prepared = prepareRun({
      state: { seed: request.seed, characterId: request.characterId, arenaId: request.arenaId },
      basePlayer: { maxHealth: 100, moveSpeed: 175 },
      meta: context.saveData.meta,
      metaUpgrades,
      character: contribution,
    });

    expect(prepared.run.characterId).toBe('scrap-tabby');
    expect(prepared.run.equipped).toHaveLength(3);
    expect(prepared.run.equipped.map((w) => w.family)).toEqual(['pistol', 'smg', 'shotgun']);

    const hoarderSource = 'character:scrap-tabby:scrap-hoarder';
    expect(prepared.run.stats.countBySource(hoarderSource)).toBe(1);
  });
});
