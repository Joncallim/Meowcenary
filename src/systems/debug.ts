import Phaser from 'phaser';
import type { System } from '../engine/system';
import type { Player } from '../entities/Player';
import type { Modifier } from '../gameplay/stats';
import type { RunState } from '../gameplay/runState';
import type { SpawnCurveDefinition } from './types';

export class DebugOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private visible = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.text = scene.add
      .text(45.4, 90.8, '', {
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        color: '#d9f99d',
        fontFamily: 'monospace',
        fontSize: '12px',
        padding: { x: 6, y: 4 },
      })
      .setDepth(10_000)
      .setScrollFactor(0)
      .setVisible(false);
    this.text.setScale(1 / 1.25);

    scene.input.keyboard?.on('keydown-F3', this.toggle, this);
  }

  update(lines: readonly string[] = []): void {
    if (!this.visible) {
      return;
    }

    const fps = Math.round(this.scene.game.loop.actualFps);
    this.text.setText(['Meowcenary Debug', `FPS: ${fps}`, ...lines].join('\n'));
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown-F3', this.toggle, this);
    this.text.destroy();
  }

  private toggle(): void {
    this.visible = !this.visible;
    this.text.setVisible(this.visible);
  }
}

/** Development-only physics diagnostics opt-in. First value wins. */
export function physicsDebugEnabled(search: string, isDev: boolean): boolean {
  if (!isDev) return false;
  try {
    return new URLSearchParams(search).get('physicsdebug') === '1';
  } catch {
    return false;
  }
}

export interface PhysicsDebugWorld {
  drawDebug: boolean;
  debugGraphic?: {
    setVisible(visible: boolean): unknown;
    clear(): unknown;
  };
  createDebugGraphic(): unknown;
}

/** Toggle without depending on Phaser's createDebugGraphic side effect. */
export function togglePhysicsDebugWorld(world: PhysicsDebugWorld): boolean {
  const next = !world.drawDebug;
  if (!world.debugGraphic) world.createDebugGraphic();
  world.drawDebug = next;
  world.debugGraphic?.setVisible(next);
  if (!next) world.debugGraphic?.clear();
  return next;
}

export interface DebugFlags {
  readonly enabled: boolean;
  readonly godMode: boolean;
  readonly xpMultiplier: number;
  readonly scrapMultiplier: number;
  readonly spawnMultiplier: number;
}

export const DEFAULT_DEBUG_FLAGS: DebugFlags = Object.freeze({
  enabled: false,
  godMode: false,
  xpMultiplier: 1,
  scrapMultiplier: 1,
  spawnMultiplier: 1,
});

/**
 * Development-only URL grammar (Epic 11 remainder §6.2):
 * `?cheats=1&god=1&xp=4&scrap=3&spawn=2`.
 * - `cheats` must be exactly `"1"`; any other first value returns
 *   `DEFAULT_DEBUG_FLAGS` by identity and leaves every parameter inert.
 * - `xp`/`scrap` accept finite values in [0.1, 100]; `spawn` in [1, 20].
 * - Missing, empty, non-numeric, infinite, or out-of-range values fall back
 *   only that field to 1; `Number(raw)` (not `parseFloat`) is the parser.
 * - Unknown and duplicate (`URLSearchParams.get` first-value) parameters are
 *   handled per the frozen grammar. The function never throws.
 */
export function readDebugFlags(search: string): DebugFlags {
  const params = new URLSearchParams(search);
  if (params.get('cheats') !== '1') {
    return DEFAULT_DEBUG_FLAGS;
  }

  return Object.freeze({
    enabled: true,
    godMode: params.get('god') === '1',
    xpMultiplier: parseInRange(params.get('xp'), 0.1, 100),
    scrapMultiplier: parseInRange(params.get('scrap'), 0.1, 100),
    spawnMultiplier: parseInRange(params.get('spawn'), 1, 20),
  });
}

