import { deepFreeze } from '../engine/freeze';
import { EQUIPMENT_SLOTS, equipEquipment, unequipEquipment, upgradeEquipment, type EquipmentSlot, type OwnedEquipment } from '../gameplay/equipment';
import { resolveBuildTraits, type OwnedPart } from '../gameplay/gunsmith';
import { resolvePersistentRunLoadout } from '../gameplay/persistentLoadout';
import { getAllFamilyIds, isValidFamily } from '../gameplay/weaponFamilies';
import type { BehaviorTrait } from '../gameplay/weaponTraits';
import type { Modifier } from '../gameplay/stats';
import type { ProjectileEffect } from '../gameplay/projectileEffects';
import type { SaveDataV4 } from '../systems/save';
import type { GameData } from '../systems/types';
import { presentLoadoutModifier, presentLoadoutTrait, type LoadoutEffectPresentation } from './loadoutPresentation';

type Catalog = Pick<GameData, 'equipment' | 'equipmentSets' | 'gunParts'>;
export interface EquipmentItemPresentation {
  readonly instanceId: string;
  readonly equipmentId: string;
  readonly slot: EquipmentSlot;
  readonly tier: number;
  readonly name: string;
  readonly iconArtId: string;
  readonly setId: string;
  readonly state: 'EQUIPPED' | 'STORED';
  readonly effects: readonly LoadoutEffectPresentation[];
}
export interface EquipmentSetProgressPresentation {
  readonly setId: string;
  readonly name: string;
  readonly emblemArtId: string;
  readonly equippedCount: number;
  readonly nextThreshold?: 2 | 4;
  readonly pips: readonly boolean[];
  readonly thresholds: readonly {
    readonly count: 2 | 4;
    readonly active: boolean;
    readonly effects: readonly LoadoutEffectPresentation[];
  }[];
}
export interface EquipmentLoadoutPresentation {
  readonly slots: readonly {
    readonly slot: EquipmentSlot;
    readonly label: string;
    readonly equipped?: EquipmentItemPresentation;
    readonly candidates: readonly EquipmentItemPresentation[];
  }[];
  readonly sets: readonly EquipmentSetProgressPresentation[];
  /** Arrays preserve immutable snapshots: Object.freeze(Map) would still
   * allow .set(), and renderer mutations must never alter preview truth. */
  readonly runTruth: {
    readonly modifiers: readonly Modifier[];
    readonly families: readonly {
      readonly familyId: string;
      readonly projectileEffects: readonly ProjectileEffect[];
      readonly traits: readonly {
        readonly trait: BehaviorTrait;
        readonly sourceIds: readonly string[];
        readonly sourceLabels: readonly string[];
        readonly deduplicated: boolean;
      }[];
    }[];
  };
}

export function resolveEquipmentLoadoutPresentation(save: SaveDataV4, catalog: Catalog): EquipmentLoadoutPresentation {
  const definitions = new Map((catalog.equipment ?? []).map((piece) => [piece.id, piece]));
  const parts = new Map((catalog.gunParts ?? []).map((part) => [part.id, part]));
  const items: EquipmentItemPresentation[] = Object.entries(save.equipment).flatMap(([instanceId, owned]) => {
    const piece = definitions.get(owned.equipmentId);
    return piece ? [{ instanceId, equipmentId: piece.id, slot: piece.slot, tier: owned.tier, name: piece.name,
      iconArtId: piece.icon, setId: piece.setId, state: save.equipmentLoadout?.[piece.slot] === instanceId ? 'EQUIPPED' as const : 'STORED' as const,
      effects: piece.effects.map((effect) => presentLoadoutModifier(effect, owned.tier)) }] : [];
  });
  const counts = new Map<string, number>();
  for (const item of items) if (item.state === 'EQUIPPED') counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
  const sets = (catalog.equipmentSets ?? []).map((set) => ({ setId: set.id, name: set.name, emblemArtId: set.emblem,
    equippedCount: counts.get(set.id) ?? 0,
    nextThreshold: ([2, 4] as const).find((threshold) => (counts.get(set.id) ?? 0) < threshold),
    pips: Array.from({ length: 4 }, (_, index) => index < (counts.get(set.id) ?? 0)),
    thresholds: ([2, 4] as const).map((count) => ({ count, active: (counts.get(set.id) ?? 0) >= count,
      effects: [...set.thresholds[count].modifiers.map((effect) => presentLoadoutModifier(effect)),
        ...(set.thresholds[count].weaponTraits ?? []).map((trait) => presentLoadoutTrait(trait))] })) }));
  const sources: { trait: BehaviorTrait; sourceId: string; sourceLabel: string; familyId?: string }[] = [];
  for (const set of catalog.equipmentSets ?? []) for (const threshold of [2, 4] as const) {
    if ((counts.get(set.id) ?? 0) < threshold) continue;
    for (const trait of set.thresholds[threshold].weaponTraits ?? []) sources.push({ trait, sourceId: `${set.id}:${threshold}`, sourceLabel: `${set.name} ${threshold}-piece` });
  }
  const build = save.gunsmith.builds.find((row) => row.id === save.gunsmith.selectedBuildId);
  if (build && isValidFamily(build.baseWeaponFamily)) {
    const ownedParts = new Map<string, OwnedPart>(Object.entries(save.gunsmith.parts).map(([instanceId, part]) => [instanceId, {
      instanceId, ...part, infusedTraits: part.infusedTraits as OwnedPart['infusedTraits'],
    }]));
    for (const trait of resolveBuildTraits(build, parts, ownedParts)) sources.push({ trait, sourceId: build.id, sourceLabel: build.name, familyId: build.baseWeaponFamily });
  }
  const truth = resolvePersistentRunLoadout(save,
    new Map((catalog.equipmentSets ?? []).map((set) => [set.id, { id: set.id, setBonuses: set.thresholds }])), definitions, parts);
  return deepFreeze({
    slots: EQUIPMENT_SLOTS.map((slot) => ({ slot, label: slot.charAt(0).toUpperCase() + slot.slice(1),
      equipped: items.find((item) => item.slot === slot && item.state === 'EQUIPPED'), candidates: items.filter((item) => item.slot === slot) })),
    sets,
    runTruth: { modifiers: structuredClone(truth.modifiers), families: getAllFamilyIds().map((familyId) => {
      const familySources = sources.filter((source) => source.familyId === undefined || source.familyId === familyId);
      return { familyId, projectileEffects: structuredClone(truth.projectileEffectsByFamily.get(familyId) ?? []),
        traits: [...new Set(familySources.map((source) => source.trait))].map((trait) => {
          const sourceIds = familySources.filter((source) => source.trait === trait).map((source) => source.sourceId);
          const sourceLabels = familySources.filter((source) => source.trait === trait).map((source) => source.sourceLabel);
          return { trait, sourceIds, sourceLabels, deduplicated: sourceIds.length > 1 };
        }) };
    }) },
  });
}

