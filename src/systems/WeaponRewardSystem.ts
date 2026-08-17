import type { Rng } from '../engine/rng';
import type { System } from '../engine/system';
import { PLAYER_BODY_RADIUS } from '../entities/Player';
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
  /** Base pickup radius used to resolve the run's collection radius at
   *  construction (mirrors `DropSystem.basePickupRadius`). */
  readonly basePickupRadius: number;
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
  /** Epic 18 (D10): base pickup radius fed to the live separation
   *  calculation at each placement — no longer snapshotted at construction,
   *  since a run-time `pickupRadius` card (`scrap-magnet`) can raise the
   *  live collection radius above a separation fixed at run start. */
  private readonly basePickupRadius: number;
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
  /** Epic 18 (D11): narrow read-only diagnostic, incremented only after
   *  `spawnDrop` is called successfully. Never inferred from
   *  `weapon:acquired` — this counts *issuance*, not collection. */
  private issued = 0;

  get issuedCount(): number {
    return this.issued;
  }

  constructor(options: WeaponRewardSystemOptions) {
    assertWeaponRewardTiming(options.config);
    this.runState = options.runState;
    this.rng = options.rng;
    this.lootTables = options.lootTables;
    this.config = options.config;
    this.dropRadius = options.dropRadius;
    this.basePickupRadius = options.basePickupRadius;
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
    this.issued += 1;
    this.rewardIndex += 1;
  }

  /** Deterministic placement keyed by rewardIndex (Epic 14 §D12). Placement
   *  consumes no reward RNG, so presentation changes can never perturb the
   *  reward-definition sequence.
   *
   *  A candidate is accepted only if, after clamping, it lies outside an
   *  obstacle expanded by the drop radius AND outside the player's collection
   *  radius (resolved pickup radius or physical contact radius). A near-edge
   *  clamp can otherwise pull a spawnOffset candidate back inside the pickup
   *  radius, where the guaranteed reward is collected automatically on the
   *  next physics step instead of remaining visible for a physical pickup. */
  private placementFor(rewardIndex: number): { readonly x: number; readonly y: number } {
    const player = this.playerPosition();
    const offset = this.config.spawnOffset;
    const cycle: ReadonlyArray<readonly [dx: number, dy: number]> = [
      [offset, 0],
      [0, offset],
      [-offset, 0],
      [0, -offset],
    ];
    const diagonals: ReadonlyArray<readonly [dx: number, dy: number]> = [
      [offset, offset],
      [offset, -offset],
      [-offset, -offset],
      [-offset, offset],
    ];

    for (let step = 0; step < cycle.length; step += 1) {
      const [dx, dy] = cycle[(rewardIndex + step) % cycle.length];
      const candidate = this.clampToArenaBounds(player.x + dx, player.y + dy);
      if (this.isValidPlacement(candidate, player)) {
        return candidate;
      }
    }

    // Fallback: the same checks on the four diagonal positions, preserving
    // separation when every cycle position is blocked (Epic 14 §D12 review
    // fix). Deterministic and still free of reward RNG.
    for (const [dx, dy] of diagonals) {
      const candidate = this.clampToArenaBounds(player.x + dx, player.y + dy);
      if (this.isValidPlacement(candidate, player)) {
        return candidate;
      }
    }

    // Degenerate arena: no offset candidate preserves separation. Never drop
    // the reward on the player — pick the clamped candidate furthest away.
    let best: { readonly x: number; readonly y: number } = { x: player.x, y: player.y };
    let bestDistanceSq = -1;
    for (const [dx, dy] of [...cycle, ...diagonals]) {
      const candidate = this.clampToArenaBounds(player.x + dx, player.y + dy);
      const distanceSq = (candidate.x - player.x) ** 2 + (candidate.y - player.y) ** 2;
      if (distanceSq > bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = candidate;
      }
    }
    console.warn(
      '[WeaponRewardSystem] No valid weapon reward placement; falling back to the furthest candidate from the player',
    );
    return best;
  }

  private isValidPlacement(
    candidate: { readonly x: number; readonly y: number },
    player: { readonly x: number; readonly y: number },
  ): boolean {
    if (this.insideObstacleExpanded(candidate)) {
      return false;
    }
    const distanceSq = (candidate.x - player.x) ** 2 + (candidate.y - player.y) ** 2;
    const minSeparation = this.minPlayerSeparation();
    const minSeparationSq = minSeparation * minSeparation;
    // Strictly outside the collection radius: a drop at exactly pickup radius
    // would already be magnetized on the next update.
    return distanceSq > minSeparationSq;
  }

  /** Epic 18 (D10): resolved fresh at each placement rather than snapshotted
   *  at construction, so a run-time `pickupRadius` card (`scrap-magnet`)
   *  cannot leave a scheduled reward inside the live collection radius.
   *  Placement-only — consumes no RNG, so the reward-definition/deadline
   *  sequence on the `weapon-rewards` stream is unaffected. */
  private minPlayerSeparation(): number {
    return Math.max(
      this.runState.stats.resolve('pickupRadius', this.basePickupRadius),
      PLAYER_BODY_RADIUS + this.dropRadius,
    );
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
