import type Phaser from 'phaser';
import type { System } from '../engine/system';
import type { EventBus } from '../engine/eventBus';
import { shouldPlay } from '../engine/cooldown';
import { RuntimeConfig } from '../engine/config';
import type { AudioData, AudioMapEntry } from './types';
import type { Settings } from './save';

/**
 * Game-scoped audio manager (Epic 10, docs/architecture/epic-10-audio.md §8).
 *
 * One instance per game lifetime, constructed and inited by BootScene and
 * published under AUDIO_MANAGER_REGISTRY_KEY. Scenes only fetch it, forward
 * `update(dtMs)`, call `playMusic`, and wire the first-gesture `unlock` —
 * they never construct, init, or destroy it, and shutdown never touches
 * `sound.stopAll()` (that is the global manager).
 *
 * Frozen behavior: mapped bus events drive SFX (and run-end music
 * stop/fade); per-key cooldowns gate SFX through the pure `shouldPlay` and
 * the update-driven clock; the manager reads `scene.sound.locked` live (SFX
 * dropped while locked, music deferred via `pendingMusicKey` and flushed on
 * the sound manager's 'unlocked' event); fades are a manual volume ramp in
 * `update`, never scene tweens; settings apply live from
 * `settings:changed`. No Phaser runtime imports — the fake scene/sound
 * harness in tests is pure TS.
 */

export const AUDIO_MANAGER_REGISTRY_KEY = 'meowcenary.audioManager';

interface MusicFade {
  readonly fromVolume: number;
  readonly durationMs: number;
  elapsedMs: number;
}

/**
 * Structural slice of Phaser's sound instances the manager retains. Phaser's
 * sound classes disagree on members (NoAudioSound is bare, HTML5/WebAudio
 * differ), so the manager narrows `sound.add`'s union result to the small
 * surface it uses — no Phaser typings are needed at runtime.
 */
