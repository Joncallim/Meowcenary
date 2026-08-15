import type { EventBus } from '../engine/eventBus';
import { canMerge, hasMergeablePair, mergeResult, replaceMergedWeapons } from '../gameplay/merge';
import type { RunState } from '../gameplay/runState';
import { WEAPON_RACK_CAPACITY } from '../gameplay/weaponRack';
import type { WeaponInstance } from '../gameplay/weapons';
import type { Rarity, WeaponDefinition } from '../systems/types';
import type { DataWeaponRegistry } from '../systems/weaponRegistry';

export type InventorySelectionState =
  | 'neutral'
  | 'merge-ready'
  | 'selected'
  | 'compatible'
  | 'incompatible';

export type InventoryStatKey = 'damage' | 'rate' | 'projectiles' | 'pierce';

export interface InventoryStatView {
  readonly key: InventoryStatKey;
  readonly label: string;
  readonly value: number;
  readonly formatted: string;
}

export interface InventoryWeaponSummary {
  readonly definitionId: string;
  readonly name: string;
  readonly family: string;
  readonly iconId: string;
  readonly rarity: Rarity;
  readonly tier: number;
  readonly stats: readonly InventoryStatView[];
}

export interface InventoryWeaponView extends InventoryWeaponSummary {
  readonly instanceId: string;
  readonly selected: boolean;
  readonly selectionOrder?: 1 | 2;
  readonly selectionState: InventorySelectionState;
  readonly mergeableWith: readonly string[];
}

export interface InventoryMergeDelta {
  readonly key: InventoryStatKey;
  readonly label: string;
  readonly before: number;
  readonly after: number;
  readonly formattedBefore: string;
  readonly formattedAfter: string;
}

export interface InventoryMergePreview {
  readonly inputs: readonly [InventoryWeaponSummary, InventoryWeaponSummary];
  readonly result: InventoryWeaponSummary;
  readonly deltas: readonly InventoryMergeDelta[];
}

export interface InventorySnapshot {
  readonly capacity: number;
  readonly weapons: readonly InventoryWeaponView[];
  readonly slots: readonly (InventoryWeaponView | null)[];
  readonly selectedInstanceIds: readonly string[];
  readonly mergeReady: boolean;
  readonly preview?: InventoryMergePreview;
}

export type MergeFailureReason =
  | 'run-not-manual-paused'
  | 'weapon-not-found'
  | 'same-instance'
  | 'not-mergeable'
  | 'stale-inventory';

export type MergeCommandResult =
  | { readonly ok: true; readonly snapshot: InventorySnapshot; readonly resultInstanceId: string }
  | { readonly ok: false; readonly reason: MergeFailureReason; readonly snapshot: InventorySnapshot };

const MAX_SELECTION = 2;

export interface InventoryControllerOptions {
  readonly runState: RunState;
  readonly bus: EventBus;
  readonly weaponRegistry: DataWeaponRegistry;
}

/**
 * Headless rack/merge command surface. It exposes immutable view models only;
 * all eligibility is delegated to the authoritative Epic 2 merge rules.
 */
export class InventoryController {
  private readonly runState: RunState;
  private readonly bus: EventBus;
  private readonly weaponRegistry: DataWeaponRegistry;
  private selectedInstanceIds: string[] = [];

  constructor(options: InventoryControllerOptions) {
    this.runState = options.runState;
    this.bus = options.bus;
    this.weaponRegistry = options.weaponRegistry;
  }

