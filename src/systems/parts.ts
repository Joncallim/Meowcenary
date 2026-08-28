/**
 * Gun-part registry — validated-clone + deepFreeze of the part catalog,
 * following the established registry pattern (#94 P1-1).
 */
import { deepFreeze } from '../engine/freeze';
import type { PartDefinition } from '../gameplay/gunsmith';
import { validatePartCatalog } from './validation';

export class DataPartRegistry {
  private readonly byId = new Map<string, PartDefinition>();
  private readonly snapshot: readonly PartDefinition[];

  constructor(data: { gunParts: unknown }) {
    const validated = validatePartCatalog(data.gunParts);
    const canonical = validated.map((part) => deepFreeze(structuredClone(part)));

    for (const part of canonical) {
      if (this.byId.has(part.id)) {
        throw new Error(`Duplicate part id "${part.id}"`);
      }
      this.byId.set(part.id, part);
    }
    this.snapshot = Object.freeze([...canonical]);
  }

  partById(id: string): PartDefinition | undefined {
    return this.byId.get(id);
  }

  all(): readonly PartDefinition[] {
    return this.snapshot;
  }

  asMap(): ReadonlyMap<string, PartDefinition> {
    return this.byId;
  }
}
