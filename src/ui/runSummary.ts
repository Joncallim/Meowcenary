import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import { SceneKey } from '../engine/sceneKeys';
import type { RunOutcome, RunState } from '../gameplay/runState';
import type { BankedRun } from '../systems/ProgressionSystem';
import { formatNumber, formatTime } from './format';
import { minimumHitTarget, physicalToLogical, type UiViewport } from './layout';
import { ThemeColor, ThemeDepth, ThemeFont } from './theme';

export interface RunSummarySnapshot {
  readonly outcome: RunOutcome;
  readonly timeMs: number;
  readonly level: number;
  readonly kills: number;
  readonly runCurrency: number;
  readonly bankedScrap: number;
  readonly totalScrap: number;
  readonly persistenceSucceeded: boolean;
  readonly unlockedIds: readonly string[];
}

export interface RunSummarySource {
  readonly runState: Readonly<RunState>;
  readonly lastBankedRun: BankedRun | null;
}

/** Terminal presentation over RunState + BankedRun. Never banks, recomputes
 *  rewards, or mutates meta: it reads the already-banked Epic 5 result and
 *  tolerates a missing BankedRun (persistence failed before banking) by
 *  showing the finished run with zero banked values and a save warning. */
export class RunSummaryController {
  constructor(private readonly source: RunSummarySource) {}

  snapshot(): RunSummarySnapshot | undefined {
    const runState = this.source.runState;
    if (runState.status !== 'won' && runState.status !== 'lost') {
      return undefined;
    }

    const banked = this.source.lastBankedRun;
    const snapshot: RunSummarySnapshot = {
      outcome: runState.status,
      timeMs: runState.timeMs,
      level: runState.level,
      kills: runState.kills,
      runCurrency: runState.currency,
      bankedScrap: sanitizeScrapFloor(banked?.reward.scrap),
      totalScrap: sanitizeScrapFloor(banked?.meta.scrap),
      persistenceSucceeded: banked?.persisted ?? false,
      unlockedIds: Object.freeze([...(banked?.meta.unlocks ?? [])]),
    };
    return Object.freeze(snapshot);
  }
}

/** Presentation-only sanitizer mirroring the meta-layer flooring so a hostile
 *  reward value can never reach the summary display. */
function sanitizeScrapFloor(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
}

export interface PhaserRunSummaryViewOptions {
  readonly scene: Phaser.Scene;
  readonly viewport: UiViewport;
  readonly bus: EventBus;
  readonly controller: RunSummaryController;
}

/** Terminal win/loss surface: reads the already-banked run and offers Retry or
 *  Main Menu navigation. The full-screen interactive backdrop keeps HUD/world
 *  controls below the modal non-interactive; R is the desktop retry shortcut
 *  only while the summary is visible. */
export class PhaserRunSummaryView {
  private readonly scene: Phaser.Scene;
  private readonly scenePlugin: Phaser.Scenes.ScenePlugin;
  private readonly viewport: UiViewport;
  private readonly controller: RunSummaryController;
  private readonly unsubscribers: Array<() => void>;
  private root?: Phaser.GameObjects.Container;
  private disposed = false;

  constructor(options: PhaserRunSummaryViewOptions) {
    this.scene = options.scene;
    // The view's own `scene` field shadows the ScenePlugin property, so keep
    // an explicit plugin reference for restart/navigation commands.
    this.scenePlugin = options.scene.scene;
    this.viewport = options.viewport;
    this.controller = options.controller;
    this.unsubscribers = [
      options.bus.on('run:won', this.handleTerminal),
      options.bus.on('run:lost', this.handleTerminal),
    ];
    this.scene.input.keyboard?.on('keydown-R', this.handleRetryKey, this);
  }

  get visible(): boolean {
    return !this.disposed && this.root !== undefined;
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.scene.input.keyboard?.off('keydown-R', this.handleRetryKey, this);
    this.root?.destroy(true);
    this.root = undefined;
  }

  private readonly handleTerminal = (): void => {
    if (this.disposed) {
      return;
    }
    const snapshot = this.controller.snapshot();
    if (!snapshot) {
      return;
    }
    this.render(snapshot);
  };

  private readonly handleRetryKey = (event: KeyboardEvent): void => {
    if (this.disposed || event.repeat || !this.visible) {
      return;
    }
    this.scenePlugin.restart();
  };

  private render(snapshot: RunSummarySnapshot): void {
    if (this.disposed) {
      return;
    }
    this.root?.destroy(true);
    this.root = undefined;

    const { scene, viewport } = this;
    const width = viewport.canvasWidth;
    const height = viewport.canvasHeight;
    const margin = physicalToLogical(12, viewport);
    const hitTarget = minimumHitTarget(viewport);
    const buttonWidth = Math.max(180, width - margin * 4);

    const root = scene.add.container(0, 0);
    root.setDepth(ThemeDepth.pauseSummary);
    root.setScrollFactor(0);
    this.root = root;

    // Interactive full-screen backdrop: the top-most interactive object eats
    // pointer events so nothing below the summary stays interactive.
    const backdrop = scene.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      ThemeColor.background,
      0.9,
    );
    backdrop.setInteractive();
    backdrop.setScrollFactor(0);
    root.add(backdrop);

