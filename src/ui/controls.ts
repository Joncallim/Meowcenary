import Phaser from 'phaser';
import { clampLength } from '../engine/vector';
import { assertTouchStickConfig, RuntimeConfig, type TouchStickConfig } from '../engine/config';
import type { InputController, InputMode, InputPresentationSnapshot } from '../systems/input';
import { physicalToLogical, GAMEPLAY_ZOOM, zoomedGameUiViewport, type UiViewport } from './layout';
import { reducedMotionDuration, ThemeColor, ThemeDepth, ThemeFont } from './theme';


const HINT_DURATION_MS = 2200;
const HINT_FADE_MS = 400;


export interface ControlsViewOptions {
  readonly scene: Phaser.Scene;
  readonly input: InputController;
  readonly viewport: UiViewport;
  readonly readReducedMotion: () => boolean;
  readonly onPauseRequested: () => void;
  readonly touchStick?: TouchStickConfig;
}

export class ControlsView {
  private readonly scene: Phaser.Scene;
  private readonly input: InputController;
  private viewport: UiViewport;
  private readonly onPauseRequested: () => void;
  private readonly readReducedMotion: () => boolean;
  private readonly stickRadius: number;
  private readonly root?: Phaser.GameObjects.Container;
  private readonly stickBase: Phaser.GameObjects.Arc;
  private readonly stickThumb: Phaser.GameObjects.Arc;
  private hintText!: Phaser.GameObjects.Text;
  private pauseButton!: Phaser.GameObjects.Rectangle;
  private hintElapsedMs = 0;
  private hintFaded = false;
  private lastMode: InputMode = 'pointer';
  private disposed = false;

