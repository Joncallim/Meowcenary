import type { GameContext, PersistenceUpdate } from '../engine/context';
import {
  equipPart,
  infuseTrait,
  isSlotCompatible,
  mergeParts,
  unequipPart,
  type OwnedPart,
  type WeaponBuild,
} from '../gameplay/gunsmith';
import { DataPartRegistry } from '../systems/parts';
import type { Build, GunsmithState, PartInstance } from '../systems/save';

export interface GunsmithPartView {
  readonly instanceId: string;
  readonly partId: string;
  readonly name: string;
  readonly slot: string;
  readonly tier: number;
  readonly traits: readonly string[];
  readonly compatible: boolean;
}

export interface GunsmithSnapshot {
  readonly selectedBuildId?: string;
  readonly builds: readonly Build[];
  readonly parts: readonly GunsmithPartView[];
}

export type GunsmithCommandResult =
  | { readonly ok: true; readonly persisted: boolean }
  | { readonly ok: false; readonly reason: string };

/** UI boundary for persistent weapon engineering.  It only adapts immutable
 * Save V3 records to pure commands; all eligibility stays in gameplay. */
export class GunsmithController {
  private readonly registry: DataPartRegistry;

  constructor(private readonly context: GameContext) {
    this.registry = new DataPartRegistry({ gunParts: context.data.gunParts ?? [] });
  }

  snapshot(): GunsmithSnapshot {
    const state = this.context.saveData.gunsmith;
    const selected = state.builds.find((build) => build.id === state.selectedBuildId);
    return Object.freeze({
      selectedBuildId: selected?.id,
      builds: Object.freeze([...state.builds]),
      parts: Object.freeze(Object.entries(state.parts).flatMap(([instanceId, stored]) => {
        const definition = this.registry.partById(stored.partId);
        if (!definition) return [];
        return [Object.freeze({
          instanceId, partId: stored.partId, name: definition.name, slot: definition.slot,
          tier: stored.tier, traits: Object.freeze([...definition.traits, ...stored.infusedTraits]),
          compatible: selected === undefined || isSlotCompatible(selected.baseWeaponFamily, definition.slot),
        })];
      })),
    });
  }

  createBuild(baseWeaponFamily: string, name = 'Main Weapon'): GunsmithCommandResult {
    if (!['pistol', 'smg', 'shotgun'].includes(baseWeaponFamily)) return { ok: false, reason: 'unknown-family' };
    const id = `build:${baseWeaponFamily}`;
    if (this.context.saveData.gunsmith.builds.some((build) => build.id === id)) return this.selectBuild(id);
    const update = this.context.updateGunsmith((state) => ({
      ...state,
      builds: [...state.builds, { id, name, baseWeaponFamily, fitted: {}, traitParts: [] }],
      selectedBuildId: id,
    }));
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  selectBuild(buildId: string): GunsmithCommandResult {
    if (!this.context.saveData.gunsmith.builds.some((build) => build.id === buildId)) return { ok: false, reason: 'unknown-build' };
    const update = this.context.updateGunsmith((state) => ({ ...state, selectedBuildId: buildId }));
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  fitPart(instanceId: string): GunsmithCommandResult {
    const state = this.context.saveData.gunsmith;
    const build = selectedBuild(state);
    const part = ownedPart(state, instanceId);
    if (!build || !part) return { ok: false, reason: build ? 'unknown-part' : 'no-selected-build' };
    const result = equipPart(build, part, this.registry.asMap());
    if (!result.ok) return result;
    return this.persistBuild(state, result.build);
  }

  unequipPart(instanceId: string): GunsmithCommandResult {
    const state = this.context.saveData.gunsmith;
    const build = selectedBuild(state);
    if (!build) return { ok: false, reason: 'no-selected-build' };
    const result = unequipPart(build, instanceId);
    if (!result.ok) return result;
    return this.persistBuild(state, result.build);
  }

  merge(firstInstanceId: string, secondInstanceId: string): GunsmithCommandResult {
    const state = this.context.saveData.gunsmith;
    const first = ownedPart(state, firstInstanceId);
    const second = ownedPart(state, secondInstanceId);
    if (!first || !second) return { ok: false, reason: 'missing-parts' };
    const result = mergeParts(first, second, this.registry.asMap());
    if (!result.ok) return result;
    const outputId = uniqueInstanceId(result.output.instanceId, state.parts);
    const update = this.context.updateGunsmith((current) => ({
      ...current,
      parts: Object.fromEntries([
        ...Object.entries(current.parts).filter(([id]) => !result.consumed.includes(id)),
        [outputId, { partId: result.output.partId, tier: result.output.tier, infusedTraits: result.output.infusedTraits }],
      ]),
      builds: removePartReferences(current.builds, result.consumed),
    }));
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  infuse(targetInstanceId: string, traitInstanceId: string): GunsmithCommandResult {
    const state = this.context.saveData.gunsmith;
    const target = ownedPart(state, targetInstanceId);
    const trait = ownedPart(state, traitInstanceId);
    if (!target || !trait || targetInstanceId === traitInstanceId) return { ok: false, reason: 'unknown-part' };
    const result = infuseTrait(target, trait, this.registry.asMap());
    if (!result.ok) return result;
    const update = this.context.updateGunsmith((current) => ({
      ...current,
      parts: Object.fromEntries(Object.entries(current.parts)
        .filter(([id]) => id !== traitInstanceId)
        .map(([id, part]) => [id, id === targetInstanceId
          ? { ...part, infusedTraits: result.output.infusedTraits }
          : part])),
      builds: removePartReferences(current.builds, [traitInstanceId]),
    }));
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }

  private persistBuild(state: GunsmithState, build: WeaponBuild): GunsmithCommandResult {
    const update: PersistenceUpdate<GunsmithState> = this.context.updateGunsmith((current) => ({
      ...current,
      builds: current.builds.map((candidate) => candidate.id === build.id ? build : candidate),
    }));
    void state;
    return update.persisted ? { ok: true, persisted: true } : { ok: false, reason: 'save-failed' };
  }
}

function selectedBuild(state: GunsmithState): WeaponBuild | undefined {
  const build = state.builds.find((candidate) => candidate.id === state.selectedBuildId);
  return build === undefined ? undefined : { ...build, fitted: { ...build.fitted }, traitParts: [...build.traitParts] };
}

function ownedPart(state: GunsmithState, instanceId: string): OwnedPart | undefined {
  const part: PartInstance | undefined = state.parts[instanceId];
  return part === undefined ? undefined : { instanceId, ...part } as OwnedPart;
}

function removePartReferences(builds: readonly Build[], instanceIds: readonly string[]): readonly Build[] {
  const removed = new Set(instanceIds);
  return builds.map((build) => ({
    ...build,
    fitted: Object.fromEntries(Object.entries(build.fitted).filter(([, id]) => id !== undefined && !removed.has(id))),
    traitParts: build.traitParts.filter((id) => !removed.has(id)),
  }));
}

function uniqueInstanceId(preferred: string, parts: Readonly<Record<string, PartInstance>>): string {
  if (!Object.hasOwn(parts, preferred)) return preferred;
  let suffix = 2;
  while (Object.hasOwn(parts, `${preferred}:${suffix}`)) suffix += 1;
  return `${preferred}:${suffix}`;
}