interface MusicLoop {
  readonly volume: number;
  play(config?: { readonly loop?: boolean; readonly volume?: number; readonly mute?: boolean }): unknown;
  stop(): unknown;
  setMute(muted: boolean): unknown;
  setVolume(volume: number): unknown;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export class AudioManager implements System {
  private readonly scene: Phaser.Scene;
  private readonly lastPlayed = new Map<string, number>();
  private readonly cooldownMsByKey = new Map<string, number>();
  private readonly warnedKeys = new Set<string>();
  private readonly unsubscribers: Array<() => void> = [];
  private muted = false;
  private musicVolume = 1;
  private sfxVolume = 1;
  private nowMs = 0;
  private currentMusic?: MusicLoop;
  private currentMusicKey?: string;
  private pendingMusicKey?: string;
  private fade?: MusicFade;
  private initialized = false;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Exactly once per manager lifetime; a second call is a wiring bug. */
  init(bus: EventBus, settings: Settings, audio: AudioData): void {
    if (this.destroyed) return;
    if (this.initialized) {
      throw new Error('AudioManager.init called twice');
    }
    this.initialized = true;

    this.applySettings(settings);

    for (const entry of audio.map) {
      if (entry.sfxKey !== undefined) {
        this.cooldownMsByKey.set(entry.sfxKey, entry.cooldownMs ?? 0);
      }
      this.unsubscribers.push(bus.on(entry.event, () => this.handleMappedEvent(entry)));
    }
    this.unsubscribers.push(
      bus.on('settings:changed', ({ settings: next }) => {
        this.applySettings(next);
      }),
      () => {
        this.scene.sound.off('unlocked', this.handleUnlocked);
      },
    );
    this.scene.sound.on('unlocked', this.handleUnlocked);
  }

  /** Guard order: destroyed/uninitialized → asset missing → locked → muted
   *  → cooldown. The muted and locked gates never consume the cooldown. */
  play(sfxKey: string): void {
    if (this.destroyed || !this.initialized) return;
    if (!this.scene.cache.audio.exists(sfxKey)) {
      this.warnOnce(sfxKey);
      return;
    }
    if (this.scene.sound.locked) return; // dropped, never queued (§2.4)
    if (this.muted) return; // cooldown is not consumed while muted
    if (!shouldPlay(this.lastPlayed.get(sfxKey), this.nowMs, this.cooldownMsByKey.get(sfxKey) ?? 0)) {
      return;
    }
    this.scene.sound.play(sfxKey, { volume: this.sfxVolume });
    this.lastPlayed.set(sfxKey, this.nowMs);
  }

  /** Scene-selected, manager-executed: menu/run loops (§4.5). Same-key calls
   *  are no-ops; while locked the key is deferred, never played. */
  playMusic(musicKey: string): void {
    if (this.destroyed || !this.initialized) return;
    if (musicKey === this.currentMusicKey || musicKey === this.pendingMusicKey) return;
    if (!this.scene.cache.audio.exists(musicKey)) {
      this.warnOnce(musicKey);
      return;
    }
    if (this.scene.sound.locked) {
      this.pendingMusicKey = musicKey;
      return;
    }
    // Replacement: an in-progress fade is cancelled and the old loop is
    // stopped immediately.
    this.stopMusic(0);
    const loop = this.scene.sound.add(musicKey) as unknown as MusicLoop;
    loop.play({ loop: true, volume: this.musicVolume, mute: this.muted });
    this.currentMusic = loop;
    this.currentMusicKey = musicKey;
    this.pendingMusicKey = undefined;
  }

  /** `fadeMs <= 0` stops immediately; otherwise the volume ramps to zero in
   *  `update(dtMs)` (never tweens — tweens are scene-owned and would strand a
   *  game-scoped sound on scene shutdown). */
  stopMusic(fadeMs = 0): void {
    if (this.destroyed || !this.initialized) return;
    const music = this.currentMusic;
    if (!music) {
      this.fade = undefined;
      return;
    }
    if (fadeMs <= 0) {
      music.stop();
      this.currentMusic = undefined;
      this.currentMusicKey = undefined;
      this.fade = undefined;
      return;
    }
    this.fade = { fromVolume: music.volume, elapsedMs: 0, durationMs: fadeMs };
  }

  /** Live settings: mute always applies; music volume is deferred while a
   *  fade owns the ramp. SFX volume applies to subsequent `play` calls. */
  applySettings(settings: Settings): void {
    if (this.destroyed || !this.initialized) return;
    this.muted = settings.muted;
    this.musicVolume = clamp01(settings.musicVolume);
    this.sfxVolume = clamp01(settings.sfxVolume);
    const music = this.currentMusic;
    if (!music) return;
    music.setMute(this.muted);
    if (!this.fade) {
      music.setVolume(this.musicVolume);
    }
  }

  /** First-gesture delegate: Phaser 3.90 already arms the autoplay unlock
   *  (§2.3); this only pokes the sound manager while it still reports locked.
   *  Never resumes an AudioContext and never adds DOM listeners here. Safe to
   *  call any number of times. */
  unlock(): void {
    if (this.destroyed) return;
    const sound = this.scene.sound as { readonly locked?: boolean; unlock?: () => void };
    if (sound.locked === true && typeof sound.unlock === 'function') {
      sound.unlock();
    }
  }

  /** The manager clock advances only here (repository time-source rule) and
   *  drives both the cooldown gates and the active fade ramp. */
  update(dtMs: number): void {
    if (this.destroyed || !this.initialized) return;
    if (!Number.isFinite(dtMs) || dtMs <= 0) return;
    this.nowMs += dtMs;
    this.advanceFade(dtMs);
  }

  /** Full-game teardown and tests only. Unsubscribes everything, stops the
   *  owned music loop, and never calls `sound.stopAll()`. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.length = 0;
    this.currentMusic?.stop();
    this.currentMusic = undefined;
    this.currentMusicKey = undefined;
    this.pendingMusicKey = undefined;
    this.fade = undefined;
  }

  /** On a mapped event the music stop/fade applies first, then the stinger —
   *  the stinger always dispatches even if the fade logic misbehaves. */
  private handleMappedEvent(entry: AudioMapEntry): void {
    if (this.destroyed) return;
    this.stopMusic(entry.musicFadeMs ?? 0);
    if (entry.sfxKey !== undefined) {
      this.play(entry.sfxKey);
    }
  }

  /** Phaser emits 'unlocked' on the update tick after the gesture-driven
   *  resume resolves, with `locked` already false — mirroring that order
   *  (set locked = false, then emit) is what tests do. Only deferred music is
   *  flushed here; one-shots are never replayed retroactively. */
  private readonly handleUnlocked = (): void => {
    if (this.destroyed || !this.initialized) return;
    const key = this.pendingMusicKey;
    if (key === undefined) return;
    this.pendingMusicKey = undefined;
    this.playMusic(key);
  };

  private advanceFade(dtMs: number): void {
    const fade = this.fade;
    const music = this.currentMusic;
    if (!fade || !music) return;
    fade.elapsedMs += dtMs;
    const t = fade.elapsedMs / fade.durationMs;
    if (t >= 1) {
      music.stop();
      this.currentMusic = undefined;
      this.currentMusicKey = undefined;
      this.fade = undefined;
      return;
    }
    music.setVolume(fade.fromVolume * (1 - t));
  }

  /** Dev-only, at most once per key: missing or deleted assets never throw
   *  and never block boot (§11). */
  private warnOnce(key: string): void {
    if (!RuntimeConfig.isDev || this.warnedKeys.has(key)) return;
    this.warnedKeys.add(key);
    console.warn(`[AudioManager] Missing audio asset "${key}"`);
  }
}
