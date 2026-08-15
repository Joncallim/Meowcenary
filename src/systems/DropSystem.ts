import Phaser from 'phaser';
import type { GameContext } from '../engine/context';
import type { GameEventListener } from '../engine/eventBus';
import { createPool, type Pool } from '../engine/pool';
import type { Rng } from '../engine/rng';
import type { System } from '../engine/system';
import { Drop, type DropArtBindings } from '../entities/Drop';
import type { Player } from '../entities/Player';
import { resolveKillLoot, resolveLootFromTable } from '../gameplay/loot';
import type { LootGrant } from '../gameplay/loot';
import type { RunState } from '../gameplay/runState';
import { applyXp } from '../gameplay/xp';
import { grantWeaponToRack, WEAPON_RACK_CAPACITY } from '../gameplay/weaponRack';
import type { WeaponRegistry } from '../gameplay/weapons';
import type { LootTableLookup } from './lootTables';

export interface DropSystemOptions {
  readonly scene: Phaser.Scene;
  readonly ctx: GameContext;
  readonly runState: RunState;
  readonly player: Player;
  readonly dropGroup: Phaser.Physics.Arcade.Group;
  readonly lootTables: LootTableLookup;
  /** The run-scoped weapon registry shared with starting loadout, inventory,
   *  and WeaponSystem (Epic 14 §D6) — never a second per-run registry. */
  readonly weaponRegistry: Pick<WeaponRegistry, 'weaponById' | 'createWeaponInstance'>;
  readonly rng: Pick<Rng, 'next'>;
  readonly dropRadius: number;
  readonly magnetSpeed: number;
  readonly basePickupRadius: number;
  readonly artByKind?: DropArtBindings;
}

export class DropSystem implements System {
  private readonly scene: Phaser.Scene;
  private readonly ctx: GameContext;
  private readonly runState: RunState;
  private readonly player: Player;
  private readonly dropGroup: Phaser.Physics.Arcade.Group;
  private readonly lootTables: LootTableLookup;
  private readonly weaponRegistry: Pick<WeaponRegistry, 'weaponById' | 'createWeaponInstance'>;
  private readonly rng: Pick<Rng, 'next'>;
  private readonly dropRadius: number;
  private readonly magnetSpeed: number;
  private readonly basePickupRadius: number;
  private readonly dropPool: Pool<Drop>;
  private readonly liveDrops = new Set<Drop>();
  private readonly ownedDrops: Drop[] = [];
  private readonly dropBySprite = new Map<Phaser.GameObjects.GameObject, Drop>();
  private readonly unsubscribeEnemyKilled: () => void;

  constructor(options: DropSystemOptions) {
    this.scene = options.scene;
    this.ctx = options.ctx;
    this.runState = options.runState;
    this.player = options.player;
    this.dropGroup = options.dropGroup;
    this.lootTables = options.lootTables;
    this.weaponRegistry = options.weaponRegistry;
    this.rng = options.rng;
    this.dropRadius = options.dropRadius;
    this.magnetSpeed = options.magnetSpeed;
    this.basePickupRadius = options.basePickupRadius;

    this.dropPool = createPool(
      () => {
        const drop = new Drop(this.scene, this.dropRadius, options.artByKind);
        this.ownedDrops.push(drop);
        this.dropBySprite.set(drop.sprite, drop);

        // PhysicsGroup.add reapplies body defaults. Insert first so spawn owns the
        // final position, body shape, enablement, and velocity, like Projectile.
        this.dropGroup.add(drop.sprite);
        return drop;
      },
      (drop) => drop.reset(),
    );

    this.scene.physics.add.overlap(
      this.player.sprite,
      this.dropGroup,
      this.handlePlayerDropOverlap,
      undefined,
      this,
    );

    this.unsubscribeEnemyKilled = this.ctx.bus.on('enemy:killed', this.handleEnemyKilled);
  }

  get activeDropCount(): number {
    return this.dropPool.active();
  }

  get allocatedDropCount(): number {
    return this.ownedDrops.length;
  }

