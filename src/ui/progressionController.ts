import type { GameContext } from '../engine/context';

export interface MetaUpgradeView {
  readonly id: string; readonly name: string; readonly description: string;
  readonly currentLevel: number; readonly maxLevel: number;
  readonly nextCost: number | null; readonly canPurchase: boolean;
}
export interface ProgressionSnapshot { readonly scrap: number; readonly upgrades: ReadonlyArray<{ id: string; name: string; description: string; currentLevel: number; maxLevel: number; nextCost: number | null; canPurchase: boolean }> }
export type ProgressionPurchaseResult =
  | { readonly ok: true; readonly meta: { readonly scrap: number; readonly unlocks: readonly string[] }; readonly cost: number; readonly newLevel: number; readonly persisted: boolean }
  | { readonly ok: false; readonly meta: { readonly scrap: number; readonly unlocks: readonly string[] }; readonly reason: string };
export type ResetProgressionResult =
  | { readonly ok: true; readonly meta: { readonly scrap: number; readonly unlocks: readonly string[] }; readonly persisted: boolean }
  | { readonly ok: false; readonly meta: { readonly scrap: number; readonly unlocks: readonly string[] }; readonly reason: string };

export class ProgressionController {
  constructor(private readonly context: GameContext) {}

  snapshot(): ProgressionSnapshot {
    const progression = this.context.saveData.progression;
    return Object.freeze({
      scrap: progression.scrap,
      upgrades: Object.freeze([]),
    });
  }

  purchase(_upgradeId: string): ProgressionPurchaseResult {
    return Object.freeze({ ok: false, meta: this.context.saveData.progression, reason: 'retired-in-v4' });
  }

  reset(confirmed: boolean): ResetProgressionResult {
    if (!confirmed) {
      return Object.freeze({ ok: false, meta: this.context.saveData.progression, reason: 'confirmation-required' });
    }
    const update = this.context.resetProgression();
    if (!update.persisted) {
      return Object.freeze({ ok: false, meta: update.value, reason: 'persistence-failed' });
    }
    return Object.freeze({ ok: true, meta: update.value, persisted: update.persisted });
  }
}
