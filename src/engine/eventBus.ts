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
  // Epic 17 (D7): cosmetic-only presentation cues, fired directly by Enemy at
  // the moments FeedbackSystem needs — a charger's winding→attacking edge
  // (once, not every frame) and a tank's pursuit-step cadence. Both are
  // presentation-only; nothing subscribes for gameplay logic.
  'enemy:dashed': { x: number; y: number; dirX: number; dirY: number };
  'enemy:heavyStep': { x: number; y: number };
  // family/tier (Epic 17) are cosmetic-only duplicates of data WeaponSystem
  // already holds at the emit site — listeners key presentation/audio off
  // them without a weaponRegistry lookup, same as enemy:killed carrying
  // enemyId rather than making listeners resolve the archetype.
  'weapon:fired': { weaponId: string; family: string; tier: number; x: number; y: number };
  'projectile:hit': { weaponId: string; family: string; tier: number; x: number; y: number; damage: number; killed: boolean };
  'xp:gained': { amount: number; total: number };
  'level:up': { level: number };
  'card:offered': { offerId: number; choices: readonly string[] };
  'card:chosen': { upgradeId: string };
  // toTier (Epic 17): the merge result's tier, already known by the caller
  // (WeaponInstance.tier) — scales the tier-up presentation's intensity so a
  // T3 merge reads as more significant than a T1->T2 one.
  'weapon:merged': { fromId: string; toId: string; toTier: number };
  'drop:collected': { kind: 'xp' | 'scrap'; amount: number; x: number; y: number };
  // Epic 14: rack acquisition signals. `weapon:acquired` fires after the rack
  // assignment and before the collected drop returns to the pool; weapons
  // never emit `drop:collected`.
  'weapon:acquired': {
    definitionId: string;
    instanceId: string;
    rackCount: number;
    rackCapacity: number;
    x: number;
    y: number;
  };
  'weapon:pickup-blocked': {
    definitionId: string;
    reason: 'rack-full';
    rackCount: number;
    rackCapacity: number;
    x: number;
    y: number;
  };
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
  'enemy:spawned', 'enemy:damaged', 'enemy:killed', 'enemy:dashed', 'enemy:heavyStep',
  'weapon:fired', 'projectile:hit',
  'xp:gained', 'level:up', 'card:offered', 'card:chosen', 'weapon:merged',
  'drop:collected',
  'weapon:acquired', 'weapon:pickup-blocked',
  'currency:changed', 'hazard:triggered',
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
