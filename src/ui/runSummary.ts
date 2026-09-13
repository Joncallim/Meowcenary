import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import { SceneKey } from '../engine/sceneKeys';
import type { RunOutcome, RunState } from '../gameplay/runState';
import type { BankedRun } from '../systems/ProgressionSystem';
import { formatNumber, formatTime } from './format';
import { edgeMargin, logicalCanvasViewport, minimumHitTarget, physicalToLogical, zoomedGameUiViewport, type UiViewport } from './layout';
import { createModalTextHelpers, type ModalTextHelpers, type ModalTextKind } from './modal';
import { ThemeColor, ThemeDepth, ThemeFont } from './theme';
import { FocusNavigator, type FocusDirection } from './focusList';
import type { InputMode } from '../systems/input';
import { isPortraitOrientationBlocked } from '../platform/orientation';

export interface RunSummarySnapshot {
  readonly outcome: RunOutcome;
  readonly timeMs: number;
  readonly level: number;
  readonly kills: number;
  readonly runCurrency: number;
  readonly bankedScrap: number;
  readonly totalScrap: number;
  readonly persistenceSucceeded: boolean;
  /** Player-facing labels from the accepted terminal settlement only. Never
   * rebuild this list from the historical progression unlock bag. */
  readonly newlyAvailableNames: readonly string[];
  /** Achievements completed in this run, supplied by authoritative gameplay. */
  readonly completedAchievementNames: readonly string[];
  /** Stable terminal presentation records. These are deliberately not joined
   * back to art via names, which would make a rename/localisation a broken
   * identity boundary. */
  readonly completedAchievements: readonly CompletedAchievementPresentation[];
  /** A completed Alpha 3 contract may advance directly to its next selection. */
  readonly canContinue: boolean;
}

export interface CompletedAchievementPresentation {
  readonly id: string;
  readonly name: string;
  readonly iconArtId: string;
}