    const centerX = width / 2;
    const heading = this.addText(
      centerX,
      height * 0.12,
      snapshot.outcome === 'won' ? 'Run Complete' : 'Run Failed',
      'heading',
    );
    heading.setOrigin(0.5);
    root.add(heading);

    const labelSize = physicalToLogical(ThemeFont.labelMin, viewport);
    const rowGap = labelSize + physicalToLogical(8, viewport);
    const rows: ReadonlyArray<readonly [string, string]> = [
      ['Time', formatTime(snapshot.timeMs)],
      ['Level', formatNumber(snapshot.level)],
      ['Kills', formatNumber(snapshot.kills)],
      ['Run scrap', formatNumber(snapshot.runCurrency)],
      ['Banked scrap', formatNumber(snapshot.bankedScrap)],
      ['Total scrap', formatNumber(snapshot.totalScrap)],
    ];
    let y = height * 0.2;
    rows.forEach(([label, value]) => {
      const rowLabel = this.addText(margin, y, label, 'body');
      rowLabel.setOrigin(0, 0.5);
      root.add(rowLabel);
      const rowValue = this.addText(width - margin, y, value, 'body');
      rowValue.setOrigin(1, 0.5);
      root.add(rowValue);
      y += rowGap;
    });
    y += physicalToLogical(8, viewport);

    if (!snapshot.persistenceSucceeded) {
      const warning = this.addText(centerX, y, 'Not saved — this session only', 'notice');
      warning.setOrigin(0.5);
      root.add(warning);
      y += rowGap;
    }

    if (snapshot.unlockedIds.length > 0) {
      const unlocked = this.addText(
        centerX,
        y,
        `Unlocked: ${snapshot.unlockedIds.join(', ')}`,
        'body',
      );
      unlocked.setOrigin(0.5);
      root.add(unlocked);
    }

    const retryY = height - margin - hitTarget * 2 - 20;
    this.addButton(root, centerX, retryY, buttonWidth, 'Retry', () => {
      this.scenePlugin.restart();
    }, true);
    this.addButton(root, centerX, retryY + hitTarget + 12, buttonWidth, 'Main Menu', () => {
      this.scenePlugin.start(SceneKey.Menu);
    });

    this.addHint(root, margin, height - margin - 14, 'R to retry');
  }

  private addText(
    x: number,
    y: number,
    text: string,
    kind: 'heading' | 'body' | 'notice',
  ): Phaser.GameObjects.Text {
    const viewport = this.viewport;
    const style =
      kind === 'heading'
        ? {
            color: '#f7f1d5',
            fontFamily: ThemeFont.family,
            fontSize: `${physicalToLogical(ThemeFont.headingMin, viewport)}px`,
            fontStyle: '700',
          }
        : kind === 'notice'
          ? {
              color: '#f87171',
              fontFamily: ThemeFont.family,
              fontSize: `${physicalToLogical(ThemeFont.bodyMin, viewport)}px`,
            }
          : {
              color: '#d6f7ff',
              fontFamily: ThemeFont.family,
              fontSize: `${physicalToLogical(ThemeFont.labelMin, viewport)}px`,
            };
    const textObject = this.scene.add.text(x, y, text, style);
    textObject.setScrollFactor(0);
    return textObject;
  }

  private addButton(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    label: string,
    onActivate: () => void,
    emphasized = false,
  ): void {
    const viewport = this.viewport;
    const hitTarget = minimumHitTarget(viewport);
    const rect = this.scene.add.rectangle(
      x,
      y,
      width,
      hitTarget,
      emphasized ? ThemeColor.cardHover : ThemeColor.card,
    );
    rect.setStrokeStyle(physicalToLogical(2, viewport), emphasized ? ThemeColor.primary : ThemeColor.muted, 0.9);
    rect.setScrollFactor(0);
    rect.setInteractive();
    rect.on(Phaser.Input.Events.POINTER_UP, onActivate);

    const text = this.scene.add.text(x, y, label, {
      color: '#f7f1d5',
      fontFamily: ThemeFont.family,
      fontSize: `${physicalToLogical(ThemeFont.labelMin, viewport)}px`,
    });
    text.setOrigin(0.5);
    text.setScrollFactor(0);

    root.add([rect, text]);
  }

  private addHint(root: Phaser.GameObjects.Container, x: number, y: number, text: string): void {
    const hint = this.addText(x, y, text, 'body');
    hint.setOrigin(0, 1);
    root.add(hint);
  }
}
