/**
 * Persistent run-loadout resolver.
 *
 * Composes Equipment and Gunsmith contributions into one
 * PersistentRunLoadoutContribution for the run. Pure — no side effects,
 * no Phaser.
 *
 * V4 (Slice D): resolves from validated registries + Save V4 loadout +
 * weapon family catalog. Gunsmith engineering applies to its family even
 * if that family is absent from the starting rack.
 */
import type { Modifier } from './stats';
import type { ProjectileEffect } from './projectileEffects';
import type { BehaviorTrait } from './weaponTraits';
import { resolveFamilyTraits, resolveTraitProjectileEffects, BEHAVIOR_TRAITS } from './weaponTraits';
import { scaleModifierByTier, type ModifierSpec } from './stats';
import { type EquipmentSlot } from './equipmentV4';
import { isValidFamily } from './weaponFamilies';
import type { SaveDataV4 } from '../systems/save';
import type { GunsmithState } from '../systems/save';
import { resolveBuildModifiers, resolveBuildProjectileEffects, resolveBuildTraitModifiers, type OwnedPart, type PartDefinition, type WeaponBuild } from './gunsmith';

export interface PersistentRunLoadoutContribution {
  readonly modifiers: readonly Modifier[];
  readonly projectileEffectsByFamily: ReadonlyMap<string, readonly ProjectileEffect[]>;
}

/** Narrow production boundary for selected persistent weapon engineering.
 * It compiles once at run creation; family-scoped modifiers deliberately
 * remain in the run even if their weapon is acquired later. */
export function resolvePersistentGunsmithEngineering(
  gunsmith: GunsmithState,
  partDefinitions: ReadonlyMap<string, PartDefinition>,
): { readonly modifiers: readonly Modifier[]; readonly projectileEffectsByFamily: ReadonlyMap<string, readonly ProjectileEffect[]>; readonly selectedFamily?: string } {
  const selected = gunsmith.selectedBuildId === undefined ? undefined : gunsmith.builds.find((build) => build.id === gunsmith.selectedBuildId);
  if (!selected || !isValidFamily(selected.baseWeaponFamily)) return Object.freeze({ modifiers: Object.freeze([]), projectileEffectsByFamily: new Map() });
  const owned = new Map<string, OwnedPart>(Object.entries(gunsmith.parts).map(([instanceId, part]) => [instanceId, {
    instanceId, partId: part.partId, tier: part.tier, infusedTraits: part.infusedTraits as OwnedPart['infusedTraits'],
  }]));
  const build = selected as WeaponBuild;
  const modifiers = Object.freeze([
    ...resolveBuildModifiers(build, partDefinitions, owned),
    ...resolveBuildTraitModifiers(build, partDefinitions, owned),
  ]);
  return Object.freeze({
    modifiers,
    projectileEffectsByFamily: new Map([[selected.baseWeaponFamily, resolveBuildProjectileEffects(build, partDefinitions, owned)]]),
    selectedFamily: selected.baseWeaponFamily,
  });
}

/** A resolved equipment piece with tier-scaled modifiers. */
interface ResolvedEquipmentPiece {
  readonly id: string;
  readonly setId: string;
  readonly slot: EquipmentSlot;
  readonly tier: number;
  readonly modifiers: readonly Modifier[];
}

/** A resolved equipment set contribution (weapon traits). */
interface ResolvedSetContribution {
  readonly setId: string;
  readonly count: number;
  readonly weaponTraits: readonly BehaviorTrait[];
}

/** A resolved Gunsmith build with family scope. */
interface ResolvedGunsmithBuild {
  readonly familyId: string;
  readonly modifiers: readonly Modifier[];
  readonly traits: readonly BehaviorTrait[];
}

/**
 * Resolve the persistent loadout contribution for a run.
 *
 * @param save - The current Save V4 state
 * @param equipmentSetDefinitions - Map of set ID to set definition
 * @param equipmentPieceDefinitions - Map of piece ID to piece definition
 * @param partDefinitions - Map of part ID to part definition
 * @returns The combined contribution
 */