  /**
   * Spawns a drop at the given position. In production this is called from the
   * `enemy:killed` handler so that loot tables and RNG are respected; tests may
   * call it directly to bypass loot resolution and exercise collection logic.
   */
  spawnDrop(x: number, y: number, grant: LootGrant): Drop {
    const drop = this.dropPool.acquire();
    this.liveDrops.add(drop);
    drop.spawn(x, y, grant);
    return drop;
  }

  update(dtMs: number): void {
    if (this.runState.status !== 'active') {
      return;
    }

    // Epic 14 §D8: a blocked weapon drop becomes collectible again as soon as
    // rack capacity is available (e.g. the player paused and merged). Clearing
    // the flag lets the drop magnetize and be collected normally.
    if (this.runState.equipped.length < WEAPON_RACK_CAPACITY) {
      for (const drop of this.liveDrops) {
        if (drop.pickupBlocked) {
          drop.setPickupBlocked(false);
        }
      }
    }

    const pickupRadius = Math.max(0, this.runState.stats.resolve('pickupRadius', this.basePickupRadius));
    const playerPos = { x: this.player.x, y: this.player.y };
    for (const drop of this.liveDrops) {
      drop.update(dtMs, playerPos, pickupRadius, this.magnetSpeed);
    }
  }

  destroy(): void {
    this.unsubscribeEnemyKilled();
    for (const drop of this.ownedDrops) {
      drop.destroy();
    }
    this.ownedDrops.length = 0;
    this.liveDrops.clear();
    this.dropBySprite.clear();
  }

  private readonly handleEnemyKilled: GameEventListener<'enemy:killed'> = (payload) => {
    if (this.runState.status !== 'active') {
      return;
    }

    const grants = resolveKillLoot(payload, this.lootTables, this.rng);
    for (const grant of grants) {
      this.spawnDrop(payload.x, payload.y, grant);
    }
  };

  /**
   * Physics overlap callback. A drop is collected whenever the player's physics
   * body physically intersects it; `pickupRadius` only governs the magnet range
   * that pulls drops toward the player before contact.
   */
  private handlePlayerDropOverlap(
    _playerObject: unknown,
    dropObject: unknown,
  ): void {
    const dropGameObject = arcadeGameObject(dropObject);
    const drop = dropGameObject ? this.dropBySprite.get(dropGameObject) : undefined;
    if (!drop?.active) {
      return;
    }

    this.collect(drop);
  }

  private collect(drop: Drop): void {
    if (this.runState.status !== 'active' || !drop.active) {
      return;
    }
    if (drop.pickupBlocked) {
      // Full-rack path: the drop stays in the world; repeated overlap
      // callbacks must not re-process or re-emit it.
      return;
    }

    const grant = drop.grant;
    if (!grant) {
      return;
    }
    const { x, y } = drop;
    switch (grant.kind) {
      case 'xp':
        this.applyXpGrant(grant.amount);
        break;
      case 'scrap':
        this.applyScrapGrant(grant.amount);
        break;
      case 'chest':
        this.collectChest(drop);
        return; // the chest itself never emits drop:collected
      case 'weapon':
        this.collectWeapon(drop, grant.definitionId);
        return; // weapons never emit drop:collected (Epic 14 §D8)
    }

    this.ctx.bus.emit('drop:collected', { kind: grant.kind, amount: grant.amount, x, y });
    this.releaseDrop(drop);
  }

