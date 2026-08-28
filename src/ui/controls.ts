import Phaser from 'phaser';
import { clampLength } from '../engine/vector';
import { assertTouchStickConfig, RuntimeConfig, type TouchStickConfig } from '../engine/config';
import type { InputController, InputMode, InputPresentationSnapshot } from '../systems/input';
import { edgeMargin, logicalCanvasViewport, pointerToRootLocal, physicalToLogical, GAMEPLAY_ZOOM, zoomedGameUiViewport, type UiViewport } from './layout';
import { reducedMotionDuration, ThemeColor, ThemeDepth, ThemeFont } from './theme';
import { createUiText } from './text';


const HINT_DURATION_MS = 2200;
const HINT_FADE_MS = 400;


export interface ControlsViewOptions {
  readonly scene: Phaser.Scene;
  readonly input: InputController;
  readonly viewport: UiViewport;
  readonly readReducedMotion: () => boolean;
  readonly onPauseRequested: () => void;
  readonly onAbilityRequested?: () => void;
  readonly touchStick?: TouchStickConfig;
}

export class ControlsView {
  private readonly scene: Phaser.Scene;
  private readonly input: InputController;
  private viewport: UiViewport;
  private readonly onPauseRequested: () => void;
  private readonly onAbilityRequested?: () => void;
  private readonly readReducedMotion: () => boolean;
  private readonly stickRadius: number;
  private readonly root?: Phaser.GameObjects.Container;
  private readonly stickBase: Phaser.GameObjects.Arc;
  private readonly stickThumb: Phaser.GameObjects.Arc;
  private hintText!: Phaser.GameObjects.Text;
  private pauseButton!: Phaser.GameObjects.Rectangle;
  private abilityButton!: Phaser.GameObjects.Rectangle;
  private abilityGlyph!: Phaser.GameObjects.Text;
  private pauseGlyphBars: Phaser.GameObjects.Rectangle[] = [];
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
    this.onAbilityRequested = options.onAbilityRequested;
    this.readReducedMotion = readReducedMotion;
    this.stickRadius = touchStick.radius;
    const add = scene.add as typeof scene.add & { container?: (x: number, y: number) => Phaser.GameObjects.Container };
    this.root = add.container?.(viewport.originX ?? 0, viewport.originY ?? 0);
    this.root?.setScrollFactor(0).setDepth(ThemeDepth.hud);

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
    const topMargin = edgeMargin(viewport, 'top');
    const rightMargin = edgeMargin(viewport, 'right');
    const bottomMargin = edgeMargin(viewport, 'bottom');
    const fontSize = physicalToLogical(ThemeFont.bodyMin, viewport);
    const pauseSize = physicalToLogical(44, viewport);

    this.hintText = createUiText(scene,
      viewport.canvasWidth / 2,
      viewport.canvasHeight
        - bottomMargin
        - physicalToLogical(this.stickRadius * 2, viewport)
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
      viewport.canvasWidth - rightMargin - pauseSize / 2,
      topMargin + pauseSize / 2,
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
    this.abilityButton = scene.add.rectangle(
      this.pauseButton.x - pauseSize - physicalToLogical(10, viewport), this.pauseButton.y,
      pauseSize, pauseSize, ThemeColor.primary, 0.72,
    );
    this.abilityButton.setDepth(ThemeDepth.hud);
    this.abilityButton.setScrollFactor(0);
    this.abilityButton.setStrokeStyle(physicalToLogical(2, viewport), ThemeColor.cream, 0.8);
    this.abilityButton.setInteractive();
    this.abilityButton.on('pointerdown', this.handleAbilityPointerDown, this);
    this.abilityGlyph = createUiText(scene, this.abilityButton.x, this.abilityButton.y, 'A', {
      color: '#f7f1d5', fontFamily: ThemeFont.family, fontSize: `${physicalToLogical(18, viewport)}px`, fontStyle: '700',
    });
    this.abilityGlyph.setOrigin(0.5).setDepth(ThemeDepth.hud).setScrollFactor(0);
    const glyphWidth = physicalToLogical(8, viewport);
    const glyphHeight = physicalToLogical(22, viewport);
    const glyphOffset = physicalToLogical(8, viewport);
    this.pauseGlyphBars = [-1, 1].map((direction) => {
      const bar = scene.add.rectangle(
        this.pauseButton.x + direction * glyphOffset,
        this.pauseButton.y,
        glyphWidth,
        glyphHeight,
        ThemeColor.cream,
        0.9,
      );
      bar.setDepth(ThemeDepth.hud);
      bar.setScrollFactor(0);
      return bar;
    });
    // Every interactive/control child owns scrollFactor=0; containers do not
    // propagate it in Phaser, and hit tests read the child value.
    this.root?.add([this.hintText, this.pauseButton, this.abilityButton, this.abilityGlyph, ...this.pauseGlyphBars]);
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
    this.root?.destroy(true);
  }

  private destroyViewportControls(): void {
    this.scene.tweens.killTweensOf(this.hintText);
    this.pauseButton.off('pointerdown', this.handlePausePointerDown, this);
    this.abilityButton.off('pointerdown', this.handleAbilityPointerDown, this);
    this.hintText.destroy();
    this.pauseButton.destroy();
    this.abilityButton.destroy();
    this.abilityGlyph.destroy();
    this.pauseGlyphBars.forEach((bar) => bar.destroy());
    this.pauseGlyphBars = [];
  }

  private readonly handleScaleChange = (): void => {
    if (this.disposed) {
      return;
    }
    const scale = this.scene.scale;
    const next: UiViewport = this.viewport.originX === undefined
      ? logicalCanvasViewport(scale.displaySize.width, scale.displaySize.height, scale.parentSize.width, scale.parentSize.height)
      : zoomedGameUiViewport(scale.displaySize.width, scale.displaySize.height, scale.parentSize.width, scale.parentSize.height);
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
    // is 1. The start is mapped through the PRODUCTION pointerToRootLocal
    // transform (U7) so the playtest regressions drive the same math.
    const zoom = this.viewport.originX === undefined ? 1 : GAMEPLAY_ZOOM;
    const local = pointerToRootLocal(start, this.viewport);
    this.stickBase.setPosition(local.x, local.y);
    this.stickThumb.setPosition(
      local.x + clamped.x / zoom,
      local.y + clamped.y / zoom,
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

  private handleAbilityPointerDown(): void {
    this.onAbilityRequested?.();
  }
}

function hintForMode(mode: InputMode): string {
  switch (mode) {
    case 'keyboard':
      return 'WASD / arrows • Q ability • P / Esc';
    case 'gamepad':
      // Epic 19 D5: positions only — never vendor labels.
      return 'Left stick • Left face ability • Bottom face / Menu';
    case 'pointer':
    default:
      return 'Drag to move • Tap A ability • Tap pause';
  }
}

function sameViewport(a: UiViewport, b: UiViewport): boolean {
  return a.canvasWidth === b.canvasWidth
    && a.canvasHeight === b.canvasHeight
    && a.displayWidth === b.displayWidth
    && a.displayHeight === b.displayHeight
    && a.containerWidth === b.containerWidth
    && a.containerHeight === b.containerHeight
    && a.layoutInsets.top === b.layoutInsets.top
    && a.layoutInsets.right === b.layoutInsets.right
    && a.layoutInsets.bottom === b.layoutInsets.bottom
    && a.layoutInsets.left === b.layoutInsets.left;
}