export function resolvePersistentRunLoadout(
  save: SaveDataV4,
  equipmentSetDefinitions: ReadonlyMap<string, {
    id: string;
    setBonuses: {
      2?: { modifiers: readonly ModifierSpec[]; weaponTraits?: readonly BehaviorTrait[] };
      4?: { modifiers: readonly ModifierSpec[]; weaponTraits?: readonly BehaviorTrait[] };
    };
  }>,
  equipmentPieceDefinitions: ReadonlyMap<string, {
    id: string;
    setId: string;
    slot: EquipmentSlot;
    effects: readonly ModifierSpec[];
  }>,
  partDefinitions: ReadonlyMap<string, {
    id: string;
    effects: readonly ModifierSpec[];
    traits: readonly BehaviorTrait[];
  }>,
): PersistentRunLoadoutContribution {
  const modifiers: Modifier[] = [];
  const traitSources: BehaviorTrait[][] = [];
  let globalTraitList: readonly BehaviorTrait[] = [];

  // ── Resolve Equipment ──────────────────────────────────────────────
  const equippedPieces: ResolvedEquipmentPiece[] = [];
  const setCounts = new Map<string, number>();

  if (save.equipmentLoadout) {
    for (const [slot, instanceId] of Object.entries(save.equipmentLoadout)) {
      if (!instanceId) continue;
      const instance = save.equipment[instanceId];
      if (!instance) continue;
      const pieceDef = equipmentPieceDefinitions.get(instance.equipmentId);
      if (!pieceDef || pieceDef.slot !== slot) continue;

      // Resolve piece modifiers with tier scaling
      const tier = Math.max(1, Math.min(4, instance.tier ?? 1));
      const pieceModifiers = pieceDef.effects.map((spec) => ({
        stat: spec.stat,
        op: spec.op as 'add' | 'mult',
        value: scaleModifierByTier(spec, tier),
        sourceId: instanceId,
      } as Modifier));
      modifiers.push(...pieceModifiers);

      equippedPieces.push({
        id: instanceId,
        setId: pieceDef.setId,
        slot: pieceDef.slot as EquipmentSlot,
        tier,
        modifiers: pieceModifiers,
      });
      setCounts.set(pieceDef.setId, (setCounts.get(pieceDef.setId) ?? 0) + 1);
    }
  }

  // Resolve set bonuses
  const resolvedSets: ResolvedSetContribution[] = [];
  for (const [setId, count] of setCounts) {
    const setDef = equipmentSetDefinitions.get(setId);
    if (!setDef) continue;

    const weaponTraits: BehaviorTrait[] = [];

    if (count >= 2 && setDef.setBonuses[2]) {
      const bonus = setDef.setBonuses[2];
      // Set bonus modifiers are not tier-scaled
      for (const spec of bonus.modifiers) {
        modifiers.push({
          stat: spec.stat,
          op: spec.op as 'add' | 'mult',
          value: spec.value,
          sourceId: `set-bonus:${setId}:2`,
        });
      }
      if (bonus.weaponTraits) weaponTraits.push(...bonus.weaponTraits);
    }
    if (count >= 4 && setDef.setBonuses[4]) {
      const bonus = setDef.setBonuses[4];
      for (const spec of bonus.modifiers) {
        modifiers.push({
          stat: spec.stat,
          op: spec.op as 'add' | 'mult',
          value: spec.value,
          sourceId: `set-bonus:${setId}:4`,
        });
      }
      if (bonus.weaponTraits) weaponTraits.push(...bonus.weaponTraits);
    }

    resolvedSets.push({ setId, count, weaponTraits });
    if (weaponTraits.length > 0) {
      traitSources.push(weaponTraits);
    }
  }

  // Resolve global Equipment traits (apply to all weapon families)
  globalTraitList = resolveFamilyTraits(traitSources);

  // ── Resolve Gunsmith Build ─────────────────────────────────────────
  let gunsmithBuild: ResolvedGunsmithBuild | null = null;
  if (save.gunsmith.selectedBuildId) {
    const build = save.gunsmith.builds.find((b) => b.id === save.gunsmith.selectedBuildId);
    if (build && isValidFamily(build.baseWeaponFamily)) {
      const buildModifiers: Modifier[] = [];
      const buildTraits: BehaviorTrait[] = [];

      // Resolve fitted parts
      for (const [, instanceId] of Object.entries(build.fitted)) {
        if (!instanceId) continue;
        const part = save.gunsmith.parts[instanceId];
        if (!part) continue;
        const partDef = partDefinitions.get(part.partId);
        if (!partDef) continue;

        // Part modifiers with tier scaling
        const tier = Math.max(1, Math.min(5, part.tier ?? 1));
        for (const spec of partDef.effects) {
          buildModifiers.push({
            stat: spec.stat,
            op: spec.op as 'add' | 'mult',
            value: scaleModifierByTier(spec, tier),
            sourceId: instanceId,
            scope: { kind: 'weapon-family', family: build.baseWeaponFamily },
          });
        }

        // Part traits (family-scoped)
        if (partDef.traits) {
          buildTraits.push(...partDef.traits);
        }

        // Infused traits
        if (part.infusedTraits) {
          for (const trait of part.infusedTraits) {
            if (BEHAVIOR_TRAITS.includes(trait as any)) {
              buildTraits.push(trait as BehaviorTrait);
            }
          }
        }
      }

      // Resolve trait parts
      for (const instanceId of build.traitParts) {
        const part = save.gunsmith.parts[instanceId];
        if (!part) continue;
        const partDef = partDefinitions.get(part.partId);
        if (!partDef) continue;

        // Trait parts also contribute their modifiers
        const tier = Math.max(1, Math.min(5, part.tier ?? 1));
        for (const spec of partDef.effects) {
          buildModifiers.push({
            stat: spec.stat,
            op: spec.op as 'add' | 'mult',
            value: scaleModifierByTier(spec, tier),
            sourceId: instanceId,
            scope: { kind: 'weapon-family', family: build.baseWeaponFamily },
          });
        }

        if (partDef.traits) {
          buildTraits.push(...partDef.traits);
        }
        if (part.infusedTraits) {
          for (const trait of part.infusedTraits) {
            if (BEHAVIOR_TRAITS.includes(trait as any)) {
              buildTraits.push(trait as BehaviorTrait);
            }
          }
        }
      }

      // Deduplicate build traits
      const uniqueBuildTraits = [...new Set(buildTraits)];
      gunsmithBuild = {
        familyId: build.baseWeaponFamily,
        modifiers: buildModifiers,
        traits: uniqueBuildTraits,
      };
    }
  }

  // ── Combine ────────────────────────────────────────────────────────
  // Gunsmith modifiers are family-scoped
  if (gunsmithBuild) {
    modifiers.push(...gunsmithBuild.modifiers);
  }

  // Resolve projectile effects per family
  const allFamilyIds = getAllFamilyIds();
  const projectileEffectsByFamily = new Map<string, readonly ProjectileEffect[]>();

  for (const familyId of allFamilyIds) {
    const familyTraits: BehaviorTrait[] = [...globalTraitList];

    // Add Gunsmith build traits for this family
    if (gunsmithBuild && gunsmithBuild.familyId === familyId) {
      // Add build traits that aren't already covered by Equipment
      for (const trait of gunsmithBuild.traits) {
        if (!familyTraits.includes(trait)) {
          familyTraits.push(trait);
        }
      }
    }

    // Resolve projectile effects from unique traits
    const effects = resolveTraitProjectileEffects(familyTraits);
    projectileEffectsByFamily.set(familyId, effects);
  }

  return {
    modifiers: Object.freeze([...modifiers]),
    projectileEffectsByFamily,
  };
}

import { getAllFamilyIds as getRegisteredFamilyIds } from './weaponFamilies';

/** Get all registered weapon family IDs (local helper). */
function getAllFamilyIds(): readonly string[] {
  return getRegisteredFamilyIds();
}
