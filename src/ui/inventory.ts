import type { EventBus } from '../engine/eventBus';
import { canMerge, mergeResult, replaceMergedWeapons } from '../gameplay/merge';
import type { RunState } from '../gameplay/runState';
import type { WeaponInstance } from '../gameplay/weapons';
import type { DataWeaponRegistry } from '../systems/weaponRegistry';

export interface InventoryWeaponView {
  readonly instanceId: string;
  readonly definitionId: string;
  readonly name: string;
  readonly family: string;
  readonly tier: number;
  readonly selected: boolean;
  readonly mergeableWith: readonly string[];
}

export interface InventorySnapshot {
  readonly weapons: readonly InventoryWeaponView[];
  readonly selectedInstanceIds: readonly string[];
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
    const weapons = this.runState.equipped.map((instance) =>
      Object.freeze({
        instanceId: instance.instanceId,
        definitionId: instance.defId,
        name: this.weaponRegistry.weaponById(instance.defId)?.name ?? instance.defId,
        family: instance.family,
        tier: instance.tier,
        selected: this.selectedInstanceIds.includes(instance.instanceId),
        mergeableWith: Object.freeze(this.mergeableWith(instance)),
      }),
    );
    return Object.freeze({
      weapons,
      selectedInstanceIds: Object.freeze([...this.selectedInstanceIds]),
    });
  }

  toggle(instanceId: string): InventorySnapshot {
    if (!this.runState.equipped.some((weapon) => weapon.instanceId === instanceId)) {
      return this.snapshot();
    }

    const index = this.selectedInstanceIds.indexOf(instanceId);
    if (index >= 0) {
      this.selectedInstanceIds.splice(index, 1);
    } else if (this.selectedInstanceIds.length < MAX_SELECTION) {
      this.selectedInstanceIds.push(instanceId);
    } else {
      // Capacity reached: drop the earliest selection so the two most
      // recently selected instances stay selected.
      this.selectedInstanceIds.shift();
      this.selectedInstanceIds.push(instanceId);
    }
    return this.snapshot();
  }

  clearSelection(): InventorySnapshot {
    this.selectedInstanceIds = [];
    return this.snapshot();
  }

  mergeSelected(): MergeCommandResult {
    const run = this.runState;
    const failure = (reason: MergeFailureReason): MergeCommandResult => ({
      ok: false,
      reason,
      snapshot: this.snapshot(),
    });

    // 1. Manual-pause gate: merges are only valid from the manual pause
    //    surface; a level-up pause is never touched.
    if (run.status !== 'paused' || run.pauseReason !== 'manual') {
      return failure('run-not-manual-paused');
    }

    // 2. Re-read the two selected instances by exact instanceId from the
    //    current equipped array; never retain WeaponInstance references
    //    across renders.
    const selected = new Set(this.selectedInstanceIds);
    const candidates = run.equipped.filter((weapon) => selected.has(weapon.instanceId));
    if (candidates.length < 2) {
      return failure('weapon-not-found');
    }
    const a = candidates[0];
    const b = candidates[1];
    if (a.instanceId === b.instanceId) {
      return failure('same-instance');
    }

    // 3. Delegate eligibility and result creation to the Epic 2 rules using
    //    the run-scoped registry shared with WeaponSystem.
    if (!canMerge(a, b, this.weaponRegistry)) {
      return failure('not-mergeable');
    }
    const result = mergeResult(a, b, this.weaponRegistry);
    if (!result) {
      return failure('not-mergeable');
    }

    // 4. Replace and verify the two exact current instances were consumed by
    //    the fresh result. Any mismatch returns stale-inventory without
    //    assignment or event.
    const replaced = replaceMergedWeapons(run.equipped, a, b, result);
    if (!replacementsMatch(replaced, run.equipped, a, b, result)) {
      return failure('stale-inventory');
    }

    // 5. Assign once, clear selection, then emit weapon:merged.
    run.equipped = replaced;
    this.selectedInstanceIds = [];
    this.bus.emit('weapon:merged', { fromId: a.defId, toId: result.defId });

    return { ok: true, snapshot: this.snapshot(), resultInstanceId: result.instanceId };
  }

  private mergeableWith(instance: WeaponInstance): string[] {
    return this.runState.equipped
      .filter((other) => other.instanceId !== instance.instanceId && canMerge(instance, other, this.weaponRegistry))
      .map((other) => other.instanceId);
  }
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
    replaced.some((weapon) => weapon.instanceId === a.instanceId || weapon.instanceId === b.instanceId)
  ) {
    return false;
  }
  return replaced.some((weapon) => weapon.instanceId === result.instanceId);
}
