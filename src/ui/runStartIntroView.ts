import type Phaser from 'phaser';
import type { RunStartIntroModel } from '../presentation/runStartIntro';
import type { InputMode } from '../systems/input';
import type { VisualArtLookup } from '../systems/visualArt';
import { FocusNavigator, type FocusDirection } from './focusList';
import { physicalToLogical, responsiveGameUiViewport } from './layout';
import { ThemeColor, ThemeDepth, ThemeFont } from './theme';
import { createUiText } from './text';
import type { IntroCommand, IntroSnapshot } from './runStartIntroController';

interface Options {
  scene: Phaser.Scene;
  model: RunStartIntroModel;
  art: VisualArtLookup;
  onCommand(command: IntroCommand, revision: number): void;
  onError(error: unknown): void;
  canInteract(): boolean;
  readInputMode(): InputMode;
}

/** One static modal. Scrolling and focus are presentation only; no timer,
 * entity, loader or device adapter is owned here. All dimensions below are
 * physical pixels inside the existing camera-compensated UI root. */
export class RunStartIntroView {
  private root?: Phaser.GameObjects.Container;
  private content?: Phaser.GameObjects.Container;
  private mask?: Phaser.Display.Masks.GeometryMask;
  private maskGraphics?: Phaser.GameObjects.Graphics;
  private state?: IntroSnapshot;
  private readonly focus = new FocusNavigator();
  private buttons: { command: IntroCommand; label: string; rect: Phaser.GameObjects.Rectangle }[] = [];
  private hint?: Phaser.GameObjects.Text;
  private generation = 0;
  private gestureGeneration = 0;
  private disposed = false;
  private scrollOffset = 0;
  private maxScroll = 0;
  private contentTop = 0;
  private contentBounds = { x: 0, y: 0, width: 0, height: 0 };
  private drag?: { id: number; y: number };

  constructor(private readonly options: Options) {
    const { scene } = options;
    scene.scale.on('resize', this.reflow);
    scene.input.on('wheel', this.handleWheel);
    scene.input.on('pointerdown', this.handlePointerDown);
    scene.input.on('pointermove', this.handlePointerMove);
    scene.input.on('pointerup', this.handlePointerUp);
    scene.input.on('pointerupoutside', this.invalidateGestures);
    scene.game?.events?.on('blur', this.invalidateGestures);
  }

  render(state: IntroSnapshot): void {
    if (this.disposed) return;
    const previous = this.focusedCommand();
    const samePhase = this.state?.phase === state.phase;
    const offset = samePhase ? this.scrollOffset : 0;
    this.state = state;
    this.generation += 1;
    this.invalidateGestures();
    this.clearDisplay();
    if (state.phase !== 'brief' && state.phase !== 'boss') return;
    try {
      this.draw(state, offset);
      this.focus.setCount(this.buttons.length);
      this.focus.setIndex(samePhase && previous ? Math.max(0, this.buttons.findIndex(button => button.command === previous)) : 0);
      this.paintFocus();
      this.refreshInputPresentation();
    } catch (error) {
      this.clearDisplay();
      throw error;
    }
  }

