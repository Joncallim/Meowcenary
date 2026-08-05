import Phaser from 'phaser';
import { GAME_CONTEXT_REGISTRY_KEY, type GameContext } from '../engine/context';

import { SceneKey } from '../engine/sceneKeys';
import { logicalCanvasViewport, minimumHitTarget } from '../ui/layout';
import { MainMenuController, type MainMenuSnapshot, type MenuPanel } from '../ui/menus';
import { ThemeColor, ThemeDepth, ThemeFont } from '../ui/theme';

const MENU_DEPTH = ThemeDepth.pauseSummary;

export class MenuScene extends Phaser.Scene {
  private controller?: MainMenuController;
  private root?: Phaser.GameObjects.Container;
  private focusables: Phaser.GameObjects.Text[] = [];
  private focusIndex = -1;

  constructor() {
    super(SceneKey.Menu);
  }

  create(): void {
    const ctx = this.getContext();
    this.controller = new MainMenuController(ctx);

    this.add
      .rectangle(
        this.scale.width / 2,
        this.scale.height / 2,
        this.scale.width,
        this.scale.height,
        ThemeColor.background,
      )
      .setScrollFactor(0);

    this.input.keyboard?.on('keydown-ESC', this.handleBack, this);
    this.input.keyboard?.on('keydown-UP', this.handleFocusMove, this);
    this.input.keyboard?.on('keydown-DOWN', this.handleFocusMove, this);
    this.input.keyboard?.on('keydown-ENTER', this.handleActivate, this);
    this.input.keyboard?.on('keydown-SPACE', this.handleActivate, this);

    this.render(this.controller.snapshot());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
  }

  private render(snapshot: MainMenuSnapshot): void {
    this.root?.destroy(true);
    this.focusables = [];
    this.focusIndex = -1;

    const root = this.add.container(0, 0);
    root.setDepth(MENU_DEPTH).setScrollFactor(0);
    this.root = root;

    const margin = 16;
    const width = this.scale.width;
    const hitTarget = minimumHitTarget(logicalCanvasViewport());

    const title = this.add.text(width / 2, 28, 'Meowcenary', {
      align: 'center',
      color: '#f7f1d5',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.headingMin}px`,
      fontStyle: '700',
    });
    title.setOrigin(0.5).setScrollFactor(0);
    root.add(title);

    if (snapshot.notice) {
      const notice = this.add.text(width / 2, 58, snapshot.notice, {
        align: 'center',
        color: '#f87171',
        fontFamily: ThemeFont.family,
        fontSize: `${ThemeFont.bodyMin}px`,
        wordWrap: { width: width - margin * 2 },
      });
      notice.setOrigin(0.5, 0).setScrollFactor(0);
      root.add(notice);
    }

    const contentTop = snapshot.notice ? 86 : 64;

    switch (snapshot.panel) {
      case 'home':
        this.renderHome(root, snapshot, width, contentTop, margin, hitTarget);
        break;
      case 'character':
        this.renderCharacter(root, snapshot, width, contentTop, margin, hitTarget);
        break;
      case 'arena':
        this.renderArena(root, snapshot, width, contentTop, margin, hitTarget);
        break;
      case 'progression':
        this.renderProgression(root, snapshot, width, contentTop, margin, hitTarget);
        break;
      case 'settings':
        this.renderSettings(root, snapshot, width, contentTop, margin, hitTarget);
        break;
      case 'reset-confirmation':
        this.renderResetConfirmation(root, snapshot, width, contentTop, margin, hitTarget);
        break;
      default:
        break;
    }

    this.applyFocus();
  }

  private renderHome(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const selectedCharacter = snapshot.character.characters.find((c) => c.selected);
    const selectedArena = snapshot.arena.arenas.find((a) => a.selected);
    const infoLines = [
      `Character: ${selectedCharacter?.name ?? snapshot.character.selectedCharacterId}`,
      `Arena: ${selectedArena?.name ?? snapshot.arena.selectedArenaId}`,
      `Scrap: ${snapshot.progression.scrap}`,
    ];

    const info = this.add.text(margin, top, infoLines.join('\n'), {
      color: '#d6f7ff',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.labelMin}px`,
      lineSpacing: 4,
      wordWrap: { width: width - margin * 2 },
    });
    info.setScrollFactor(0);
    root.add(info);

    const buttons = ['Start', 'Character', 'Arena', 'Progression', 'Settings'] as const;
    let y = top + info.height + 24;
    buttons.forEach((label) => {
      const button = this.addButton(root, width / 2, y, label, hitTarget, () => {
        if (label === 'Start') {
          this.scene.start(SceneKey.Game);
          return;
        }
        const panel = label.toLowerCase() as MenuPanel;
        const next = this.requireController().open(panel as Exclude<MenuPanel, 'reset-confirmation'>);
        this.render(next);
      });
      y += button.height + 12;
    });

