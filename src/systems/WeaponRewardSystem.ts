import type { Rng } from '../engine/rng';
import type { System } from '../engine/system';
import type { LootGrant } from '../gameplay/loot';
import type { RunState } from '../gameplay/runState';
import {
  assertWeaponRewardTiming,
  firstWeaponRewardDeadlineMs,
  firstWeaponRewardGrant,
  nextWeaponRewardDeadlineMs,
  resolveLaterWeaponReward,
  type WeaponRewardTimingConfig,
} from '../gameplay/weaponRewards';
import type { LootTableLookup } from './lootTables';

export interface WeaponRewardSystemOptions {
  readonly runState: RunState;
  /** The dedicated `weapon-rewards` run stream (Epic 14 §D10) — never the
   *  spawn/upgrade/loot streams. */
  readonly rng: Rng;
  readonly lootTables: LootTableLookup;
  readonly config: WeaponRewardTimingConfig;
  readonly dropRadius: number;
  /** Narrow world-spawn request. The system never owns Phaser drops or the
   *  physics group (Epic 14 §D12/§7). */
  readonly spawnDrop: (x: number, y: number, grant: LootGrant) => void;
  readonly playerPosition: () => { readonly x: number; readonly y: number };
  readonly arenaBounds: { readonly width: number; readonly height: number };
  readonly obstacles: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }>;
}

/**
 * Deterministic scheduled weapon rewards (Epic 14 §D11/D12). Reward 0 is a
 * guaranteed duplicate of the starting weapon; later rewards resolve from the
 * dedicated T1 `weapon-world` table. Rewards are always physical world drops
 * requested through the injected callback — the rack is never mutated here.
 */
export class WeaponRewardSystem implements System {
  private readonly runState: RunState;
  private readonly rng: Rng;
  private readonly lootTables: LootTableLookup;
  private readonly config: WeaponRewardTimingConfig;
  private readonly dropRadius: number;
  private readonly spawnDrop: (x: number, y: number, grant: LootGrant) => void;
  private readonly playerPosition: () => { readonly x: number; readonly y: number };
  private readonly arenaBounds: { readonly width: number; readonly height: number };
  private readonly obstacles: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }>;
  /** Snapshot of the one starting weapon at construction (Epic 14 §D11). */
  private readonly startingDefinitionId: string | undefined;
  private rewardIndex = 0;
  private nextRewardAtMs: number;

  constructor(options: WeaponRewardSystemOptions) {
    assertWeaponRewardTiming(options.config);
    this.runState = options.runState;
    this.rng = options.rng;
    this.lootTables = options.lootTables;
    this.config = options.config;
    this.dropRadius = options.dropRadius;
    this.spawnDrop = options.spawnDrop;
    this.playerPosition = options.playerPosition;
    this.arenaBounds = options.arenaBounds;
    this.obstacles = options.obstacles;
    this.startingDefinitionId = options.runState.equipped[0]?.defId;
    this.nextRewardAtMs = firstWeaponRewardDeadlineMs(this.rng, this.config);
  }

  update(_dtMs: number): void {
    if (this.runState.status !== 'active') {
      // Active run time does not advance while paused, so pauses never consume
      // reward schedule time (Epic 14 §D11).
      return;
    }

    // While-loop: a coarse test/game delta must not change how many rewards
    // are due (Epic 14 §D11). Malformed table results fail soft once per due
    // reward and advance the schedule rather than retrying every frame.
    while (this.runState.timeMs >= this.nextRewardAtMs) {
      this.issueReward();
      this.nextRewardAtMs = nextWeaponRewardDeadlineMs(this.nextRewardAtMs, this.rng, this.config);
    }
  }

  destroy(): void {
    // Stateless beyond construction: nothing to release.
  }

  private issueReward(): void {
    let grant: LootGrant;
    if (this.rewardIndex === 0 && this.startingDefinitionId !== undefined) {
      grant = firstWeaponRewardGrant(this.startingDefinitionId);
    } else {
      try {
        grant = resolveLaterWeaponReward(this.lootTables, this.rng);
      } catch (error) {
        console.warn('[WeaponRewardSystem] Failed to resolve a scheduled weapon reward:', error);
        this.rewardIndex += 1;
        return;
      }
    }

    const position = this.placementFor(this.rewardIndex);
    this.spawnDrop(position.x, position.y, grant);
    this.rewardIndex += 1;
  }

  /** Deterministic four-position cycle keyed by rewardIndex (Epic 14 §D12).
   *  Placement consumes no reward RNG, so presentation changes can never
   *  perturb the reward-definition sequence. */
  private placementFor(rewardIndex: number): { readonly x: number; readonly y: number } {
    const player = this.playerPosition();
    const cycle: ReadonlyArray<readonly [dx: number, dy: number]> = [
      [this.config.spawnOffset, 0],
      [0, this.config.spawnOffset],
      [-this.config.spawnOffset, 0],
      [0, -this.config.spawnOffset],
    ];

    for (let step = 0; step < cycle.length; step += 1) {
      const [dx, dy] = cycle[(rewardIndex + step) % cycle.length];
      const candidate = this.clampToArenaBounds(player.x + dx, player.y + dy);
      if (!this.insideObstacleExpanded(candidate)) {
        return candidate;
      }
    }

    const fallback = this.clampToArenaBounds(player.x, player.y);
    console.warn(
      '[WeaponRewardSystem] No valid weapon reward placement; falling back to the player position',
    );
    return fallback;
  }

  private clampToArenaBounds(x: number, y: number): { readonly x: number; readonly y: number } {
    const margin = this.dropRadius;
    return {
      x: Math.min(Math.max(x, margin), this.arenaBounds.width - margin),
      y: Math.min(Math.max(y, margin), this.arenaBounds.height - margin),
    };
  }

  private insideObstacleExpanded(point: { readonly x: number; readonly y: number }): boolean {
    const margin = this.dropRadius;
    return this.obstacles.some(
      (obstacle) =>
        point.x >= obstacle.x - margin &&
        point.x <= obstacle.x + obstacle.w + margin &&
        point.y >= obstacle.y - margin &&
        point.y <= obstacle.y + obstacle.h + margin,
    );
  }
}