  private draw(state: IntroSnapshot, offset: number): void {
    const { scene, model } = this.options;
    const viewport = responsiveGameUiViewport(scene.scale.width, scene.scale.height);
    const scale = physicalToLogical(1, viewport);
    const root = scene.add.container(viewport.originX ?? 0, viewport.originY ?? 0);
    // Own the first allocation before any subsequent factory can throw.
    this.root = root;
    root.setScrollFactor(0).setScale(scale).setDepth(ThemeDepth.upgradeChooser + 10);
    const width = viewport.displayWidth;
    const height = viewport.displayHeight;
    root.add(scene.add.rectangle(width / 2, height / 2, width, height, ThemeColor.background, .96).setInteractive().setScrollFactor(0));
    const left = 16 + viewport.layoutInsets.left / scale;
    const right = 16 + viewport.layoutInsets.right / scale;
    const top = 16 + viewport.layoutInsets.top / scale;
    const bottom = 16 + viewport.layoutInsets.bottom / scale;
    const wide = width > 650 && height < 500;
    const panelWidth = Math.min(wide ? 720 : width < 600 ? 420 : 560, width - left - right);
    const panelHeight = Math.min(720, height - top - bottom);
    const x = left + (width - left - right - panelWidth) / 2;
    const y = top + (height - top - bottom - panelHeight) / 2;
    const padding = 12;
    const contentWidth = wide ? (panelWidth - padding * 3) / 2 : panelWidth - padding * 2;
    const commands: { command: IntroCommand; label: string }[] = state.phase === 'brief' && model.boss
      ? [{ command: 'continue', label: 'Continue' }, { command: 'skip-dialogue', label: 'Start · Skip dialogue' }, { command: 'return-menu', label: 'Return to Contracts' }]
      : [{ command: 'start', label: 'Start' }, { command: 'return-menu', label: 'Return to Contracts' }];
    // Footer is sized independently of copy. Content scrolls within the
    // remaining space; a long explanation can never push Start off-screen.
    const footerHeight = commands.length * 56 + 64;
    const bodyHeight = wide ? panelHeight - padding * 2 : panelHeight - footerHeight - padding * 2;
    this.contentTop = y + padding;
    this.contentBounds = { x: x + padding, y: this.contentTop, width: contentWidth, height: Math.max(1, bodyHeight) };
    const content = scene.add.container(x + padding, this.contentTop).setScrollFactor(0);
    this.content = content;
    root.add(content);
    let cursor = 0;
    const text = (copy: string, size: number, color = '#f7f1d5', maxWidth = contentWidth): void => {
      const item = createUiText(scene, 0, cursor, copy, { fontFamily: ThemeFont.family, fontSize: `${size}px`, color, wordWrap: { width: maxWidth, useAdvancedWrap: true }, lineSpacing: 3 }).setScrollFactor(0);
      content.add(item);
      cursor += item.height + 12;
    };
    const image = (id: string, px: number, ix: number, iy: number): void => {
      const binding = this.options.art.bindingById(id);
      if (!binding || !scene.textures.exists(binding.textureKey)) throw new Error(`Intro texture missing: ${id}`);
      const frame = binding.frameKey ?? (binding.load.type === 'spritesheet' ? binding.clips?.idle?.start ?? 0 : undefined);
      const actor = scene.add.image(ix, iy, binding.textureKey, frame);
      content.add(actor);
      const size = binding.load.type === 'spritesheet' ? binding.load.frame : binding.display;
      const imageScale = px / Math.max(size.width, size.height);
      actor.setDisplaySize(size.width * imageScale, size.height * imageScale).setScrollFactor(0);
    };
    text(model.contractName.toUpperCase(), 16, '#fbbf24');
    const boss = state.phase === 'boss' ? model.boss : undefined;
    image(boss?.actorArtId ?? model.mercenary.portraitArtId, 64, 32, cursor + 32);
    const name = createUiText(scene, 80, cursor + 8, boss?.name ?? model.mercenary.characterName,
      { fontFamily: ThemeFont.family, fontSize: '22px', color: '#f7f1d5', wordWrap: { width: contentWidth - 80, useAdvancedWrap: true } }).setScrollFactor(0);
    content.add(name);
    cursor += Math.max(72, name.height + 16);
    if (boss) text(boss.lines.join('\n\n'), 18);
    else if (model.ability) {
      image(model.ability.iconArtId, 48, contentWidth - 24, cursor + 24);
      const iconBottom = cursor + 60;
      text(model.ability.name.toUpperCase(), 22, '#a5f3fc', contentWidth - 60);
      cursor = Math.max(cursor, iconBottom);
      text(model.ability.effect.detail, 16);
      text(model.ability.effect.cooldownLabel, 14, '#a5f3fc');
      text('Ability in run: Q / left face / tap card', 14, '#a5f3fc');
      text('Choose: Enter/Space / bottom face / tap a choice', 14, '#a5f3fc');
    }
    text(model.objective.kind === 'stage' ? model.objective.presentation.copy : model.objective.copy, 16, '#fbbf24');
    this.maxScroll = Math.max(0, cursor - 12 - this.contentBounds.height);
    this.scrollOffset = Math.min(this.maxScroll, offset);
    content.y = this.contentTop - this.scrollOffset;
    const graphics = scene.make.graphics({ x: 0, y: 0 });
    this.maskGraphics = graphics;
    graphics.setScrollFactor(0).fillStyle(0xffffff).fillRect(
      (viewport.originX ?? 0) + this.contentBounds.x * scale,
      (viewport.originY ?? 0) + this.contentBounds.y * scale,
      contentWidth * scale, this.contentBounds.height * scale,
    );
    this.mask = graphics.createGeometryMask();
    content.setMask(this.mask);
    const actionX = wide ? x + padding * 2 + contentWidth : x + padding;
    let actionY = wide ? y + padding : y + panelHeight - footerHeight;
    const generation = this.generation;
    for (const { command, label } of commands) {
      const rect = scene.add.rectangle(actionX + contentWidth / 2, actionY + 24, contentWidth, 48,
        command === 'return-menu' ? ThemeColor.card : ThemeColor.primary, 1);
      root.add(rect);
      rect.setInteractive({ useHandCursor: true }).setScrollFactor(0);
      const labelText = createUiText(scene, actionX + contentWidth / 2, actionY + 24, label,
        { fontFamily: ThemeFont.family, fontSize: '16px', fontStyle: '700', color: command === 'return-menu' ? '#f7f1d5' : '#081118' });
      root.add(labelText);
      labelText.setOrigin(.5).setScrollFactor(0);
      let admitted: { id: number; gesture: number } | undefined;
      rect.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        admitted = undefined;
        if (!this.disposed && generation === this.generation && this.options.canInteract())
          admitted = { id: pointer.id, gesture: this.gestureGeneration };
      });
      rect.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const gesture = admitted;
        admitted = undefined;
        if (pointer.wasCanceled || (scene.game?.canvas && pointer.upElement && pointer.upElement !== scene.game.canvas)) return;
        if (gesture?.id === pointer.id && gesture.gesture === this.gestureGeneration
          && !this.disposed && generation === this.generation && this.options.canInteract())
          this.options.onCommand(command, state.revision);
      });
      rect.on('pointerout', () => { admitted = undefined; });
      this.buttons.push({ command, label, rect });
      actionY += 56;
    }
    this.hint = createUiText(scene, actionX, actionY + 4, '', { fontFamily: ThemeFont.family, fontSize: '14px', color: '#a5f3fc', wordWrap: { width: contentWidth }, lineSpacing: 2 });
    root.add(this.hint);
    this.hint.setScrollFactor(0);
  }

  focusedCommand(): IntroCommand | undefined { return this.buttons[this.focus.index]?.command; }
  restoreFocus(command: IntroCommand): void {
    const index = this.buttons.findIndex(button => button.command === command);
    if (index >= 0) this.focus.setIndex(index);
    this.paintFocus();
  }
  moveFocus(direction: FocusDirection): void {
    if (!this.options.canInteract()) return;
    // Overflow keeps the same action focused. Left/right always choose
    // actions; up/down read the body without consuming controller authority.
    if (this.maxScroll > 0 && (direction === 'up' || direction === 'down')) {
      this.scrollBy(direction === 'up' ? -80 : 80);
    } else { this.focus.move(direction); this.paintFocus(); }
  }
  confirmFocused(): void {
    const button = this.buttons[this.focus.index];
    if (!this.disposed && button && this.state && this.options.canInteract()) this.options.onCommand(button.command, this.state.revision);
  }
  refreshInputPresentation(): void {
    const mode = this.options.readInputMode();
    this.hint?.setText(mode === 'gamepad'
      ? this.maxScroll > 0 ? '↑↓ Read · ←→ Choices · A Confirm · B Back' : 'D-pad · A Confirm · B Back'
      : mode === 'keyboard' ? this.maxScroll > 0 ? '↑↓ Read · ←→ Choices · Enter Confirm · Esc Back' : 'Arrows · Enter Confirm · Esc Back'
        : this.maxScroll > 0 ? 'Scroll to read · Tap a choice' : 'Tap a choice to continue');
  }
  readonly reflow = (): void => {
    if (!this.state || this.disposed) return;
    try { this.render(this.state); } catch (error) { this.options.onError(error); }
  };
  readonly invalidateGestures = (): void => { this.gestureGeneration += 1; this.drag = undefined; };
  private scrollBy(delta: number): void {
    this.invalidateGestures();
    this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset + delta));
    if (this.content) this.content.y = this.contentTop - this.scrollOffset;
  }
  private insideBody(pointer: Phaser.Input.Pointer): boolean {
    const bounds = this.contentBounds;
    return pointer.x >= bounds.x && pointer.x < bounds.x + bounds.width && pointer.y >= bounds.y && pointer.y < bounds.y + bounds.height;
  }
  private readonly handleWheel = (pointer: Phaser.Input.Pointer, _objects: readonly Phaser.GameObjects.GameObject[], _dx: number, dy: number): void => {
    if (!this.disposed && this.options.canInteract() && this.insideBody(pointer)) this.scrollBy(dy);
  };
  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.disposed && this.options.canInteract() && this.insideBody(pointer)) this.drag = { id: pointer.id, y: pointer.y };
  };
  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    const drag = this.drag;
    if (!drag || drag.id !== pointer.id || !pointer.isDown || !this.options.canInteract()) return;
    this.scrollBy(drag.y - pointer.y);
    this.drag = { id: pointer.id, y: pointer.y };
  };
  private readonly handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (this.drag?.id === pointer.id) this.drag = undefined;
  };
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.invalidateGestures();
    const { scene } = this.options;
    scene.scale.off('resize', this.reflow);
    scene.input.off('wheel', this.handleWheel);
    scene.input.off('pointerdown', this.handlePointerDown);
    scene.input.off('pointermove', this.handlePointerMove);
    scene.input.off('pointerup', this.handlePointerUp);
    scene.input.off('pointerupoutside', this.invalidateGestures);
    scene.game?.events?.off('blur', this.invalidateGestures);
    this.clearDisplay();
  }
  private clearDisplay(): void {
    this.content?.clearMask(false);
    this.mask?.destroy(); this.mask = undefined;
    this.maskGraphics?.destroy(); this.maskGraphics = undefined;
    this.root?.destroy(true); this.root = undefined;
    this.content = undefined; this.buttons = []; this.hint = undefined;
  }
  private paintFocus(): void { this.buttons.forEach((button, index) => button.rect.setStrokeStyle(index === this.focus.index ? 3 : 0, ThemeColor.cream)); }
}