    const hints = this.add.text(margin, this.scale.height - margin - 14, '↑/↓ • Enter • Esc', {
      color: '#a5f3fc',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.bodyMin}px`,
    });
    hints.setScrollFactor(0);
    root.add(hints);
  }

  private renderCharacter(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const heading = this.addHeading(root, width / 2, top, 'Choose Character');
    let y = top + heading.height + 20;

    snapshot.character.characters.forEach((character) => {
      const label = `${character.selected ? '✓ ' : ''}${character.name}${character.locked ? ' 🔒' : ''}`;
      const button = this.addButton(root, margin, y, label, hitTarget, () => {
        const next = this.requireController().selectCharacter(character.id, snapshot.character.revision);
        this.render(next);
      });
      if (character.description) {
        const desc = this.add.text(margin + 12, y + button.height + 2, character.description, {
          color: '#a5f3fc',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin * 2 - 12 },
        });
        desc.setScrollFactor(0);
        root.add(desc);
        y += desc.height + 8;
      }
      y += button.height + 16;
    });

    this.addBackButton(root, width, margin, hitTarget);
  }

  private renderArena(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const heading = this.addHeading(root, width / 2, top, 'Choose Arena');
    let y = top + heading.height + 20;

    snapshot.arena.arenas.forEach((arena) => {
      const label = `${arena.selected ? '✓ ' : ''}${arena.name}${arena.locked ? ' 🔒' : ''}`;
      this.addButton(root, margin, y, label, hitTarget, () => {
        const next = this.requireController().selectArena(arena.id, snapshot.arena.revision);
        this.render(next);
      });
      y += hitTarget + 12;
    });

    this.addBackButton(root, width, margin, hitTarget);
  }

  private renderProgression(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const heading = this.addHeading(root, width / 2, top, `Progression — ${snapshot.progression.scrap} scrap`);
    let y = top + heading.height + 20;

    snapshot.progression.upgrades.forEach((upgrade) => {
      const costText = upgrade.nextCost !== null ? `${upgrade.nextCost} scrap` : 'max';
      const label = `${upgrade.name} L${upgrade.currentLevel}/${upgrade.maxLevel} (${costText})`;
      this.addButton(root, margin, y, label, hitTarget, () => {
        const next = this.requireController().purchase(upgrade.id);
        this.render(next);
      });
      y += hitTarget + 8;
      if (upgrade.description) {
        const desc = this.add.text(margin + 12, y, upgrade.description, {
          color: '#a5f3fc',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin * 2 - 12 },
        });
        desc.setScrollFactor(0);
        root.add(desc);
        y += desc.height + 8;
      }
    });

    y += 12;
    this.addButton(root, margin, y, 'Reset Progression', hitTarget, () => {
      const next = this.requireController().requestReset();
      this.render(next);
    });

    this.addBackButton(root, width, margin, hitTarget);
  }

  private renderSettings(
    root: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const heading = this.addHeading(root, width / 2, top, 'Settings');
    let y = top + heading.height + 20;

    const settings = snapshot.settings;
    const rows: Array<{ label: string; action: () => MainMenuSnapshot }> = [
      {
        label: `Mute: ${settings.muted ? 'On' : 'Off'}`,
        action: () => this.requireController().setSettings({ muted: !settings.muted }),
      },
      {
        label: `Music Volume: ${Math.round(settings.musicVolume * 100)}%`,
        action: () => this.requireController().setSettings({ musicVolume: Math.min(1, settings.musicVolume + 0.1) }),
      },
      {
        label: `SFX Volume: ${Math.round(settings.sfxVolume * 100)}%`,
        action: () => this.requireController().setSettings({ sfxVolume: Math.min(1, settings.sfxVolume + 0.1) }),
      },
      {
        label: `Reduced Motion: ${settings.reducedMotion ? 'On' : 'Off'}`,
        action: () => this.requireController().setSettings({ reducedMotion: !settings.reducedMotion }),
      },
    ];

    rows.forEach((row) => {
      this.addButton(root, margin, y, row.label, hitTarget, () => {
        const next = row.action();
        this.render(next);
      });
      y += hitTarget + 12;
    });

    this.addBackButton(root, width, margin, hitTarget);
  }

  private renderResetConfirmation(
    root: Phaser.GameObjects.Container,
    _snapshot: MainMenuSnapshot,
    width: number,
    top: number,
    margin: number,
    hitTarget: number,
  ): void {
    const heading = this.addHeading(root, width / 2, top, 'Reset all progression?');
    let y = top + heading.height + 24;

    const warning = this.add.text(margin, y, 'This cannot be undone.', {
      color: '#f87171',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.labelMin}px`,
      wordWrap: { width: width - margin * 2 },
    });
    warning.setScrollFactor(0);
    root.add(warning);
    y += warning.height + 24;

    this.addButton(root, width / 2, y, 'Confirm Reset', hitTarget, () => {
      const next = this.requireController().confirmReset();
      this.render(next);
    });
    y += hitTarget + 16;

    this.addButton(root, width / 2, y, 'Cancel', hitTarget, () => {
      const next = this.requireController().cancelReset();
      this.render(next);
    });

    this.addBackButton(root, width, margin, hitTarget);
  }

  private addButton(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    minHeight: number,
    callback: () => void,
  ): Phaser.GameObjects.Text {
    const text = this.add.text(x, y, label, {
      color: '#f7f1d5',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.labelMin}px`,
      backgroundColor: 'rgba(23, 48, 59, 0.86)',
      padding: { x: 10, y: 8 },
    });
    text.setOrigin(x === this.scale.width / 2 ? 0.5 : 0, 0);
    text.setScrollFactor(0);

    const bounds = text.getBounds();
    if (bounds.height < minHeight) {
      text.setPadding(10, (minHeight - bounds.height) / 2 + 8);
    }

    text.setInteractive({ useHandCursor: true });
    text.on(Phaser.Input.Events.POINTER_OVER, () => {
      text.setStyle({ backgroundColor: 'rgba(33, 71, 86, 0.92)' });
    });
    text.on(Phaser.Input.Events.POINTER_OUT, () => {
      text.setStyle({ backgroundColor: 'rgba(23, 48, 59, 0.86)' });
    });
    text.on(Phaser.Input.Events.POINTER_UP, () => {
      this.focusIndex = this.focusables.indexOf(text);
      callback();
    });

    root.add(text);
    this.focusables.push(text);
    if (this.focusIndex < 0) {
      this.focusIndex = 0;
    }
    return text;
  }

  private addHeading(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    text: string,
  ): Phaser.GameObjects.Text {
    const heading = this.add.text(x, y, text, {
      align: 'center',
      color: '#f7f1d5',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.headingMin}px`,
      fontStyle: '700',
    });
    heading.setOrigin(0.5, 0).setScrollFactor(0);
    root.add(heading);
    return heading;
  }

  private addBackButton(
    root: Phaser.GameObjects.Container,
    _width: number,
    margin: number,
    hitTarget: number,
  ): void {
    this.addButton(root, margin, this.scale.height - margin - hitTarget, '< Back', hitTarget, () => {
      const next = this.requireController().back();
      this.render(next);
    });
  }

  private handleBack(): void {
    const next = this.requireController().back();
    this.render(next);
  }

  private handleFocusMove(event: KeyboardEvent): void {
    if (this.focusables.length === 0) return;
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    this.focusIndex = (this.focusIndex + delta + this.focusables.length) % this.focusables.length;
    this.applyFocus();
  }

  private handleActivate(): void {
    const focused = this.focusables[this.focusIndex];
    focused?.emit(Phaser.Input.Events.POINTER_UP);
  }

  private applyFocus(): void {
    this.focusables.forEach((text, index) => {
      const isFocused = index === this.focusIndex;
      text.setStyle({ color: isFocused ? '#67e8f9' : '#f7f1d5' });
    });
  }

  private handleShutdown(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
    this.input.keyboard?.off('keydown-ESC', this.handleBack, this);
    this.input.keyboard?.off('keydown-UP', this.handleFocusMove, this);
    this.input.keyboard?.off('keydown-DOWN', this.handleFocusMove, this);
    this.input.keyboard?.off('keydown-ENTER', this.handleActivate, this);
    this.input.keyboard?.off('keydown-SPACE', this.handleActivate, this);
    this.root?.destroy(true);
    this.root = undefined;
    this.focusables = [];
    this.focusIndex = -1;
    this.controller = undefined;
  }

  private getContext(): GameContext {
    const ctx = this.registry.get(GAME_CONTEXT_REGISTRY_KEY) as GameContext | undefined;
    if (!ctx) {
      throw new Error('GameContext missing from Phaser registry');
    }
    return ctx;
  }

  private requireController(): MainMenuController {
    if (!this.controller) {
      throw new Error('MainMenuController missing from MenuScene');
    }
    return this.controller;
  }
}