export interface RunSummarySource {
  readonly runState: Readonly<RunState>;
  readonly lastBankedRun: BankedRun | null;
  readonly canContinue?: boolean;
  readonly completedAchievementNames?: readonly string[];
  /** Preferred structured terminal Achievement presentation. The legacy name
   * list remains temporarily for callers that predate icon presentation. */
  readonly completedAchievements?: readonly CompletedAchievementPresentation[];
  /** Structured terminal-settlement presentation supplied by the terminal
   * owner. Values are already player-facing copy, never stable IDs. */
  readonly newlyAvailableNames?: readonly string[];
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
      newlyAvailableNames: Object.freeze([...(this.source.newlyAvailableNames ?? [])]),
      completedAchievementNames: Object.freeze([...(this.source.completedAchievementNames ?? [])]),
      completedAchievements: Object.freeze((this.source.completedAchievements ?? []).map((achievement) => Object.freeze({
        id: achievement.id,
        name: achievement.name,
        iconArtId: achievement.iconArtId,
      }))),
      canContinue: runState.status === 'won' && this.source.canContinue === true,
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

/** A measured logical rectangle used by the terminal surface. Keeping the
 * layout pure means the content and the fixed action tray cannot invent
 * competing Y positions during a render or resize. */
export interface RunSummaryRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RunSummaryLayout {
  readonly safeBounds: RunSummaryRect;
  readonly headingBounds: RunSummaryRect;
  readonly statsBounds: RunSummaryRect;
  /** The only region variable terminal material may occupy. */
  readonly contentBounds: RunSummaryRect;
  readonly hintBounds: RunSummaryRect;
  readonly actionTrayBounds: RunSummaryRect;
  /** In logical navigation/render order. */
  readonly actionBounds: readonly RunSummaryRect[];
  readonly actionColumns: number;
}

/**
 * Computes the complete terminal layout before any Phaser node is created.
 * The action tray is bottom-anchored, the hint has its own reserved row, and
 * variable result material is constrained above it. This deliberately avoids
 * the previous independent "first button" and hint calculations.
 */
export function computeRunSummaryLayout(
  viewport: UiViewport,
  actionCount: number,
): RunSummaryLayout {
  if (!Number.isSafeInteger(actionCount) || actionCount < 1) {
    throw new RangeError('actionCount must be a positive safe integer');
  }
  const left = edgeMargin(viewport, 'left');
  const right = edgeMargin(viewport, 'right');
  const top = edgeMargin(viewport, 'top');
  const bottom = edgeMargin(viewport, 'bottom');
  const width = Math.max(0, viewport.canvasWidth - left - right);
  const height = Math.max(0, viewport.canvasHeight - top - bottom);
  const safeBounds: RunSummaryRect = { x: left, y: top, width, height };
  const gap = physicalToLogical(8, viewport);
  const hitTarget = minimumHitTarget(viewport);
  const headingHeight = physicalToLogical(ThemeFont.headingMin, viewport) + gap;
  const rowGap = physicalToLogical(ThemeFont.labelMin + 8, viewport);
  const statsHeight = rowGap * 6;
  const headingBounds: RunSummaryRect = { x: left, y: top, width, height: headingHeight };
  const statsBounds: RunSummaryRect = {
    x: left,
    y: headingBounds.y + headingBounds.height + gap,
    width,
    height: statsHeight,
  };

  const actionColumns = actionCount === 1 ? 1 : 2;
  const actionRows = Math.ceil(actionCount / actionColumns);
  const actionTrayHeight = actionRows * hitTarget + Math.max(0, actionRows - 1) * gap;
  const actionTrayBounds: RunSummaryRect = {
    x: left,
    y: top + height - actionTrayHeight,
    width,
    height: actionTrayHeight,
  };
  const hintHeight = physicalToLogical(ThemeFont.labelMin, viewport);
  const hintBounds: RunSummaryRect = {
    x: left,
    y: actionTrayBounds.y - gap - hintHeight,
    width,
    height: hintHeight,
  };
  const contentBounds: RunSummaryRect = {
    x: left,
    y: statsBounds.y + statsBounds.height + gap,
    width,
    height: Math.max(0, hintBounds.y - gap - (statsBounds.y + statsBounds.height + gap)),
  };
  const actionBounds: RunSummaryRect[] = [];
  const columnGap = gap;
  const halfWidth = (width - columnGap) / 2;
  for (let index = 0; index < actionCount; index += 1) {
    const row = Math.floor(index / actionColumns);
    const isLastOdd = actionColumns === 2 && actionCount % 2 === 1 && index === actionCount - 1;
    actionBounds.push(isLastOdd
      ? { x: left, y: actionTrayBounds.y + row * (hitTarget + gap), width, height: hitTarget }
      : {
        x: left + (index % actionColumns) * (halfWidth + columnGap),
        y: actionTrayBounds.y + row * (hitTarget + gap),
        width: actionColumns === 1 ? width : halfWidth,
        height: hitTarget,
      });
  }
  return Object.freeze({
    safeBounds: Object.freeze(safeBounds),
    headingBounds: Object.freeze(headingBounds),
    statsBounds: Object.freeze(statsBounds),
    contentBounds: Object.freeze(contentBounds),
    hintBounds: Object.freeze(hintBounds),
    actionTrayBounds: Object.freeze(actionTrayBounds),
    actionBounds: Object.freeze(actionBounds.map((bounds) => Object.freeze(bounds))),
    actionColumns,
  });
}

function terminalMaterialLines(
  snapshot: RunSummarySnapshot,
  navigationPending: boolean,
): ReadonlyArray<{ readonly text: string; readonly kind: ModalTextKind }> {
  const lines: Array<{ readonly text: string; readonly kind: ModalTextKind }> = [];
  if (!snapshot.persistenceSucceeded || navigationPending) {
    lines.push({ text: navigationPending ? 'Saving rewards…' : 'Not saved — this session only', kind: 'notice' });
  }
  if (snapshot.newlyAvailableNames.length > 0) {
    lines.push({ text: compactTerminalNames('New', snapshot.newlyAvailableNames), kind: 'body' });
  }
  if (snapshot.completedAchievements.length === 0 && snapshot.completedAchievementNames.length > 0) {
    lines.push({
      text: compactTerminalNames(
        snapshot.completedAchievementNames.length === 1 ? 'Achievement' : 'Achievements',
        snapshot.completedAchievementNames,
      ),
      kind: 'body',
    });
  }
  return lines;
}

/** Terminal results are intentionally bounded; exhaustive collection detail
 * belongs in Career rather than behind a second gesture system beside actions. */
function compactTerminalNames(label: string, names: readonly string[]): string {
  const shown = names.slice(0, 2);
  const suffix = names.length > shown.length ? ` +${names.length - shown.length} more` : '';
  return `${label}: ${shown.join(' • ')}${suffix}`;
}

export interface PhaserRunSummaryViewOptions {
  readonly scene: Phaser.Scene;
  readonly viewport: UiViewport;
  readonly bus: EventBus;
  readonly controller: RunSummaryController;
  readonly readInputMode?: () => InputMode;
  /** Selects the next unlocked stage. Returns false when no next contract exists. */
  readonly onNextStage?: () => boolean;
  /** Terminal rewards that have not yet crossed their durable boundary keep
   * navigation in the summary until their retry completes. */
  readonly canNavigate?: () => boolean;
  /** Explicit recovery path when local persistence remains unavailable. */
  readonly onDiscardPending?: () => void;
  /** Routes directly to the player's loadout surface. */
  readonly onAdjustLoadout?: () => void;
  /** Generic semantic-icon lookup supplied by the scene/data composition
   * boundary. A missing resource leaves the tile's text identity intact. */
  readonly resolveAchievementIcon?: (iconArtId: string) => Readonly<{
    textureKey: string;
    frameKey?: string;
  }> | undefined;
}

/** Terminal win/loss surface: reads the already-banked run and offers only
 *  settlement-safe terminal navigation. The full-screen interactive backdrop keeps HUD/world
 *  controls below the modal non-interactive; R is the desktop retry shortcut
 *  only while the summary is visible. */
export class PhaserRunSummaryView {
  private readonly scene: Phaser.Scene;
  private readonly scenePlugin: Phaser.Scenes.ScenePlugin;
  private viewport: UiViewport;
  private readonly bus: EventBus;
  private readonly controller: RunSummaryController;
  private readonly readInputMode: () => InputMode;
  private readonly onNextStage?: () => boolean;
  private readonly canNavigate: () => boolean;
  private readonly onDiscardPending?: () => void;
  private readonly onAdjustLoadout?: () => void;
  private readonly resolveAchievementIcon?: PhaserRunSummaryViewOptions['resolveAchievementIcon'];
  private modal: ModalTextHelpers;
  private readonly unsubscribers: Array<() => void>;
  private root?: Phaser.GameObjects.Container;
  private disposed = false;
  private readonly navigator = new FocusNavigator('grid', 2);
  private buttons: import('./modal').ModalButtonHandle[] = [];
  private hint?: Phaser.GameObjects.Text;
  private hoveredIndex = -1;
  private summaryActive = false;
  private inputMode: InputMode = 'pointer';
  private lastInputMode: InputMode = 'pointer';
  private rebuildCount = 0;

