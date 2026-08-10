import type { Settings } from '../systems/save';

export interface GameEventMap {
  'run:start': { characterId: string; arenaId: string; seed: number };
  'run:paused': Record<string, never>;
  'run:resumed': Record<string, never>;
  'run:won': { timeMs: number; level: number; kills: number };
  'run:lost': { timeMs: number; level: number; kills: number };
  'player:damaged': { amount: number; healthRemaining: number };
  'player:died': Record<string, never>;
  'enemy:spawned': { instanceId: number; enemyId: string; x: number; y: number };
  // amount is the health actually removed — capped at the enemy's remaining
  // health (never exceeds the enemy's pre-hit health), so overkill from
  // high-damage hits is not double-counted by dev-tooling meters (Epic 11 §7).
  'enemy:damaged': { instanceId: number; amount: number; x: number; y: number };
  'enemy:killed': { instanceId: number; enemyId: string; xpValue: number; scrapValue: number; lootTableId?: string; x: number; y: number };
  'weapon:fired': { weaponId: string; x: number; y: number };
  'projectile:hit': { x: number; y: number; damage: number; killed: boolean };
  'xp:gained': { amount: number; total: number };
  'level:up': { level: number };
  'card:offered': { offerId: number; choices: readonly string[] };
  'card:chosen': { upgradeId: string };
  'weapon:merged': { fromId: string; toId: string };
  'drop:collected': { kind: 'xp' | 'scrap'; amount: number; x: number; y: number };
  'currency:changed': { runTotal: number };
  'hazard:triggered': { hazardId: string; damage: number; x: number; y: number };
  // Epic 10: emitted only by GameContext.updateSettings (identity change).
  'settings:changed': { settings: Settings };
  // Epic 10: UI interaction sounds, emitted only from the view/scene dispatch
  // points listed in docs/architecture/epic-10-audio.md §10.
  'ui:navigate': Record<string, never>;
  'ui:confirm': Record<string, never>;
  'ui:back': Record<string, never>;
}

export type GameEventKey = keyof GameEventMap;
export type GameEventListener<K extends GameEventKey> = (payload: GameEventMap[K]) => void;

/** Runtime key list for validation. `satisfies` rejects entries that are not
 *  real keys; `_assertExhaustive` fails to compile when a GameEventMap key is
 *  missing from the list. Both directions are compile-time checked. */
export const GAME_EVENT_KEYS = [
  'run:start', 'run:paused', 'run:resumed', 'run:won', 'run:lost',
  'player:damaged', 'player:died',
  'enemy:spawned', 'enemy:damaged', 'enemy:killed',
  'weapon:fired', 'projectile:hit',
  'xp:gained', 'level:up', 'card:offered', 'card:chosen', 'weapon:merged',
  'drop:collected', 'currency:changed', 'hazard:triggered',
  'settings:changed', 'ui:navigate', 'ui:confirm', 'ui:back',
] as const satisfies readonly GameEventKey[];

type _MissingKeys = Exclude<GameEventKey, (typeof GAME_EVENT_KEYS)[number]>;
export const _assertExhaustive: _MissingKeys extends never ? true : never = true;

export interface EventBus {
  on<K extends GameEventKey>(key: K, fn: GameEventListener<K>): () => void;
  off<K extends GameEventKey>(key: K, fn: GameEventListener<K>): void;
  emit<K extends GameEventKey>(key: K, payload: GameEventMap[K]): void;
}

export function createEventBus(): EventBus {
  const listeners = new Map<GameEventKey, Set<(payload: GameEventMap[GameEventKey]) => void>>();

  function off<K extends GameEventKey>(key: K, fn: GameEventListener<K>): void {
    const set = listeners.get(key);
    set?.delete(fn as (payload: GameEventMap[GameEventKey]) => void);
    if (set?.size === 0) {
      listeners.delete(key);
    }
  }

  function on<K extends GameEventKey>(key: K, fn: GameEventListener<K>): () => void {
    const set = listeners.get(key) ?? new Set<(payload: GameEventMap[GameEventKey]) => void>();
    set.add(fn as (payload: GameEventMap[GameEventKey]) => void);
    listeners.set(key, set);

    return () => {
      off(key, fn);
    };
  }

  function emit<K extends GameEventKey>(key: K, payload: GameEventMap[K]): void {
    const set = listeners.get(key);
    if (!set) {
      return;
    }

    for (const listener of [...set]) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`EventBus listener failed for "${String(key)}"`, error);
      }
    }
  }

  return { on, off, emit };
}