  snapshot(): InventorySnapshot {
    this.reconcileSelection();
    const selected = new Set(this.selectedInstanceIds);
    const firstSelected = this.selectedInstanceIds.length === 1
      ? this.runState.equipped.find((weapon) => weapon.instanceId === this.selectedInstanceIds[0])
      : undefined;

    const weapons = this.runState.equipped.map((instance) => {
      const definition = this.weaponRegistry.weaponById(instance.defId);
      const mergeableWith = this.mergeableWith(instance);
      const selectedIndex = this.selectedInstanceIds.indexOf(instance.instanceId);
      const selectedWeapon = selected.has(instance.instanceId);
      let selectionState: InventorySelectionState = 'neutral';

      if (selectedWeapon) {
        selectionState = 'selected';
      } else if (firstSelected) {
        selectionState = canMerge(firstSelected, instance, this.weaponRegistry)
          ? 'compatible'
          : 'incompatible';
      } else if (this.selectedInstanceIds.length === MAX_SELECTION) {
        selectionState = 'incompatible';
      } else if (mergeableWith.length > 0) {
        selectionState = 'merge-ready';
      }

      return Object.freeze({
        ...weaponSummary(instance, definition),
        instanceId: instance.instanceId,
        selected: selectedWeapon,
        ...(selectedIndex >= 0 ? { selectionOrder: (selectedIndex + 1) as 1 | 2 } : {}),
        selectionState,
        mergeableWith: Object.freeze(mergeableWith),
      });
    });

    const selectedWeapons = this.selectedInstanceIds
      .map((instanceId) => this.runState.equipped.find((weapon) => weapon.instanceId === instanceId))
      .filter((weapon): weapon is WeaponInstance => weapon !== undefined);
    const preview = this.buildPreview(selectedWeapons);
    const slots = Array.from(
      { length: WEAPON_RACK_CAPACITY },
      (_, index) => weapons[index] ?? null,
    );

    return Object.freeze({
      capacity: WEAPON_RACK_CAPACITY,
      weapons: Object.freeze(weapons),
      slots: Object.freeze(slots),
      selectedInstanceIds: Object.freeze([...this.selectedInstanceIds]),
      mergeReady: hasMergeablePair(this.runState.equipped, this.weaponRegistry),
      ...(preview ? { preview } : {}),
    });
  }

  /**
   * Tap-first selection. An incompatible second tap becomes the new first
   * selection, so the UI never enters a misleading two-card commit state.
   */
  toggle(instanceId: string): InventorySnapshot {
    this.reconcileSelection();
    const target = this.runState.equipped.find((weapon) => weapon.instanceId === instanceId);
    if (!target) {
      return this.snapshot();
    }

    const index = this.selectedInstanceIds.indexOf(instanceId);
    if (index >= 0) {
      this.selectedInstanceIds.splice(index, 1);
      return this.snapshot();
    }

    const firstId = this.selectedInstanceIds[0];
    const first = firstId
      ? this.runState.equipped.find((weapon) => weapon.instanceId === firstId)
      : undefined;
    if (!first) {
      this.selectedInstanceIds = [instanceId];
    } else if (
      this.selectedInstanceIds.length === 1 &&
      canMerge(first, target, this.weaponRegistry)
    ) {
      this.selectedInstanceIds.push(instanceId);
    } else {
      this.selectedInstanceIds = [instanceId];
    }
    return this.snapshot();
  }

  clearSelection(): InventorySnapshot {
    this.selectedInstanceIds = [];
    return this.snapshot();
  }

  mergeSelected(): MergeCommandResult {
    this.reconcileSelection();
    const run = this.runState;
    const failure = (reason: MergeFailureReason): MergeCommandResult => ({
      ok: false,
      reason,
      snapshot: this.snapshot(),
    });

    if (run.status !== 'paused' || run.pauseReason !== 'manual') {
      return failure('run-not-manual-paused');
    }

    const selected = new Set(this.selectedInstanceIds);
    const candidates = run.equipped.filter((weapon) => selected.has(weapon.instanceId));
    if (candidates.length < 2) {
      return failure('weapon-not-found');
    }
    const a = candidates[0]!;
    const b = candidates[1]!;
    if (a.instanceId === b.instanceId) {
      return failure('same-instance');
    }

    if (!canMerge(a, b, this.weaponRegistry)) {
      return failure('not-mergeable');
    }
    const result = mergeResult(a, b, this.weaponRegistry);
    if (!result) {
      return failure('not-mergeable');
    }

    const replaced = replaceMergedWeapons(run.equipped, a, b, result);
    if (!replacementsMatch(replaced, run.equipped, a, b, result)) {
      return failure('stale-inventory');
    }

    run.equipped = replaced;
    this.selectedInstanceIds = [];
    this.bus.emit('weapon:merged', { fromId: a.defId, toId: result.defId });

    return { ok: true, snapshot: this.snapshot(), resultInstanceId: result.instanceId };
  }

