import type { BossActionDefinition, EnemySummonDefinition } from '../systems/types';
import type { Vec2 } from '../engine/vector';

export const BOSS_ACTION_IDS = ['boss-action:aimed-shot', 'boss-action:summon'] as const;

export type BossActionEvent =
  | { readonly type: 'ranged-shot'; readonly enemyId: string; readonly x: number; readonly y: number; readonly dirX: number; readonly dirY: number; readonly damage: number }
  | ({ readonly type: 'summon'; readonly sourceEnemyId: string; readonly x: number; readonly y: number } & EnemySummonDefinition);

export function isRegisteredBossActionId(id: string): id is BossActionDefinition['id'] {
  return (BOSS_ACTION_IDS as readonly string[]).includes(id);
}

export function executeBossActions(
  actions: readonly BossActionDefinition[],
  context: { readonly enemyId: string; readonly damage: number; readonly pos: Vec2; readonly target: Vec2 },
): readonly BossActionEvent[] {
  const events: BossActionEvent[] = [];
  for (const action of actions) {
    // Keep this runtime switch intentionally wider than the TypeScript union:
    // save/modded data crosses a JSON boundary before it reaches the entity.
    const id = (action as { readonly id: string }).id;
    if (id === 'boss-action:summon') {
      const summon = action as Extract<BossActionDefinition, { readonly id: 'boss-action:summon' }>;
      events.push({ type: 'summon', sourceEnemyId: context.enemyId, x: context.pos.x, y: context.pos.y, enemyId: summon.enemyId, count: summon.count, maxActive: summon.maxActive });
      continue;
    }
    if (id !== 'boss-action:aimed-shot') {
      // Catalog validation normally rejects this before a run starts. Keep
      // the runtime closed too: malformed data must never become a shot.
      throw new Error(`Unknown boss action "${String(id)}"`);
    }
    const dx = context.target.x - context.pos.x;
    const dy = context.target.y - context.pos.y;
    const length = Math.hypot(dx, dy) || 1;
    events.push({ type: 'ranged-shot', enemyId: context.enemyId, x: context.pos.x, y: context.pos.y, dirX: dx / length, dirY: dy / length, damage: context.damage });
  }
  return events;
}
