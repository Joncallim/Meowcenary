import type Phaser from 'phaser';
import type { System } from '../engine/system';
import { FAMILY_TIER_EVENT_KEYS, type EventBus, type GameEventKey, type GameEventMap } from '../engine/eventBus';
import { shouldPlay } from '../engine/cooldown';
import { RuntimeConfig } from '../engine/config';
import { weaponFeelByFamily, type AudioData, type AudioMapEntry, type WeaponFeelDefinition } from './types';
import type { Settings } from './save';
/** Epic 17: the only two events whose payload carries `family`/`tier`.
 *  Narrowing here (rather than widening GameEventMap's shared shape) keeps
 *  every other mapped event exactly as payload-agnostic as it was before. */
const FAMILY_KEYED_EVENTS = new Set<GameEventKey>(FAMILY_TIER_EVENT_KEYS);

function eventFamilyTier(
  event: GameEventKey,
  payload: GameEventMap[GameEventKey],
): { family: string; tier: number } | undefined {
  if (!FAMILY_KEYED_EVENTS.has(event)) return undefined;
  const { family, tier } = payload as GameEventMap['weapon:fired'] | GameEventMap['projectile:hit'];
  return { family, tier };
}

/**
 * Game-scoped audio manager (Epic 10, docs/architecture/epic-10-audio.md §8).
 *
 * One instance per game lifetime, constructed and inited by BootScene and
 * published under AUDIO_MANAGER_REGISTRY_KEY — BootScene wiring lands in
 * Slice 3 (docs/architecture/epic-10-audio.md §9.1); until then this class
 * is deliberately unwired and the game is silent by design (§13 slice
 * table, Slice 2 row). Scenes only fetch it, forward `update(dtMs)`, call
 * `playMusic`, and wire the first-gesture `unlock` — they never construct,
 * init, or destroy it, and shutdown never touches `sound.stopAll()` (that
 * is the global manager).
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

/** Typed registry accessor for the boot-published AudioManager (Epic 19 P2-5):
 *  centralizes the cast AND validates the value at runtime, so a wrong-type
 *  entry (e.g. a stale object or string under the key) is never handed to
 *  scenes that would crash calling playMusic/update on it. A missing or
 *  malformed entry is tolerated (scenes stay functional and silent) and
 *  returns undefined. */
export function getAudioManager(scene: Phaser.Scene): AudioManager | undefined {
  const value = scene.registry.get(AUDIO_MANAGER_REGISTRY_KEY);
  return isAudioManager(value) ? value : undefined;
}

/** Structural brand: a real AudioManager exposes the scene-consumed surface
 *  — playMusic (called on scene create), update (the manager clock), unlock
 *  (first-gesture), and the destroy lifecycle method. instanceof is
 *  deliberately avoided — the boot scene can construct the manager via a
 *  subclass or test double, and the registry stores the published instance.
 *  A playMusic-less impostor is rejected here rather than crashing scene
 *  create with 'playMusic is not a function'. */
