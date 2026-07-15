import type { MetaUpgradeDefinition, GameData, UpgradeEffect } from './types';
import type { MetaUpgradeMaxLevels } from './save';
import { validateMetaUpgradeCatalog } from './validation';

export interface MetaUpgradeLookup {
  metaUpgradeById(id: string): Readonly<MetaUpgradeDefinition> | undefined;
}

export interface MetaUpgradeRegistry extends MetaUpgradeLookup {
  all(): readonly Readonly<MetaUpgradeDefinition>[];
  maxLevels(): MetaUpgradeMaxLevels;
}

export class DataMetaUpgradeRegistry implements MetaUpgradeRegistry {
  private readonly definitions: readonly Readonly<MetaUpgradeDefinition>[];
  private readonly byId: ReadonlyMap<string, Readonly<MetaUpgradeDefinition>>;
  private readonly levels: MetaUpgradeMaxLevels;

  constructor(data: Pick<GameData, 'metaUpgrades'>) {
    const validated = validateMetaUpgradeCatalog(data.metaUpgrades);
    this.definitions = Object.freeze(validated.map(cloneDefinition));
    this.byId = new Map(this.definitions.map((definition) => [definition.id, definition]));
    this.levels = Object.freeze(Object.fromEntries(
      this.definitions.map((definition) => [definition.id, definition.maxLevel]),
    ));
  }

  metaUpgradeById(id: string): Readonly<MetaUpgradeDefinition> | undefined {
    return this.byId.get(id);
  }

  all(): readonly Readonly<MetaUpgradeDefinition>[] {
    return this.definitions;
  }

  maxLevels(): MetaUpgradeMaxLevels {
    return this.levels;
  }
}

function cloneDefinition(definition: MetaUpgradeDefinition): Readonly<MetaUpgradeDefinition> {
  const effects = Object.freeze(definition.effects.map((effect): Readonly<UpgradeEffect> =>
    Object.freeze({ stat: effect.stat, op: effect.op, value: effect.value })));
  return Object.freeze({
    id: definition.id,
    name: definition.name,
    description: definition.description,
    maxLevel: definition.maxLevel,
    cost: Object.freeze({ base: definition.cost.base, growth: definition.cost.growth }),
    effects,
  });
}