  /**
   * Epic 14 §D8 world-pickup weapon admission — the only world-pickup rack
   * mutation path. A valid seventh weapon is never consumed: the physical
   * drop remains in the world and becomes collectible after a merge frees a
   * slot. Invalid definitions fail soft so corrupted data cannot create a
   * permanent poison object.
   */
  private collectWeapon(drop: Drop, definitionId: string): void {
    const result = grantWeaponToRack(this.runState, definitionId, this.weaponRegistry);
    const { x, y } = drop;
    switch (result.status) {
      case 'added':
        // Acquired: emitted after the rack assignment, before the physical
        // drop returns to the pool (Epic 14 §6 invariant 1).
        this.ctx.bus.emit('weapon:acquired', {
          definitionId,
          instanceId: result.weapon.instanceId,
          rackCount: result.rackCount,
          rackCapacity: WEAPON_RACK_CAPACITY,
          x,
          y,
        });
        this.releaseDrop(drop);
        return;
      case 'rack-full':
        // No mutation, no instance allocation, no release: leave the reward
        // visibly in the world and block further overlap processing.
        drop.setPickupBlocked(true);
        this.ctx.bus.emit('weapon:pickup-blocked', {
          definitionId,
          reason: 'rack-full',
          rackCount: result.rackCount,
          rackCapacity: WEAPON_RACK_CAPACITY,
          x,
          y,
        });
        return;
      case 'invalid-definition':
        console.warn(
          `[DropSystem] Weapon drop references unknown weapon definition "${definitionId}"; releasing the invalid pickup`,
        );
        this.releaseDrop(drop);
        return;
    }
  }

  private applyXpGrant(amount: number): void {
    applyXp(this.runState, amount, this.ctx.bus);
  }

  private applyScrapGrant(amount: number): void {
    const gained = amount * this.runState.stats.resolve('currencyGain', 1);
    if (Number.isFinite(gained) && gained > 0) {
      this.runState.currency += gained;
      this.ctx.bus.emit('currency:changed', { runTotal: this.runState.currency });
    }
  }

  private collectChest(drop: Drop): void {
    const chestGrant = drop.grant;
    const { x, y } = drop;
    const tableId = chestGrant?.kind === 'chest' ? chestGrant.tableId : undefined;
    if (tableId === undefined) {
      this.releaseDrop(drop);
      return;
    }

    const table = this.lootTables.lootTableById(tableId);
    if (table === undefined) {
      // Fail soft at runtime, but never silently: a chest referencing a missing
      // table is either a stale reference or a data-config bug. The diagnostic
      // trace makes it discoverable without crashing the run.
      console.warn(`[DropSystem] Chest drop references missing loot table "${tableId}"`);
      this.releaseDrop(drop);
      return;
    }

    let grants: readonly LootGrant[];
    try {
      grants = resolveLootFromTable(table, this.rng);
    } catch (error) {
      // Fail soft at runtime, but never silently: unexpected resolver failures
      // (e.g. a broken RNG or a corrupted table) must leave a diagnostic trace.
      console.warn(`[DropSystem] Failed to resolve chest loot table "${tableId}":`, error);
      grants = [];
    }

    for (const grant of grants) {
      if (grant.kind === 'chest') {
        continue; // defensive: validation guarantees chest-safe targets
      }
      if (grant.kind === 'weapon') {
        // Epic 14 §D9: physical acquisition remains mandatory for every
        // weapon-grant source — spawn a world drop instead of admitting the
        // weapon directly into the rack. No drop:collected for weapons.
        this.spawnDrop(x, y, grant);
        continue;
      }
      if (grant.kind === 'xp') {
        this.applyXpGrant(grant.amount);
      } else if (grant.kind === 'scrap') {
        this.applyScrapGrant(grant.amount);
      } else {
        // 'nothing' entries are excluded by entryToGrants(); skip any other
        // unrecognized grant kind rather than treating it as scrap.
        continue;
      }
      this.ctx.bus.emit('drop:collected', {
        kind: grant.kind,
        amount: grant.amount,
        x,
        y,
      });
    }

    this.releaseDrop(drop);
  }

  private releaseDrop(drop: Drop): void {
    if (!this.liveDrops.delete(drop)) {
      return;
    }
    this.dropPool.release(drop);
  }
}

function arcadeGameObject(value: unknown): Phaser.GameObjects.GameObject | undefined {
  if (value instanceof Phaser.GameObjects.GameObject) {
    return value;
  }

  if (
    value instanceof Phaser.Physics.Arcade.Body ||
    value instanceof Phaser.Physics.Arcade.StaticBody
  ) {
    return value.gameObject;
  }

  return undefined;
}