  /** Number of summary render attempts; resize tests assert one per event. */
  get renderRebuildCount(): number {
    return this.rebuildCount;
  }

  constructor(options: PhaserRunSummaryViewOptions) {
    this.scene = options.scene;
    // The view's own `scene` field shadows the ScenePlugin property, so keep
    // an explicit plugin reference for restart/navigation commands.
    this.scenePlugin = options.scene.scene;
    this.viewport = options.viewport;
    this.bus = options.bus;
    this.controller = options.controller;
    this.readInputMode = options.readInputMode ?? (() => 'pointer');
    this.onNextStage = options.onNextStage;
    this.canNavigate = options.canNavigate ?? (() => true);
    this.onDiscardPending = options.onDiscardPending;
    this.onAdjustLoadout = options.onAdjustLoadout;
    this.resolveAchievementIcon = options.resolveAchievementIcon;
    this.modal = createModalTextHelpers(options.scene, options.viewport);
    this.unsubscribers = [
      options.bus.on('run:won', this.handleTerminal),
      options.bus.on('run:lost', this.handleTerminal),
    ];
    this.scene.input.keyboard?.on('keydown-R', this.handleRetryKey, this);
    this.scene.scale?.on?.(Phaser.Scale.Events.RESIZE, this.handleResize, this);
  }

  get visible(): boolean {
    return !this.disposed && this.root !== undefined;
  }

  moveFocus(direction: FocusDirection): boolean {
    if (!this.visible) return false;
    const moved = this.navigator.move(direction);
    if (moved) {
      this.applyFocus();
      this.bus.emit('ui:navigate', {});
    }
    return moved;
  }

  confirmFocused(): boolean {
    if (!this.visible) return false;
    return this.buttons[this.navigator.index]?.activate() ?? false;
  }

  refreshInputPresentation(): void {
    const mode = this.readInputMode!();
    if (mode === this.lastInputMode) return;
    this.lastInputMode = mode;
    this.inputMode = mode;
    if (this.hint) this.hint.setText(this.hintCopy());
    this.applyFocus();
  }

