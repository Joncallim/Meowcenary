import type { GameContext } from '../engine/context';
import type { Settings } from '../systems/save';

export interface SettingsSnapshot extends Settings {
  readonly storageAvailable: boolean | null;
}

export interface SettingsUpdateResult {
  readonly settings: Settings;
  readonly persisted: boolean;
  readonly changed: boolean;
}

export class SettingsController {
  private readonly context: GameContext;
  private storageAvailable: boolean | null = null;

  constructor(context: GameContext) {
    this.context = context;
  }

  snapshot(): SettingsSnapshot {
    const settings = this.context.settings;
    return Object.freeze({
      muted: settings.muted,
      musicVolume: settings.musicVolume,
      sfxVolume: settings.sfxVolume,
      reducedMotion: settings.reducedMotion,
      storageAvailable: this.storageAvailable,
    });
  }

  set(patch: Readonly<Partial<Settings>>): SettingsUpdateResult {
    const previous = this.context.settings;
    const update = this.context.updateSettings(patch);
    this.storageAvailable = update.persisted;
    return Object.freeze({
      settings: update.value,
      persisted: update.persisted,
      changed: update.value !== previous,
    });
  }
}