  constructor(options: ControlsViewOptions) {
    const { scene, input, viewport, readReducedMotion, onPauseRequested } = options;
    const touchStick = options.touchStick ?? RuntimeConfig.gameplay.input.touchStick;
    assertTouchStickConfig(touchStick);
    this.scene = scene;
    this.input = input;
    this.viewport = viewport;
    this.onPauseRequested = onPauseRequested;
    this.readReducedMotion = readReducedMotion;
    this.stickRadius = touchStick.radius;
    const add = scene.add as typeof scene.add & { container?: (x: number, y: number) => Phaser.GameObjects.Container };
    this.root = add.container?.(viewport.originX ?? 0, viewport.originY ?? 0);
    this.root?.setScrollFactor(0);

    // Exactly ONE zoom compensation: the camera zoom 1.25 magnifies world
    // units, so the authored radius is divided by the zoom and the arcs are
    // left at scale 1 — the rendered diameter is 2·(64/1.25)·1.25·s = 128·s
    // physical px with the visible radius at 64 px (AM-3). A second
    // compensation (e.g. setScale(0.8)) would shrink the stick to 102.4·s.
    const stickRenderRadius = viewport.originX === undefined
      ? this.stickRadius
      : this.stickRadius / GAMEPLAY_ZOOM;
    this.stickBase = scene.add.arc(0, 0, stickRenderRadius, 0, 360, false, ThemeColor.cream, 0.18);
    this.stickBase.setDepth(ThemeDepth.transientHint);
    this.stickBase.setScrollFactor(0);
    this.stickBase.setVisible(false);

    this.stickThumb = scene.add.arc(0, 0, stickRenderRadius * 0.45, 0, 360, false, ThemeColor.cream, 0.55);
    this.stickThumb.setDepth(ThemeDepth.transientHint);
    this.stickThumb.setScrollFactor(0);
    this.stickThumb.setVisible(false);

    this.root?.add([this.stickBase, this.stickThumb]);
    this.buildViewportControls();
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleChange, this);
  }

  private buildViewportControls(): void {
    const { scene, viewport } = this;
    const margin = physicalToLogical(12, viewport);
    const fontSize = physicalToLogical(ThemeFont.bodyMin, viewport);
    const pauseSize = physicalToLogical(44, viewport);

    this.hintText = scene.add.text(
      viewport.canvasWidth / 2,
      viewport.canvasHeight
        - margin
        - this.stickRadius * 2
        - fontSize,
      hintForMode(this.lastMode),
      {
        align: 'center',
        color: '#f7f1d5',
        fontFamily: ThemeFont.family,
        fontSize: `${fontSize}px`,
      },
    );
    this.hintText.setOrigin(0.5);
    this.hintText.setDepth(ThemeDepth.transientHint);
    this.hintText.setScrollFactor(0);
    if (this.hintFaded) {
      this.hintText.setAlpha(0);
    }

    this.pauseButton = scene.add.rectangle(
      viewport.canvasWidth - margin - pauseSize / 2,
      margin + pauseSize / 2,
      pauseSize,
      pauseSize,
      ThemeColor.surface,
      0.72,
    );
    this.pauseButton.setDepth(ThemeDepth.hud);
    this.pauseButton.setScrollFactor(0);
    this.pauseButton.setStrokeStyle(physicalToLogical(2, viewport), ThemeColor.cream, 0.8);
    this.pauseButton.setInteractive();
    this.pauseButton.on('pointerdown', this.handlePausePointerDown, this);
    // Every interactive/control child owns scrollFactor=0; containers do not
    // propagate it in Phaser, and hit tests read the child value.
    this.root?.add([this.hintText, this.pauseButton]);
  }

  update(dtMs: number): void {
    if (this.disposed) {
      return;
    }

    const snapshot = this.input.getPresentationSnapshot();
    this.updateStick(snapshot);
    this.updateHint(snapshot.mode, dtMs);
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleChange, this);
    this.destroyViewportControls();
    this.stickBase.destroy();
    this.stickThumb.destroy();
  }

  private destroyViewportControls(): void {
    this.scene.tweens.killTweensOf(this.hintText);
    this.pauseButton.off('pointerdown', this.handlePausePointerDown, this);
    this.hintText.destroy();
    this.pauseButton.destroy();
  }

  private readonly handleScaleChange = (): void => {
    if (this.disposed) {
      return;
    }
    const scale = this.scene.scale;
    const next: UiViewport = this.viewport.originX === undefined ? {
      canvasWidth: positiveFinite(scale.width, this.viewport.canvasWidth),
      canvasHeight: positiveFinite(scale.height, this.viewport.canvasHeight),
      displayWidth: positiveFinite(scale.displaySize.width, this.viewport.displayWidth),
      displayHeight: positiveFinite(scale.displaySize.height, this.viewport.displayHeight),
      containerWidth: positiveFinite(
        scale.parentSize.width,
        this.viewport.containerWidth ?? this.viewport.displayWidth,
      ),
      containerHeight: positiveFinite(
        scale.parentSize.height,
        this.viewport.containerHeight ?? this.viewport.displayHeight,
      ),
    } : zoomedGameUiViewport(
      scale.displaySize.width, scale.displaySize.height, scale.parentSize.width, scale.parentSize.height,
    );
    if (sameViewport(this.viewport, next)) {
      return;
    }
    this.destroyViewportControls();
    this.viewport = next;
    this.buildViewportControls();
  };

  private updateStick(snapshot: InputPresentationSnapshot): void {
    const active = snapshot.pointerStart !== null && snapshot.pointerCurrent !== null;
    this.stickBase.setVisible(active);
    this.stickThumb.setVisible(active);

    if (!active) {
      return;
    }

    const start = snapshot.pointerStart;
    const current = snapshot.pointerCurrent;
    const delta = { x: current.x - start.x, y: current.y - start.y };
    const clamped = clampLength(delta, this.stickRadius);

    // Root children live in world space, where the gameplay camera zoom maps
    // local coords 1.25× onto the canvas (M-07: local = pointer/1.25 for
    // scrollFactor-0 children). The pointer start AND the clamped delta are
    // both canvas-space, so both divide — the rendered stick center tracks
    // the finger and the thumb tracks it clamped to the visible radius. The
    // unzoomed (menu/plain) root has no origin and scale 1, so its divisor
    // is 1.
    const zoom = this.viewport.originX === undefined ? 1 : GAMEPLAY_ZOOM;
    this.stickBase.setPosition(start.x / zoom, start.y / zoom);
    this.stickThumb.setPosition(
      start.x / zoom + clamped.x / zoom,
      start.y / zoom + clamped.y / zoom,
    );
  }

  private updateHint(mode: InputMode, dtMs: number): void {
    if (this.lastMode !== mode) {
      this.lastMode = mode;
      this.hintText.setText(hintForMode(mode));
      this.hintElapsedMs = 0;
      this.hintFaded = false;
      this.hintText.setAlpha(1);
    }

    if (this.hintFaded) {
      return;
    }

    if (Number.isFinite(dtMs) && dtMs > 0) {
      this.hintElapsedMs += dtMs;
    }

    if (this.hintElapsedMs >= HINT_DURATION_MS) {
      this.hintFaded = true;
      // The setting is re-read at fade time so a toggled preference is
      // honoured without restarting the run.
      const fadeMs = reducedMotionDuration(HINT_FADE_MS, this.readReducedMotion());
      if (fadeMs <= 0) {
        this.hintText.setAlpha(0);
        return;
      }

      this.scene.tweens.add({
        targets: this.hintText,
        alpha: 0,
        duration: fadeMs,
      });
    }
  }

  private handlePausePointerDown(): void {
    this.onPauseRequested();
  }
}

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hintForMode(mode: InputMode): string {
  switch (mode) {
    case 'keyboard':
      return 'WASD / arrows • P / Esc';
    case 'gamepad':
      // Epic 19 D5: positions only — never vendor labels.
      return 'Left stick • Bottom face / Menu';
    case 'pointer':
    default:
      return 'Drag to move • Tap pause';
  }
}

function sameViewport(a: UiViewport, b: UiViewport): boolean {
  return a.canvasWidth === b.canvasWidth
    && a.canvasHeight === b.canvasHeight
    && a.displayWidth === b.displayWidth
    && a.displayHeight === b.displayHeight
    && a.containerWidth === b.containerWidth
    && a.containerHeight === b.containerHeight;
}
