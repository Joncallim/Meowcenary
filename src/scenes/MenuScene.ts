import Phaser from 'phaser';
import { GAME_CONTEXT_REGISTRY_KEY, type GameContext } from '../engine/context';
import type { EventBus } from '../engine/eventBus';

import { SceneKey } from '../engine/sceneKeys';
import { AudioManager, AUDIO_MANAGER_REGISTRY_KEY } from '../systems/audio';
import { logicalCanvasViewport, minimumHitTarget } from '../ui/layout';
import { MainMenuController, type MainMenuSnapshot } from '../ui/menus';
import { cycleVolumeStep } from '../ui/settings';
import { ThemeColor, ThemeDepth, ThemeFont } from '../ui/theme';

const MENU_DEPTH = ThemeDepth.pauseSummary;

/** The two audible command events a menu button can produce. */
type MenuAudioEvent = 'ui:confirm' | 'ui:back';

export class MenuScene extends Phaser.Scene {
  private controller?: MainMenuController;
  private root?: Phaser.GameObjects.Container;
  private focusables: Phaser.GameObjects.Text[] = [];
  private focusIndex = -1;
  private bus?: EventBus;
  private audioManager?: AudioManager;

  constructor() {
    super(SceneKey.Menu);
  }

  create(): void {
    const ctx = this.getContext();
    this.bus = ctx.bus;
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

    // A missing audio registry entry is tolerated; the scene stays
    // functional and silent.
    this.audioManager = this.getAudioManager();
    this.audioManager?.playMusic('music-menu');
    this.installAudioUnlockListeners();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
  }

  update(_time: number, delta: number): void {
    this.audioManager?.update(delta);
  }

  private render(snapshot: MainMenuSnapshot): void {
    this.root?.destroy(true);
    this.root = undefined;
    this.focusables = [];
    this.focusIndex = -1;

    const root = this.add.container(0, 0);
    root.setDepth(MENU_DEPTH).setScrollFactor(0);

    const margin = 16;
    const width = this.scale.width;
    const hitTarget = minimumHitTarget(
      logicalCanvasViewport(this.scale.displaySize.width, this.scale.displaySize.height),
    );

    try {
      const title = this.own(root, this.add.text(width / 2, 28, 'Meowcenary', {
        align: 'center',
        color: '#f7f1d5',
        fontFamily: ThemeFont.family,
        fontSize: `${ThemeFont.headingMin}px`,
        fontStyle: '700',
      }));
      title.setOrigin(0.5).setScrollFactor(0);

      if (snapshot.notice) {
        const notice = this.own(root, this.add.text(width / 2, 58, snapshot.notice, {
          align: 'center',
          color: '#f87171',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin * 2 },
        }));
        notice.setOrigin(0.5, 0).setScrollFactor(0);
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

      // The root is only published once the display tree is fully built and
      // focused, so a failed render leaves the menu without a published root
      // and the next render can retry from a clean slate.
      this.root = root;
    } catch (error) {
      root.destroy(true);
      this.focusables = [];
      this.focusIndex = -1;
      // The menu is the whole scene: always leave a visible recovery hint so
      // a failed render never results in a blank screen. Esc retries through
      // handleBack -> render.
      this.renderFallback();
      throw error;
    }
  }

  /** Last-resort display when a render fails. Best effort — if even this
   *  fails the scene stays empty rather than throwing a second error. */
  private renderFallback(): void {
    try {
      const fallback = this.add.container(0, 0);
      const own = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
        fallback.add(object);
        return object;
      };
      fallback.setDepth(MENU_DEPTH).setScrollFactor(0);
      own(
        this.add.text(
          this.scale.width / 2,
          this.scale.height / 2,
          'Something went wrong — press Esc to retry',
          {
            align: 'center',
            color: '#f87171',
            fontFamily: ThemeFont.family,
            fontSize: `${ThemeFont.bodyMin}px`,
            wordWrap: { width: Math.max(1, this.scale.width - 32) },
          },
        ),
      ).setOrigin(0.5).setScrollFactor(0);
      this.root = fallback;
    } catch {
      this.root = undefined;
    }
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

