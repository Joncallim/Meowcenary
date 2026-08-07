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

/** Pure volume ratchet: steps the volume up by 0.1 (snapped to one decimal to
 *  avoid float drift) and wraps back to 0 only once the step lands above 1, so
 *  repeatedly pressing the volume key cycles 0 → 0.1 → … → 1 → 0. Snapping
 *  down with floor (plus Number.EPSILON against under-snapping) keeps every
 *  value below 1 on the 0.1 grid ending at exactly 1; only the top of the
 *  range wraps, so a drifted value like 0.95 cannot skip 100% and jump to 0. */
export function cycleVolumeStep(current: number): number {
  const next = Math.floor((current + 0.1 + Number.EPSILON) * 10) / 10;
  return next > 1 ? 0 : next;
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
