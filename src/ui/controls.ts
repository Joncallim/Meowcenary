import Phaser from 'phaser';
import { clampLength } from '../engine/vector';
import type { InputController, InputMode, InputPresentationSnapshot } from '../systems/input';
import { physicalToLogical, type UiViewport } from './layout';
import { reducedMotionDuration, ThemeColor, ThemeDepth, ThemeFont } from './theme';

const STICK_RADIUS = 64;
const HINT_DURATION_MS = 2200;
const HINT_FADE_MS = 400;
const HUD_RACK_CLEARANCE_PX = 52;

export interface ControlsViewOptions {
  readonly scene: Phaser.Scene;
  readonly input: InputController;
  readonly viewport: UiViewport;
  readonly readReducedMotion: () => boolean;
  readonly onPauseRequested: () => void;
}

export class ControlsView {
  private readonly scene: Phaser.Scene;
  private readonly input: InputController;
  private readonly onPauseRequested: () => void;
  private readonly readReducedMotion: () => boolean;
  private readonly stickBase: Phaser.GameObjects.Arc;
  private readonly stickThumb: Phaser.GameObjects.Arc;
  private readonly hintText: Phaser.GameObjects.Text;
  private readonly pauseButton: Phaser.GameObjects.Rectangle;
  private hintElapsedMs = 0;
  private hintFaded = false;
  private lastMode: InputMode = 'pointer';
  private disposed = false;

  constructor(options: ControlsViewOptions) {
    const { scene, input, viewport, readReducedMotion, onPauseRequested } = options;
    this.scene = scene;
    this.input = input;
    this.onPauseRequested = onPauseRequested;
    this.readReducedMotion = readReducedMotion;

    const margin = physicalToLogical(12, viewport);
    const fontSize = physicalToLogical(ThemeFont.bodyMin, viewport);
    const pauseSize = physicalToLogical(44, viewport);

    this.stickBase = scene.add.arc(0, 0, STICK_RADIUS, 0, 360, false, ThemeColor.cream, 0.18);
    this.stickBase.setDepth(ThemeDepth.transientHint);
    this.stickBase.setScrollFactor(0);
    this.stickBase.setVisible(false);

    this.stickThumb = scene.add.arc(0, 0, STICK_RADIUS * 0.45, 0, 360, false, ThemeColor.cream, 0.55);
    this.stickThumb.setDepth(ThemeDepth.transientHint);
    this.stickThumb.setScrollFactor(0);
    this.stickThumb.setVisible(false);

    this.hintText = scene.add.text(
      viewport.canvasWidth / 2,
      viewport.canvasHeight
        - margin
        - physicalToLogical(HUD_RACK_CLEARANCE_PX, viewport)
        - fontSize * 2,
      'Drag to move • Tap pause',
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
    this.pauseButton.off('pointerdown', this.handlePausePointerDown, this);
    this.stickBase.destroy();
    this.stickThumb.destroy();
    this.hintText.destroy();
    this.pauseButton.destroy();
  }

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
    const clamped = clampLength(delta, STICK_RADIUS);

    this.stickBase.setPosition(start.x, start.y);
    this.stickThumb.setPosition(start.x + clamped.x, start.y + clamped.y);
  }

  private updateHint(mode: InputMode, dtMs: number): void {
    if (this.lastMode !== mode) {
      this.lastMode = mode;
      this.hintText.setText(
        mode === 'pointer' ? 'Drag to move • Tap pause' : 'WASD / arrows • P / Esc',
      );
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