export type EquipmentPreviewCommand = { readonly kind: 'equip'; readonly instanceId: string }
  | { readonly kind: 'upgrade'; readonly instanceId: string }
  | { readonly kind: 'unequip'; readonly slot: EquipmentSlot };
export interface EquipmentComparison {
  readonly command: EquipmentPreviewCommand;
  readonly displaced?: EquipmentItemPresentation;
  readonly cost?: number;
  readonly candidate: SaveDataV4;
  readonly before: EquipmentLoadoutPresentation;
  readonly after: EquipmentLoadoutPresentation;
  readonly setChanges: readonly { readonly setId: string; readonly before: number; readonly after: number;
    readonly gained: readonly (2 | 4)[]; readonly lost: readonly (2 | 4)[] }[];
}

/** Preview uses the same pure slot operation as commit; no durable writes,
 * catalog mutation or UI row position participates in the candidate. */
export function resolveEquipmentComparison(save: SaveDataV4, catalog: Catalog, command: EquipmentPreviewCommand): EquipmentComparison | undefined {
  const definitions = new Map((catalog.equipment ?? []).map((piece) => [piece.id, piece]));
  const owned = new Map<string, OwnedEquipment>(Object.entries(save.equipment).map(([instanceId, item]) => [instanceId, { instanceId, ...item }]));
  const loadout = { equipped: save.equipmentLoadout ?? {} };
  let candidate: SaveDataV4;
  let slot: EquipmentSlot;
  let cost: number | undefined;
  if (command.kind === 'upgrade') {
    const item = owned.get(command.instanceId);
    const definition = item && definitions.get(item.equipmentId);
    if (!item || !definition) return undefined;
    // This is a conditional mechanical preview. Affordability/unlock state
    // belongs to the command boundary and is shown separately by the UI.
    const result = upgradeEquipment(item, Number.MAX_SAFE_INTEGER, definitions);
    if (!result.ok) return undefined;
    cost = result.cost;
    slot = definition.slot;
    candidate = deepFreeze({ ...structuredClone(save), equipment: { ...save.equipment,
      [command.instanceId]: { equipmentId: result.output.equipmentId, tier: result.output.tier } } });
  } else {
    const result = command.kind === 'equip' ? equipEquipment(loadout, command.instanceId, definitions, owned) : unequipEquipment(loadout, command.slot);
    if (!result.ok) return undefined;
    slot = command.kind === 'unequip' ? command.slot : definitions.get(owned.get(command.instanceId)!.equipmentId)!.slot;
    candidate = deepFreeze({ ...structuredClone(save), equipmentLoadout: { ...result.loadout.equipped } });
  }
  const before = resolveEquipmentLoadoutPresentation(save, catalog);
  const after = resolveEquipmentLoadoutPresentation(candidate, catalog);
  return deepFreeze({ command: { ...command }, candidate, before, after, cost,
    displaced: command.kind === 'upgrade' ? undefined : before.slots.find((row) => row.slot === slot)?.equipped,
    setChanges: before.sets.flatMap((old) => {
      const next = after.sets.find((row) => row.setId === old.setId)!;
      return old.equippedCount === next.equippedCount ? [] : [{ setId: old.setId, before: old.equippedCount, after: next.equippedCount,
        gained: next.thresholds.filter((row) => row.active && !old.thresholds.find((previous) => previous.count === row.count)!.active).map((row) => row.count),
        lost: old.thresholds.filter((row) => row.active && !next.thresholds.find((current) => current.count === row.count)!.active).map((row) => row.count) }];
    }) });
}