    const info = this.own(root, this.add.text(margin, top, infoLines.join('\n'), {
      color: '#d6f7ff',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.labelMin}px`,
      lineSpacing: 4,
      wordWrap: { width: width - margin * 2 },
    }));
    info.setScrollFactor(0);

    const buttons: ReadonlyArray<{ readonly label: string; readonly action: () => void }> = [
      { label: 'Start', action: () => this.scene.start(SceneKey.Game) },
      { label: 'Character', action: () => this.render(this.requireController().open('character')) },
      { label: 'Arena', action: () => this.render(this.requireController().open('arena')) },
      { label: 'Progression', action: () => this.render(this.requireController().open('progression')) },
      { label: 'Settings', action: () => this.render(this.requireController().open('settings')) },
    ];
    let y = top + info.height + 24;
    buttons.forEach(({ label, action }) => {
      const button = this.addButton(root, width / 2, y, label, hitTarget, action);
      y += button.height + 12;
    });

    const hints = this.own(root, this.add.text(margin, this.scale.height - margin - 14, '↑/↓ • Enter • Esc', {
      color: '#a5f3fc',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.bodyMin}px`,
    }));
    hints.setScrollFactor(0);
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
        const desc = this.own(root, this.add.text(margin + 12, y + button.height + 2, character.description, {
          color: '#a5f3fc',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin * 2 - 12 },
        }));
        desc.setScrollFactor(0);
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
        const desc = this.own(root, this.add.text(margin + 12, y, upgrade.description, {
          color: '#a5f3fc',
          fontFamily: ThemeFont.family,
          fontSize: `${ThemeFont.bodyMin}px`,
          wordWrap: { width: width - margin * 2 - 12 },
        }));
        desc.setScrollFactor(0);
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
        action: () => this.requireController().setSettings({ musicVolume: cycleVolumeStep(settings.musicVolume) }),
      },
      {
        label: `SFX Volume: ${Math.round(settings.sfxVolume * 100)}%`,
        action: () => this.requireController().setSettings({ sfxVolume: cycleVolumeStep(settings.sfxVolume) }),
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

    const warning = this.own(root, this.add.text(margin, y, 'This cannot be undone.', {
      color: '#f87171',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.labelMin}px`,
      wordWrap: { width: width - margin * 2 },
    }));
    warning.setScrollFactor(0);
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

  /** Parents a freshly created display object immediately, so a mid-chain
   *  failure (setOrigin, setStyle, ...) can never leave it orphaned on the
   *  scene's display list outside the container the failure path destroys. */
  private own<T extends Phaser.GameObjects.GameObject>(
    root: Phaser.GameObjects.Container,
    object: T,
  ): T {
    root.add(object);
    return object;
  }

  private addButton(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    minHeight: number,
    callback: () => void,
    audioEvent: MenuAudioEvent = 'ui:confirm',
  ): Phaser.GameObjects.Text {
    const text = this.own(root, this.add.text(x, y, label, {
      color: '#f7f1d5',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.labelMin}px`,
      backgroundColor: 'rgba(23, 48, 59, 0.86)',
      padding: { x: 10, y: 8 },
    }));
    text.setOrigin(x === this.scale.width / 2 ? 0.5 : 0, 0);
    text.setScrollFactor(0);

    const bounds = text.getBounds();
    if (bounds.height < minHeight) {
      // Phaser Text bounds (width/height, and therefore getBounds()) already
      // include the current padding on both axes, so the delta
      // (minHeight - bounds.height) undercounts by exactly the existing top
      // padding. Topping the delta up with the current text.padding.top makes
      // the final height land exactly on minHeight; without it the button
      // would come out 2 × padding.top too short.
      text.setPadding(10, (minHeight - bounds.height) / 2 + (text.padding.top ?? 8));
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
      // The single command boundary: pointer clicks and synthetic
      // Enter/Space activation both land here and emit exactly one event.
      this.bus?.emit(audioEvent, {});
      callback();
    });

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
    const heading = this.own(root, this.add.text(x, y, text, {
      align: 'center',
      color: '#f7f1d5',
      fontFamily: ThemeFont.family,
      fontSize: `${ThemeFont.headingMin}px`,
      fontStyle: '700',
    }));
    heading.setOrigin(0.5, 0).setScrollFactor(0);
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
    }, 'ui:back');
  }

  private handleBack(): void {
    // Home Esc is still a back command; it emits even when the controller
    // refuses (already home).
    this.bus?.emit('ui:back', {});
    const next = this.requireController().back();
    this.render(next);
  }

  private handleFocusMove(event: KeyboardEvent): void {
    // OS key-repeat events fire at ~30Hz while a key is held; each genuine
    // index change emits a ui:navigate bus event, so repeats must be ignored
    // to avoid focus spinning around the list at repeat rate.
    if (event.repeat) return;
    if (this.focusables.length === 0) return;
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const previousIndex = this.focusIndex;
    this.focusIndex = (this.focusIndex + delta + this.focusables.length) % this.focusables.length;
    if (this.focusIndex !== previousIndex) {
      this.bus?.emit('ui:navigate', {});
    }
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
    this.removeAudioUnlockListeners();
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
    // The manager is game-scoped and Boot-owned: shutdown only drops this
    // scene's reference — never destroy/stopMusic/stopAll.
    this.audioManager = undefined;
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

  private readonly handleAudioUnlock = (): void => {
    this.removeAudioUnlockListeners();
    this.audioManager?.unlock();
  };

  private installAudioUnlockListeners(): void {
    if (!this.audioManager) {
      return;
    }
    this.removeAudioUnlockListeners();
    this.input.once(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleAudioUnlock,
      this,
    );
    this.input.keyboard?.once('keydown', this.handleAudioUnlock, this);
  }

  private removeAudioUnlockListeners(): void {
    this.input.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleAudioUnlock,
      this,
    );
    this.input.keyboard?.off('keydown', this.handleAudioUnlock, this);
  }

  private getAudioManager(): AudioManager | undefined {
    return this.registry.get(AUDIO_MANAGER_REGISTRY_KEY) as
      | AudioManager
      | undefined;
  }
}
