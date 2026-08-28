/**
 * Ability registry — validated-clone + deepFreeze (registry pattern).
 */
import { deepFreeze } from '../engine/freeze';
import type { AbilityDefinition } from '../gameplay/abilities';
import { validateAbilityCatalog } from './validation';

export class DataAbilityRegistry {
  private readonly byId = new Map<string, AbilityDefinition>();
  private readonly snapshot: readonly AbilityDefinition[];

  constructor(data: { abilities: unknown }) {
    const validated = validateAbilityCatalog(data.abilities);
    const canonical = validated.map((a) => deepFreeze(structuredClone(a)));

    for (const ability of canonical) {
      if (this.byId.has(ability.id)) {
        throw new Error(`Duplicate ability id "${ability.id}"`);
      }
      this.byId.set(ability.id, ability);
    }
    this.snapshot = Object.freeze([...canonical]);
  }

  abilityById(id: string): AbilityDefinition | undefined {
    return this.byId.get(id);
  }

  all(): readonly AbilityDefinition[] {
    return this.snapshot;
  }

  asMap(): ReadonlyMap<string, AbilityDefinition> {
    return this.byId;
  }
}
