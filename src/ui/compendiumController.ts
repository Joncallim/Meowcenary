import type { GameContext } from '../engine/context';

export interface CompendiumSnapshotEntry {
  readonly enemyId: string;
  readonly name: string;
  readonly status: 'unseen' | 'encountered' | 'defeated';
  readonly foundIn: readonly string[];
}

export interface CompendiumSnapshot {
  readonly entries: readonly CompendiumSnapshotEntry[];
}

/** Production read model for Career → Compendium. Discovery remains owned by
 * GameContext/save; this controller exposes no mutation path. */
export class CompendiumController {
  constructor(private readonly context: GameContext) {}

  snapshot(): CompendiumSnapshot {
    const stagesByEnemy = new Map<string, string[]>();
    for (const stage of this.context.data.stages ?? []) {
      const encounter = (this.context.data.encounterProfiles ?? []).find((row) => row.id === stage.encounterProfileId);
      for (const enemyId of encounter?.enemyIds ?? []) {
        const rows = stagesByEnemy.get(enemyId) ?? [];
        rows.push(stage.name);
        stagesByEnemy.set(enemyId, rows);
      }
      if (encounter?.bossId) {
        const rows = stagesByEnemy.get(encounter.bossId) ?? [];
        rows.push(stage.name);
        stagesByEnemy.set(encounter.bossId, rows);
      }
    }
    return Object.freeze({ entries: Object.freeze(this.context.data.enemies.map((enemy) => Object.freeze({
      enemyId: enemy.id,
      name: enemy.name,
      status: this.context.saveData.compendium[enemy.id] ?? 'unseen',
      foundIn: Object.freeze(stagesByEnemy.get(enemy.id) ?? []),
    })).sort((a, b) => a.name.localeCompare(b.name))) });
  }
}
