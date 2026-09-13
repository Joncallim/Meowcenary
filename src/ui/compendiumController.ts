import type { GameContext } from '../engine/context';

export interface CompendiumSnapshotEntry {
  readonly enemyId: string;
  readonly name: string;
  readonly status: 'unseen' | 'encountered' | 'defeated';
  readonly foundIn: readonly string[];
  readonly fieldNote: string;
  readonly behaviour: string;
  readonly tells: string;
  readonly counterplay: string;
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
    return Object.freeze({ entries: Object.freeze(this.context.data.enemies.map((enemy) => {
      const status = this.context.saveData.compendium[enemy.id] ?? 'unseen';
      const copy = compendiumCopy(enemy.archetype);
      return Object.freeze({
        enemyId: enemy.id,
        name: enemy.name,
        status,
        // An encountered enemy does not reveal the entire future contract
        // graph. One earned location is enough once it has been defeated.
        foundIn: Object.freeze(status === 'defeated' ? (stagesByEnemy.get(enemy.id) ?? []).slice(0, 1) : []),
        ...copy,
      });
    }).sort((a, b) => a.name.localeCompare(b.name))) });
  }
}

function compendiumCopy(archetype: string): Omit<CompendiumSnapshotEntry, 'enemyId' | 'name' | 'status' | 'foundIn'> {
  const byArchetype: Record<string, Omit<CompendiumSnapshotEntry, 'enemyId' | 'name' | 'status' | 'foundIn'>> = {
    chaser: { fieldNote: 'A quick scavenger drawn to close range.', behaviour: 'Closes distance directly.', tells: 'It commits to a straight approach.', counterplay: 'Keep moving and let auto-fire thin the pack.' },
    charger: { fieldNote: 'A rushing threat with a committed line.', behaviour: 'Builds speed toward its target.', tells: 'Watch for its forward rush.', counterplay: 'Step aside before the charge connects.' },
    ranged: { fieldNote: 'A scrap thrower that pressures from afar.', behaviour: 'Keeps range and attacks at distance.', tells: 'It pauses before firing.', counterplay: 'Break its line and close the gap.' },
    tank: { fieldNote: 'A heavy heap that absorbs punishment.', behaviour: 'Advances slowly with high durability.', tells: 'Its large frame is easy to spot.', counterplay: 'Maintain space while your weapons work.' },
    shielded: { fieldNote: 'A guarded scrap creature.', behaviour: 'Uses protection to blunt frontal pressure.', tells: 'Its guard is visible before it commits.', counterplay: 'Reposition and wait for a safe opening.' },
    flanker: { fieldNote: 'A skittish threat that attacks from an angle.', behaviour: 'Cuts across the arena instead of approaching head-on.', tells: 'It changes direction sharply.', counterplay: 'Keep an escape lane open.' },
    boss: { fieldNote: 'A major Junkyard threat.', behaviour: 'Uses a durable, deliberate attack pattern.', tells: 'Big movements signal its next attack.', counterplay: 'Prioritise spacing and read the telegraph.' },
  };
  return byArchetype[archetype] ?? { fieldNote: 'A Junkyard threat.', behaviour: 'Its behaviour is still being observed.', tells: 'Watch its movement closely.', counterplay: 'Stay mobile and keep space.' };
}
