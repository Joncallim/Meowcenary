import Phaser from 'phaser';
import { minimumHitTarget, physicalToLogical, type UiViewport } from './layout';
import { ThemeColor, ThemeFont } from './theme';

export type ModalTextKind = 'heading' | 'body' | 'notice';

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
  ): void;
  addHint(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    text: string,
  ): void;
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

  // Returns void rather than the button object: modal buttons use a fixed
  // hitTarget height (unlike MenuScene.addButton, whose caller tracks
  // text.height for vertical layout), so no height feedback is needed here.
  const addButton = (
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    label: string,
    onActivate: () => void,
    emphasized = false,
    enabled = true,
  ): void => {
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
    rect.setStrokeStyle(
      physicalToLogical(2, viewport),
      enabled
        ? emphasized
          ? ThemeColor.primary
          : ThemeColor.muted
        : ThemeColor.card,
      enabled ? 0.9 : 0.55,
    );
    rect.setScrollFactor(0);
    if (enabled) {
      rect.setInteractive();
      rect.on(Phaser.Input.Events.POINTER_UP, onActivate);
    }

    const text = scene.add.text(x, y, label, {
      color: enabled ? '#f7f1d5' : '#78909c',
      fontFamily: ThemeFont.family,
      fontSize: `${physicalToLogical(ThemeFont.labelMin, viewport)}px`,
    });
    root.add(text);
    text.setOrigin(0.5);
    text.setScrollFactor(0);
  };

  const addHint = (
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    text: string,
  ): void => {
    const hint = addText(x, y, text, 'body');
    root.add(hint);
    hint.setOrigin(0, 1);
  };

  return { addText, addButton, addHint };
}