  /** Rebuilds the terminal read model after a deferred persistence retry
   * succeeds, so totals, warnings, and available actions never stay stale. */
  refresh(): void {
    if (this.disposed || !this.summaryActive) return;
    const snapshot = this.controller.snapshot();
    if (snapshot) this.render(snapshot);
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.scene.input.keyboard?.off('keydown-R', this.handleRetryKey, this);
    this.scene.scale?.off?.(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.root?.destroy(true);
    this.root = undefined;
    this.summaryActive = false;
    this.buttons = [];
    this.hint = undefined;
    this.hoveredIndex = -1;
    this.navigator.setCount(0);
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
    if (isPortraitOrientationBlocked() || this.disposed || event.repeat || !this.visible) {
      return;
    }
    this.retry();
  };

  private readonly handleResize = (): void => {
    if (this.disposed || !this.summaryActive) return;
    this.viewport = this.viewport.originX === undefined ? logicalCanvasViewport(
      this.scene.scale.displaySize.width, this.scene.scale.displaySize.height, this.scene.scale.parentSize.width, this.scene.scale.parentSize.height,
    ) : zoomedGameUiViewport(
      this.scene.scale.displaySize.width, this.scene.scale.displaySize.height, this.scene.scale.parentSize.width, this.scene.scale.parentSize.height,
    );
    this.modal = createModalTextHelpers(this.scene, this.viewport);
    const snapshot = this.controller.snapshot();
    if (snapshot) this.render(snapshot);
  };

  /** One shared Retry command for the button and the R shortcut: exactly one
   *  confirm cue, then the scene restart. */
  private retry(): void {
    if (this.disposed || !this.visible || !this.canNavigate()) {
      return;
    }
    this.bus.emit('ui:confirm', {});
    this.scenePlugin.restart();
  }

  private adjustLoadout(): void {
    if (this.disposed || !this.visible || !this.canNavigate()) return;
    this.bus.emit('ui:confirm', {});
    if (this.onAdjustLoadout) {
      this.onAdjustLoadout();
      return;
    }
    this.scenePlugin.start(SceneKey.Menu, { initialPanel: 'equipment' });
  }

  /** Returns to the neutral Menu surface only after terminal settlement is
   * durable. It deliberately does not select a stage, mutate a loadout, or
   * restart gameplay. */
  private returnToMainMenu(): void {
    if (this.disposed || !this.visible || !this.canNavigate()) return;
    this.bus.emit('ui:confirm', {});
    this.scenePlugin.start(SceneKey.Menu);
  }

  private continueToNextStage(): void {
    if (this.disposed || !this.visible || !this.canNavigate() || !this.onNextStage?.()) return;
    this.bus.emit('ui:confirm', {});
    this.scenePlugin.start(SceneKey.Menu);
  }

  private discardAndReturnToMenu(): void {
    if (this.disposed || !this.visible || this.canNavigate() || !this.onDiscardPending) return;
    this.onDiscardPending();
    this.bus.emit('ui:confirm', {});
    this.scenePlugin.start(SceneKey.Menu);
  }

  private render(snapshot: RunSummarySnapshot): void {
    this.rebuildCount += 1;
    if (this.disposed) {
      return;
    }
    const wasActive = this.summaryActive;
    this.root?.destroy(true);
    this.root = undefined;
    // Unpublished references are cleared up front: a failed rebuild must
    // never leave moveFocus/confirmFocused able to reach destroyed-tree
    // handles (F6 committed-render transaction).
    this.buttons = [];
    this.hint = undefined;
    this.hoveredIndex = -1;

    const { scene, viewport } = this;
    const width = viewport.canvasWidth;
    const height = viewport.canvasHeight;

    const root = scene.add.container(viewport.originX ?? 0, viewport.originY ?? 0);

    try {
      root.setDepth(ThemeDepth.pauseSummary);
      root.setScrollFactor(0);

      // Interactive full-screen backdrop: the top-most interactive object eats
      // pointer events so nothing below the summary stays interactive.
      // Parented immediately so a failed chain call cannot orphan it.
      const backdrop = scene.add.rectangle(
        width / 2,
        height / 2,
        width,
        height,
        ThemeColor.background,
        0.9,
      );
      root.add(backdrop);
      backdrop.setInteractive();
      backdrop.setScrollFactor(0);

      const navigationPending = !this.canNavigate();
      const hasNextStage = !navigationPending && snapshot.canContinue && this.onNextStage !== undefined;
      const hasDiscard = navigationPending && this.onDiscardPending !== undefined;
      // Pending durability is an explicit recovery state, never ordinary
      // navigation with an extra escape button tacked on.
      const actionSpecs: ReadonlyArray<readonly [string, () => void, boolean?]> = navigationPending
        ? hasDiscard ? [['Continue without saving', () => this.discardAndReturnToMenu(), true]] : []
        : hasNextStage
          ? [
            ['Next Contract', () => this.continueToNextStage(), true],
            ['Replay', () => this.retry(), true],
            ['Adjust Loadout', () => this.adjustLoadout()],
            ['Main Menu', () => this.returnToMainMenu()],
          ]
          : [
            [snapshot.outcome === 'won' ? 'Replay' : 'Retry', () => this.retry(), true],
            ['Adjust Loadout', () => this.adjustLoadout()],
            ['Main Menu', () => this.returnToMainMenu()],
          ];
      // A pending state with no recovery handler is still rendered safely as
      // a disabled status surface. GameScene always supplies recovery, but
      // this keeps an incomplete host from creating an invalid geometry.
      const layout = computeRunSummaryLayout(viewport, Math.max(1, actionSpecs.length));
      this.navigator.setColumns(layout.actionColumns);
      const centerX = layout.safeBounds.x + layout.safeBounds.width / 2;
      const heading = this.modal.addText(
        centerX,
        layout.headingBounds.y + layout.headingBounds.height / 2,
        snapshot.outcome === 'won' ? 'Run Complete' : 'Run Failed',
        'heading',
      );
      root.add(heading);
      heading.setOrigin(0.5);

      const rowGap = layout.statsBounds.height / 6;
      const rows: ReadonlyArray<readonly [string, string]> = [
        ['Time', formatTime(snapshot.timeMs)],
        ['Level', formatNumber(snapshot.level)],
        ['Kills', formatNumber(snapshot.kills)],
        ['Run scrap', formatNumber(snapshot.runCurrency)],
        ['Banked scrap', formatNumber(snapshot.bankedScrap)],
        ['Total scrap', formatNumber(snapshot.totalScrap)],
      ];
      let y = layout.statsBounds.y + rowGap / 2;
      rows.forEach(([label, value]) => {
        const rowLabel = this.modal.addText(layout.statsBounds.x, y, label, 'body');
        root.add(rowLabel);
        rowLabel.setOrigin(0, 0.5);
        const rowValue = this.modal.addText(layout.statsBounds.x + layout.statsBounds.width, y, value, 'body');
        root.add(rowValue);
        rowValue.setOrigin(1, 0.5);
        y += rowGap;
      });
      const material = terminalMaterialLines(snapshot, navigationPending);
      const maxMaterialLines = Math.floor(layout.contentBounds.height / rowGap);
      material.slice(0, maxMaterialLines).forEach((line, index) => {
        const text = this.modal.addText(
          centerX,
          layout.contentBounds.y + rowGap * (index + 0.5),
          line.text,
          line.kind,
        );
        root.add(text);
        text.setOrigin(0.5);
        // Long settlement names are bounded by the measured result region.
        // Phaser's optional method is absent from narrow test doubles.
        (text as Phaser.GameObjects.Text & { setWordWrapWidth?: (width: number) => unknown })
          .setWordWrapWidth?.(layout.contentBounds.width);
      });
      this.renderAchievementTiles(
        root,
        layout.contentBounds,
        rowGap * material.slice(0, maxMaterialLines).length,
        snapshot.completedAchievements,
      );

      const buttons: import('./modal').ModalButtonHandle[] = [];
      actionSpecs.forEach(([label, activate, emphasized], index) => {
        const bounds = layout.actionBounds[index]!;
        buttons.push(this.modal.addButton(
          root,
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
          bounds.width,
          label,
          activate,
          emphasized,
        ));
      });
      // F5: summary modal buttons participate in pointer-hover focus —
      // silent index sync, exactly one FocusStroke ring on hover, cleared on
      // out, and the logical index is set before pointer-up activation.
      buttons.forEach((handle, index) => this.wireModalHover(handle, index));
      // The hint occupies its own measured row above the action tray.
      const hint = this.modal.addHint(root, layout.hintBounds.x, layout.hintBounds.y + layout.hintBounds.height, this.hintCopy());
      if (!wasActive) this.navigator.reset();
      this.navigator.setCount(buttons.length);
      // Stage then publish: the target list, hint, and identity are committed
      // together with the root only after the whole tree built successfully.
      this.buttons = buttons;
      this.hint = hint;
      this.applyFocus();

      // The root is only published once the display tree is fully built, so a
      // failed render leaves the view invisible and a later terminal event can
      // retry from a clean slate.
      this.root = root;
      this.summaryActive = true;
    } catch (error) {
      root.destroy(true);
      this.buttons = [];
      this.hint = undefined;
      this.hoveredIndex = -1;
      throw error;
    }
  }

  private wireModalHover(handle: import('./modal').ModalButtonHandle, index: number): void {
    handle.target.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.hoveredIndex = index;
      this.navigator.setIndex(index);
      this.applyFocus();
    });
    handle.target.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (this.hoveredIndex === index) this.hoveredIndex = -1;
      this.applyFocus();
    });
    // Single surface funnel for pointer activation: FIRST sync the logical
    // index, THEN activate (round-2 finding F2).
    handle.target.on(Phaser.Input.Events.POINTER_UP, () => {
      this.hoveredIndex = index;
      this.navigator.setIndex(index);
      this.applyFocus();
      handle.activate();
    });
  }

  /** Compact, bounded terminal tiles. The Career gallery remains the
   * exhaustive surface; this one never pushes into the fixed hint/action tray. */
  private renderAchievementTiles(
    root: Phaser.GameObjects.Container,
    contentBounds: RunSummaryRect,
    occupiedHeight: number,
    achievements: readonly CompletedAchievementPresentation[],
  ): void {
    if (achievements.length === 0) return;
    const gap = physicalToLogical(8, this.viewport);
    const tileHeight = minimumHitTarget(this.viewport);
    const remainingHeight = Math.max(0, contentBounds.height - occupiedHeight);
    const rows = Math.floor((remainingHeight + gap) / (tileHeight + gap));
    const capacity = rows * 2;
    if (capacity <= 0) return;
    const visible = achievements.length <= capacity
      ? achievements
      : [
        ...achievements.slice(0, Math.max(0, capacity - 1)),
        { id: 'summary:more', name: `+${achievements.length - Math.max(0, capacity - 1)} more`, iconArtId: '' },
      ];
    const tileWidth = (contentBounds.width - gap) / 2;
    visible.forEach((achievement, index) => {
      const x = contentBounds.x + (index % 2) * (tileWidth + gap);
      const y = contentBounds.y + occupiedHeight + Math.floor(index / 2) * (tileHeight + gap);
      const card = this.scene.add.rectangle(x + tileWidth / 2, y + tileHeight / 2, tileWidth, tileHeight, ThemeColor.surface);
      card.setStrokeStyle(physicalToLogical(1, this.viewport), ThemeColor.muted, 0.7);
      card.setScrollFactor(0);
      root.add(card);
      const iconBinding = achievement.iconArtId ? this.resolveAchievementIcon?.(achievement.iconArtId) : undefined;
      if (iconBinding && this.scene.textures.exists(iconBinding.textureKey)) {
        const icon = this.scene.add.image(
          x + physicalToLogical(18, this.viewport),
          y + tileHeight / 2,
          iconBinding.textureKey,
          iconBinding.frameKey,
        );
        icon.setDisplaySize(physicalToLogical(24, this.viewport), physicalToLogical(24, this.viewport));
        icon.setScrollFactor(0);
        root.add(icon);
      }
      const label = this.modal.addText(
        x + (iconBinding ? physicalToLogical(34, this.viewport) : gap),
        y + tileHeight / 2,
        achievement.name,
        'body',
      );
      label.setOrigin(0, 0.5);
      (label as Phaser.GameObjects.Text & { setWordWrapWidth?: (width: number) => unknown })
        .setWordWrapWidth?.(tileWidth - (iconBinding ? physicalToLogical(38, this.viewport) : gap * 2));
      root.add(label);
    });
  }

  private applyFocus(): void {
    this.buttons.forEach((button, index) => {
      button.setFocusVisible(this.inputMode === 'pointer' ? index === this.hoveredIndex : index === this.navigator.index);
    });
  }

  private hintCopy(): string {
    switch (this.readInputMode!()) {
      case 'keyboard': return 'Arrows • Enter/Space select';
      case 'gamepad': return 'D-pad/stick • Bottom face select';
      default: return 'Tap an action';
    }
  }
}
