import { createRunState, type CreateRunStateOptions, type RunState } from './runState';
import type { Modifier } from './stats';
import type { WeaponInstance } from './weapons';
import { permanentModifiers } from './meta';
import type { MetaState } from '../systems/save';
import type { MetaUpgradeRegistry } from '../systems/metaUpgrades';

export interface PlayerBaseStats { readonly maxHealth: number; readonly moveSpeed: number }
export interface CharacterRunContribution {
  readonly baseStats: Readonly<Partial<PlayerBaseStats>>;
  readonly passiveModifiers: readonly Modifier[];
  readonly startingWeapons: readonly WeaponInstance[];
}
export interface PrepareRunOptions {
  readonly state: CreateRunStateOptions;
  readonly basePlayer: PlayerBaseStats;
  readonly meta: MetaState;
  readonly metaUpgrades: MetaUpgradeRegistry;
  readonly character: CharacterRunContribution;
}
export interface PreparedRun { readonly run: RunState; readonly basePlayer: PlayerBaseStats }

export function applyPermanentProgression(
  run: RunState,
  meta: MetaState,
  upgrades: MetaUpgradeRegistry,
): boolean {
  const modifiers = upgrades.all().flatMap((definition) =>
    permanentModifiers(definition, meta.permanentUpgrades[definition.id] ?? 0));
  const sources = [...new Set(modifiers.map((modifier) => modifier.sourceId))];
  if (sources.some((source) => run.stats.countBySource(source) !== 0)) return false;
  try {
    modifiers.forEach((modifier) => run.stats.add(modifier));
    return true;
  } catch {
    sources.forEach((source) => run.stats.remove(source));
    return false;
  }
}

export function prepareRun(options: PrepareRunOptions): PreparedRun {
  const run = createRunState(options.state);
  const basePlayer = validateBaseStats(options.basePlayer, options.character.baseStats);
  if (!applyPermanentProgression(run, options.meta, options.metaUpgrades)) {
    throw new Error('Unable to apply permanent progression to a fresh run');
  }
  const characterSource = new RegExp(`^character:${escapeRegExp(options.state.characterId)}:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`);
  for (const modifier of options.character.passiveModifiers) {
    if (!characterSource.test(modifier.sourceId)) {
      throw new Error(`Invalid character modifier source "${modifier.sourceId}"`);
    }
    run.stats.add(modifier);
  }
  run.equipped = options.character.startingWeapons.map((weapon) => ({ ...weapon }));
  return Object.freeze({ run, basePlayer });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateBaseStats(base: PlayerBaseStats, patch: Readonly<Partial<PlayerBaseStats>>): PlayerBaseStats {
  const maxHealth = patch.maxHealth ?? base.maxHealth;
  const moveSpeed = patch.moveSpeed ?? base.moveSpeed;
  if (!Number.isFinite(maxHealth) || maxHealth <= 0 || !Number.isFinite(moveSpeed) || moveSpeed <= 0) {
    throw new Error('Player base stats must be positive finite numbers');
  }
  return Object.freeze({ maxHealth, moveSpeed });
}
