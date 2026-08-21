import Phaser from 'phaser';
import { minimumHitTarget, physicalToLogical, type UiViewport } from './layout';
import { FocusStroke, ThemeColor, ThemeFont } from './theme';

export type ModalTextKind = 'heading' | 'body' | 'notice';

export interface ModalButtonHandle {
  readonly target: Phaser.GameObjects.Rectangle;
  readonly enabled: boolean;
  activate(): boolean;
  setFocusVisible(visible: boolean): void;
}

export interface ModalTextHelpers {
  addText(
    x: number,
    y: number,
    text: string,
    kind: ModalTextKind,
  ): Phaser.GameObjects.Text;
  addButton(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    label: string,
    onActivate: () => void,
    emphasized?: boolean,
    enabled?: boolean,
  ): ModalButtonHandle;
  addHint(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    text: string,
  ): Phaser.GameObjects.Text;
}

/** Shared text and button construction for the full-screen modal surfaces
 *  (pause and run summary), so both views cannot drift apart. Every object
 *  is scroll-factor 0 because modals live in screen space. */
export function createModalTextHelpers(
  scene: Phaser.Scene,
  viewport: UiViewport,
): ModalTextHelpers {
  const addText = (
    x: number,
    y: number,
    text: string,
    kind: ModalTextKind,
  ): Phaser.GameObjects.Text => {
    // Record keyed on the full ModalTextKind union: adding a new kind fails
    // to compile until a style is provided, so no kind can silently fall
    // through to another kind's style.
    const style: Record<
      ModalTextKind,
      Phaser.Types.GameObjects.Text.TextStyle
    > = {
      heading: {
        color: '#f7f1d5',
        fontFamily: ThemeFont.family,
        fontSize: `${physicalToLogical(ThemeFont.headingMin, viewport)}px`,
        fontStyle: '700',
      },
      notice: {
        color: '#f87171',
        fontFamily: ThemeFont.family,
        fontSize: `${physicalToLogical(ThemeFont.bodyMin, viewport)}px`,
      },
      body: {
        color: '#d6f7ff',
        fontFamily: ThemeFont.family,
        fontSize: `${physicalToLogical(ThemeFont.labelMin, viewport)}px`,
      },
    };
    const textObject = scene.add.text(x, y, text, style[kind]);
    textObject.setScrollFactor(0);
    return textObject;
  };

  const addButton = (
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    label: string,
    onActivate: () => void,
    emphasized = false,
    enabled = true,
  ): ModalButtonHandle => {
    const hitTarget = minimumHitTarget(viewport);
    const rect = scene.add.rectangle(
      x,
      y,
      width,
      hitTarget,
      enabled
        ? emphasized
          ? ThemeColor.cardHover
          : ThemeColor.card
        : ThemeColor.surface,
    );
    root.add(rect);
    const baseStroke = {
      width: physicalToLogical(2, viewport),
      color: enabled
        ? emphasized
          ? ThemeColor.primary
          : ThemeColor.muted
        : ThemeColor.card,
      alpha: enabled ? 0.9 : 0.55,
    } as const;
    rect.setStrokeStyle(baseStroke.width, baseStroke.color, baseStroke.alpha);
    rect.setScrollFactor(0);
    let activated = false;
    const handle: ModalButtonHandle = {
      target: rect,
      enabled,
      activate: () => {
        if (!enabled || activated) return false;
        activated = true;
        onActivate();
        return true;
      },
      setFocusVisible: (visible) => {
        rect.setStrokeStyle(
          visible ? FocusStroke.width : baseStroke.width,
          visible ? FocusStroke.color : baseStroke.color,
          visible ? FocusStroke.alpha : baseStroke.alpha,
        );
      },
    };
    // Every modal rectangle stays interactive so disabled buttons (e.g. a
    // Merge without a preview) still receive pointer-over/out hover focus in
    // production — installed Phaser only emits pointer events on interactive
    // objects. Command suppression lives in activate()'s enabled guard. The
    // pointer-up listener itself is owned by the surface's single funnel
    // (index sync first, then activation), so the public handle API is
    // unchanged (round-2 finding F2).
    rect.setInteractive();

    const text = scene.add.text(x, y, label, {
      color: enabled ? '#f7f1d5' : '#78909c',
      fontFamily: ThemeFont.family,
      fontSize: `${physicalToLogical(ThemeFont.labelMin, viewport)}px`,
    });
    root.add(text);
    text.setOrigin(0.5);
    text.setScrollFactor(0);
    return handle;
  };

  const addHint = (
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    text: string,
  ): Phaser.GameObjects.Text => {
    const hint = addText(x, y, text, 'body');
    root.add(hint);
    hint.setOrigin(0, 1);
    return hint;
  };

  return { addText, addButton, addHint };
}