function isAudioManager(value: unknown): value is AudioManager {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<AudioManager>;
  return (
    typeof candidate.playMusic === 'function' &&
    typeof candidate.unlock === 'function' &&
    typeof candidate.destroy === 'function' &&
    typeof candidate.update === 'function'
  );
}

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
  // Non-finite values (NaN, ±Infinity) clamp to 0 — same Number.isFinite gate
  // as save.ts clampVolume, but with a hard 0 instead of a fallback (runtime
  // should default to silence; persisted defaults are the save layer's
  // concern). NaN must never reach Phaser's setVolume/play.
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export class AudioManager implements System {
  private readonly scene: Phaser.Scene;
  private readonly lastPlayed = new Map<string, number>();
  private readonly cooldownMsByKey = new Map<string, number>();
  private readonly warnedKeys = new Set<string>();
  // Assigned exactly once by init() (enforced below); read-only thereafter.
  private weaponFeelByFamily: ReadonlyMap<string, WeaponFeelDefinition> = new Map();
  private readonly unsubscribers: Array<() => void> = [];
  private muted = false;
  private musicVolume = 1;
  private sfxVolume = 1;
  // Monotonic session clock advanced only by update(dtMs); never resets.
  // Overflow is theoretical (~285k years of continuous play past
  // MAX_SAFE_INTEGER ms) — no concern for session-scoped use, and cooldown
  // logic compares differences, never absolute magnitudes.
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
  init(bus: EventBus, settings: Settings, audio: AudioData, weaponFeel: readonly WeaponFeelDefinition[] = []): void {
    if (this.destroyed) return;
    if (this.initialized) {
      throw new Error('AudioManager.init called twice');
    }
    this.initialized = true;

    this.applySettings(settings);
    this.weaponFeelByFamily = weaponFeelByFamily(weaponFeel);

    for (const entry of audio.map) {
      const cooldownMs = entry.cooldownMs ?? 0;
      if (entry.sfxKey !== undefined) {
        this.cooldownMsByKey.set(entry.sfxKey, cooldownMs);
      }
      // Each family-keyed variant gets its own independent cooldown clock
      // (lastPlayed is tracked per resolved sfxKey), all using the entry's
      // one configured duration — so e.g. pistol and shotgun fire SFX from a
      // multi-weapon rack never gate each other out, but each still can't
      // spam faster than cooldownMs against itself.
      for (const familyKey of Object.values(entry.sfxKeyByFamily ?? {})) {
        this.cooldownMsByKey.set(familyKey, cooldownMs);
      }
      this.unsubscribers.push(bus.on(entry.event, (payload) => this.handleMappedEvent(entry, payload)));
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
   *  → cooldown. The muted and locked gates never consume the cooldown.
   *  `volumeMultiplier` (Epic 17) scales this one play only — it is never
   *  persisted, never affects `sfxVolume` itself, and defaults to 1 so every
   *  pre-Epic-17 caller is unaffected. */
  play(sfxKey: string, volumeMultiplier = 1): void {
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
    this.scene.sound.play(sfxKey, { volume: clamp01(this.sfxVolume * volumeMultiplier) });
    this.lastPlayed.set(sfxKey, this.nowMs);
  }

  /** Scene-selected, manager-executed: menu/run loops (§4.5). Same-key calls
   *  are no-ops unless a fade is active (Retry during run-end fade restarts
   *  the loop fresh); while locked the key is deferred, never played. */
  playMusic(musicKey: string): void {
    if (this.destroyed || !this.initialized) return;
    // Same-key is a true no-op only when no fade owns the ramp; during a fade we
    // cancel it and restart fresh so a Retry/restart always replays music.
    if (!this.fade && (musicKey === this.currentMusicKey || musicKey === this.pendingMusicKey)) return;
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

  /** Non-finite (`NaN`/±Infinity) or non-positive `fadeMs` stops immediately;
   *  otherwise the volume ramps to zero in `update(dtMs)` (never tweens —
   *  tweens are scene-owned and would strand a game-scoped sound on scene
   *  shutdown). */
  stopMusic(fadeMs = 0): void {
    if (this.destroyed || !this.initialized) return;
    const music = this.currentMusic;
    if (!music) {
      this.fade = undefined;
      return;
    }
    if (!Number.isFinite(fadeMs) || fadeMs <= 0) {
      music.stop();
      this.currentMusic = undefined;
      this.currentMusicKey = undefined;
      this.fade = undefined;
      return;
    }
    // Belt-and-suspenders: fromVolume is read from the MusicLoop instance the
    // manager does not fully control, so it is clamped the same way as every
    // volume that enters through the public surface (clamp01 never lets NaN
    // reach the fade ramp).
    this.fade = { fromVolume: clamp01(music.volume), elapsedMs: 0, durationMs: fadeMs };
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
    if (this.destroyed || !this.initialized) return;
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

  /** On a mapped event with `stopMusic: true` (an opt-in, §6.2) the music
   *  stop/fade applies first, then the stinger — the stinger always
   *  dispatches even if the fade logic misbehaves. SFX-only entries never
   *  touch music, so combat/UI events cannot kill a playing loop. (The Slice
   *  2 version called stopMusic unconditionally — a bug that would
   *  hard-stop a playing loop on every SFX-only event; the opt-in gate
   *  fixes it.) */
  private handleMappedEvent(entry: AudioMapEntry, payload: GameEventMap[GameEventKey]): void {
    // The !this.initialized path never fires in practice: subscriptions are
    // registered in init, synchronously, after initialized = true, and bus
    // emissions arrive only later (game ticks or user input). The pair is
    // kept for guard-order consistency with the public API methods.
    if (this.destroyed || !this.initialized) return;
    if (entry.stopMusic) {
      this.stopMusic(entry.musicFadeMs ?? 0);
    }

    // Epic 17: family-keyed events resolve a per-family key (falling back to
    // the entry's plain sfxKey) plus a per-tier volume multiplier. Every
    // other event is untouched — familyTier is undefined, so this collapses
    // to exactly the pre-Epic-17 sfxKey/volume-1 behavior.
    const familyTier = eventFamilyTier(entry.event, payload);
    const sfxKey = (familyTier && entry.sfxKeyByFamily?.[familyTier.family]) ?? entry.sfxKey;
    if (sfxKey === undefined) return;
    const multiplier = familyTier
      ? this.weaponFeelByFamily.get(familyTier.family)?.sfxTierVolumeMultiplier[familyTier.tier - 1] ?? 1
      : 1;
    this.play(sfxKey, multiplier);
  }

  /** Phaser emits 'unlocked' on the update tick after the gesture-driven
   *  resume resolves, with `locked` already false — mirroring that order
   *  (set locked = false, then emit) is what tests do. Only deferred music is
   *  flushed here; one-shots are never replayed retroactively. Design note:
   *  the pending key is cleared before the flush, so a failed flush (missing
   *  asset → warn + drop) loses it permanently — deliberately not retried;
   *  the next playMusic call starts fresh. */
  private readonly handleUnlocked = (): void => {
    // Same guard rationale as handleMappedEvent: the 'unlocked' listener is
    // registered in init after initialized = true, so the uninitialized
    // branch is dead-but-safe guard-order consistency.
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
