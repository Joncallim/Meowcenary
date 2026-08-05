import type { Settings } from '../systems/save';
import { ArenaSelectionController, type ArenaSelectionSnapshot } from './arenaSelectionController';
import { CharacterSelectionController, type CharacterSelectionSnapshot } from './characterSelectionController';
import { ProgressionController, type ProgressionSnapshot } from './progressionController';
import { SettingsController, type SettingsSnapshot } from './settings';
import type { GameContext } from '../engine/context';

export type MenuPanel =
  | 'home'
  | 'character'
  | 'arena'
  | 'progression'
  | 'settings'
  | 'reset-confirmation';

type NonResetPanel = Exclude<MenuPanel, 'reset-confirmation'>;

export interface MainMenuSnapshot {
  readonly panel: MenuPanel;
  readonly character: CharacterSelectionSnapshot;
  readonly arena: ArenaSelectionSnapshot;
  readonly progression: ProgressionSnapshot;
  readonly settings: SettingsSnapshot;
  readonly notice?: string;
}

export class MainMenuController {
  private readonly characterController: CharacterSelectionController;
  private readonly arenaController: ArenaSelectionController;
  private readonly progressionController: ProgressionController;
  private readonly settingsController: SettingsController;
  private panel: MenuPanel = 'home';
  private previousPanel: NonResetPanel = 'home';
  private notice?: string;

  constructor(context: GameContext) {
    this.characterController = new CharacterSelectionController(context);
    this.arenaController = new ArenaSelectionController(context);
    this.progressionController = new ProgressionController(context);
    this.settingsController = new SettingsController(context);
  }

  snapshot(): MainMenuSnapshot {
    return Object.freeze({
      panel: this.panel,
      character: this.characterController.snapshot(),
      arena: this.arenaController.snapshot(),
      progression: this.progressionController.snapshot(),
      settings: this.settingsController.snapshot(),
      notice: this.notice,
    });
  }

  open(panel: NonResetPanel): MainMenuSnapshot {
    this.previousPanel = panel === 'home' ? this.previousPanel : panel;
    this.panel = panel;
    this.notice = undefined;
    return this.snapshot();
  }

  back(): MainMenuSnapshot {
    if (this.panel === 'reset-confirmation') {
      this.panel = 'progression';
      this.notice = undefined;
      return this.snapshot();
    }

    if (this.panel !== 'home') {
      this.panel = 'home';
    }
    this.notice = undefined;
    return this.snapshot();
  }

  selectCharacter(id: string, expectedRevision: number): MainMenuSnapshot {
    const result = this.characterController.select(id, expectedRevision);
    this.notice = result.ok ? undefined : this.noticeForSelectionFailure(result.reason);
    return this.snapshot();
  }

  selectArena(id: string, expectedRevision: number): MainMenuSnapshot {
    const result = this.arenaController.select(id, expectedRevision);
    this.notice = result.ok ? undefined : this.noticeForSelectionFailure(result.reason);
    return this.snapshot();
  }

  purchase(upgradeId: string): MainMenuSnapshot {
    const result = this.progressionController.purchase(upgradeId);
    if (!result.ok) {
      this.notice = this.noticeForPurchaseFailure(result.reason);
      return this.snapshot();
    }
    this.notice = result.persisted ? undefined : 'Saved for this session only';
    return this.snapshot();
  }

  requestReset(): MainMenuSnapshot {
    this.previousPanel = 'progression';
    this.panel = 'reset-confirmation';
    this.notice = undefined;
    return this.snapshot();
  }

  cancelReset(): MainMenuSnapshot {
    if (this.panel === 'reset-confirmation') {
      this.panel = 'progression';
    }
    this.notice = undefined;
    return this.snapshot();
  }

  confirmReset(): MainMenuSnapshot {
    if (this.panel !== 'reset-confirmation') {
      this.notice = 'Reset confirmation required';
      return this.snapshot();
    }
    const result = this.progressionController.reset(true);
    if (!result.ok) {
      this.notice = 'Reset failed';
      return this.snapshot();
    }
    this.notice = result.persisted ? undefined : 'Saved for this session only';
    this.panel = 'progression';
    return this.snapshot();
  }

  setSettings(patch: Readonly<Partial<Settings>>): MainMenuSnapshot {
    const result = this.settingsController.set(patch);
    this.notice = result.persisted ? undefined : 'Saved for this session only';
    return this.snapshot();
  }

  private noticeForSelectionFailure(
    reason: 'unknown-character' | 'locked' | 'stale-selection' | 'unknown-arena' | string,
  ): string {
    switch (reason) {
      case 'locked':
        return 'Selection is locked';
      case 'stale-selection':
        return 'Selection changed; please retry';
      case 'unknown-character':
      case 'unknown-arena':
        return 'Selection not found';
      default:
        return 'Selection failed';
    }
  }

  private noticeForPurchaseFailure(reason: string): string {
    switch (reason) {
      case 'insufficient-scrap':
        return 'Not enough scrap';
      case 'max-level':
        return 'Already at max level';
      case 'unknown-upgrade':
        return 'Upgrade not found';
      default:
        return 'Purchase failed';
    }
  }
}