function parseInRange(raw: string | null, min: number, max: number): number {
  if (raw === null || raw === '') {
    return 1;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : 1;
}

let cachedDebugFlags: DebugFlags | undefined;

/** Reads the location at most once per page, and only in development. */
export function getDebugFlags(): DebugFlags {
  if (!import.meta.env.DEV) {
    return DEFAULT_DEBUG_FLAGS;
  }
  cachedDebugFlags ??= readDebugFlags(globalThis.location?.search ?? '');
  return cachedDebugFlags;
}

export function debugCheatsActive(
  flags: DebugFlags,
  isDev = import.meta.env.DEV,
): boolean {
  return isDev && flags.enabled;
}

export const DEBUG_CHEAT_SOURCE = 'debug:cheats';

/** Pure modifier generation; fresh objects, XP then scrap, no god/spawn stats. */
export function debugCheatModifiers(flags: DebugFlags): Modifier[] {
  if (!flags.enabled) {
    return [];
  }

  const modifiers: Modifier[] = [];
  if (flags.xpMultiplier !== 1) {
    modifiers.push({
      stat: 'xpGain',
      op: 'mult',
      value: flags.xpMultiplier,
      sourceId: DEBUG_CHEAT_SOURCE,
    });
  }
  if (flags.scrapMultiplier !== 1) {
    modifiers.push({
      stat: 'currencyGain',
      op: 'mult',
      value: flags.scrapMultiplier,
      sourceId: DEBUG_CHEAT_SOURCE,
    });
  }
  return modifiers;
}

/**
 * Non-mutating construction-time copy that shortens every wave's
 * `spawnEveryMs` by `multiplier`. `maxAlive`, start times, duration, scaling,
 * IDs, and ordering are untouched. Invalid or `<= 1` multipliers fail neutral
 * by returning the same reference.
 */
export function scaleSpawnCurveIntervals(
  curve: Readonly<SpawnCurveDefinition>,
  multiplier: number,
): SpawnCurveDefinition {
  if (!Number.isFinite(multiplier) || multiplier <= 1) {
    return curve as SpawnCurveDefinition;
  }

  return {
    ...curve,
    waves: curve.waves.map((wave) => ({
      ...wave,
      spawnEveryMs: Math.max(1, Math.round(wave.spawnEveryMs / multiplier)),
    })),
  };
}

export interface DebugCheatSystemOptions {
  readonly runState: RunState;
  readonly player: Player;
  readonly flags: DebugFlags;
  readonly logger?: Pick<Console, 'info'>;
}

/**
 * Scene-scoped development cheat system. Applies the `debug:cheats`
 * modifiers once at construction, refills the player while god mode is on,
 * and removes its modifiers exactly once on destroy. A single lethal hit can
 * still end the run before the next active update refills (accepted
 * limitation, Epic 11 remainder §2.7).
 */
export class DebugCheatSystem implements System {
  private readonly runState: RunState;
  private readonly player: Player;
  private readonly flags: DebugFlags;
  private readonly logger: Pick<Console, 'info'>;
  private destroyed = false;

  constructor(options: DebugCheatSystemOptions) {
    this.runState = options.runState;
    this.player = options.player;
    this.flags = options.flags;
    this.logger = options.logger ?? console;

    for (const modifier of debugCheatModifiers(options.flags)) {
      this.runState.stats.add(modifier);
    }

    this.logger.info(
      `[cheats] god=${options.flags.godMode ? 'on' : 'off'} ` +
        `xp=${options.flags.xpMultiplier}x scrap=${options.flags.scrapMultiplier}x spawn=${options.flags.spawnMultiplier}x`,
    );
  }

  update(_dtMs: number): void {
    if (this.flags.godMode && this.runState.status === 'active') {
      this.player.health = this.player.maxHealth;
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.runState.stats.remove(DEBUG_CHEAT_SOURCE);
  }
}