  private buildPreview(selected: readonly WeaponInstance[]): InventoryMergePreview | undefined {
    if (selected.length !== MAX_SELECTION) {
      return undefined;
    }
    const [a, b] = selected;
    if (!a || !b || !canMerge(a, b, this.weaponRegistry)) {
      return undefined;
    }
    const aDefinition = this.weaponRegistry.weaponById(a.defId);
    const bDefinition = this.weaponRegistry.weaponById(b.defId);
    const resultDefinition = this.weaponRegistry.weaponByFamilyTier(a.family, a.tier + 1);
    if (!aDefinition || !bDefinition || !resultDefinition) {
      return undefined;
    }

    const beforeStats = statViews(aDefinition);
    const afterStats = statViews(resultDefinition);
    const deltas = beforeStats
      .map((before) => {
        const after = afterStats.find((candidate) => candidate.key === before.key)!;
        return Object.freeze({
          key: before.key,
          label: before.label,
          before: before.value,
          after: after.value,
          formattedBefore: before.formatted,
          formattedAfter: after.formatted,
        });
      })
      .filter((delta) => delta.before !== delta.after);

    return Object.freeze({
      inputs: Object.freeze([
        weaponSummary(a, aDefinition),
        weaponSummary(b, bDefinition),
      ]) as readonly [InventoryWeaponSummary, InventoryWeaponSummary],
      result: weaponSummary(
        {
          defId: resultDefinition.id,
          family: resultDefinition.family,
          tier: resultDefinition.mergeTier,
        },
        resultDefinition,
      ),
      deltas: Object.freeze(deltas),
    });
  }

  private mergeableWith(instance: WeaponInstance): string[] {
    return this.runState.equipped
      .filter(
        (other) =>
          other.instanceId !== instance.instanceId &&
          canMerge(instance, other, this.weaponRegistry),
      )
      .map((other) => other.instanceId);
  }

  private reconcileSelection(): void {
    const currentIds = new Set(this.runState.equipped.map((weapon) => weapon.instanceId));
    this.selectedInstanceIds = this.selectedInstanceIds
      .filter((instanceId, index, list) => currentIds.has(instanceId) && list.indexOf(instanceId) === index)
      .slice(0, MAX_SELECTION);
  }
}

function weaponSummary(
  instance: Pick<WeaponInstance, 'defId' | 'family' | 'tier'>,
  definition: WeaponDefinition | undefined,
): InventoryWeaponSummary {
  return Object.freeze({
    definitionId: instance.defId,
    name: definition?.name ?? instance.defId,
    family: instance.family,
    iconId: definition?.art.iconId ?? `weapon:${instance.family}`,
    rarity: definition?.rarity ?? 'common',
    tier: instance.tier,
    stats: Object.freeze(definition ? statViews(definition) : []),
  });
}

function statViews(definition: WeaponDefinition): InventoryStatView[] {
  const rate = 1000 / definition.fireRateMs;
  return [
    Object.freeze({ key: 'damage', label: 'DMG', value: definition.damage, formatted: formatStat(definition.damage) }),
    Object.freeze({ key: 'rate', label: 'RATE', value: rate, formatted: `${rate.toFixed(2)}/s` }),
    Object.freeze({ key: 'projectiles', label: 'SHOTS', value: definition.projectileCount, formatted: `×${definition.projectileCount}` }),
    Object.freeze({ key: 'pierce', label: 'PIERCE', value: definition.pierce, formatted: formatStat(definition.pierce) }),
  ];
}

function formatStat(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function replacementsMatch(
  replaced: readonly WeaponInstance[],
  original: readonly WeaponInstance[],
  a: WeaponInstance,
  b: WeaponInstance,
  result: WeaponInstance,
): boolean {
  if (replaced.length !== original.length - 1) {
    return false;
  }
  if (
    replaced.some(
      (weapon) => weapon.instanceId === a.instanceId || weapon.instanceId === b.instanceId,
    )
  ) {
    return false;
  }
  return replaced.some((weapon) => weapon.instanceId === result.instanceId);
}
