import type { GameContext } from '../engine/context';
import { canPurchase, purchase, type PurchaseFailureReason } from '../gameplay/meta';
import type { MetaState } from '../systems/save';

export interface MetaUpgradeView {
  readonly id: string; readonly name: string; readonly description: string;
  readonly currentLevel: number; readonly maxLevel: number;
  readonly nextCost: number | null; readonly canPurchase: boolean;
}
export interface ProgressionSnapshot { readonly scrap: number; readonly upgrades: readonly MetaUpgradeView[] }
export type ProgressionPurchaseResult =
  | { readonly ok: true; readonly meta: MetaState; readonly cost: number; readonly newLevel: number; readonly persisted: boolean }
  | { readonly ok: false; readonly meta: MetaState; readonly reason: PurchaseFailureReason };
export type ResetProgressionResult =
  | { readonly ok: true; readonly meta: MetaState; readonly persisted: boolean }
  | { readonly ok: false; readonly meta: MetaState; readonly reason: 'confirmation-required' };

export class ProgressionController {
  constructor(private readonly context: GameContext) {}

  snapshot(): ProgressionSnapshot {
    const meta = this.context.saveData.meta;
    return Object.freeze({
      scrap: meta.scrap,
      upgrades: Object.freeze(this.context.metaUpgrades.all().map((definition) => {
        const check = canPurchase(meta, definition.id, this.context.metaUpgrades);
        return Object.freeze({
          id: definition.id,
          name: definition.name,
          description: definition.description,
          currentLevel: check.currentLevel,
          maxLevel: definition.maxLevel,
          nextCost: check.cost,
          canPurchase: check.ok,
        });
      })),
    });
  }

  purchase(upgradeId: string): ProgressionPurchaseResult {
    const result = purchase(this.context.saveData.meta, upgradeId, this.context.metaUpgrades);
    if (!result.ok) return Object.freeze(result);
    const update = this.context.updateMeta(() => result.meta);
    return Object.freeze({
      ok: true, meta: update.value, cost: result.cost,
      newLevel: result.newLevel, persisted: update.persisted,
    });
  }

  reset(confirmed: boolean): ResetProgressionResult {
    if (!confirmed) {
      return Object.freeze({ ok: false, meta: this.context.saveData.meta, reason: 'confirmation-required' });
    }
    const update = this.context.resetProgression();
    return Object.freeze({ ok: true, meta: update.value, persisted: update.persisted });
  }
}
