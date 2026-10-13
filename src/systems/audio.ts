import type Phaser from 'phaser';
import type { System } from '../engine/system';
import { FAMILY_TIER_EVENT_KEYS, type EventBus, type GameEventKey, type GameEventMap } from '../engine/eventBus';
import { shouldPlay } from '../engine/cooldown';
import { RuntimeConfig } from '../engine/config';
import { weaponFeelByFamily, type AudioData, type AudioMapEntry, type AudioPriority, type WeaponFeelDefinition } from './types';
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
 * published under AUDIO_MANAGER_REGISTRY_KEY. Scenes only fetch it,
 * forward `update(dtMs)`, call
 * `playMusic`, and wire the first-gesture `unlock` — they never construct,
 * init, or destroy it, and shutdown never touches `sound.stopAll()` (that
 * is the global manager).
 *
 * Frozen behavior: mapped bus events drive SFX (and run-end music
 * stop/fade); per-key cooldowns gate SFX through the pure `shouldPlay` and
 * the update-driven clock; the manager reads `scene.sound.locked` live (SFX
 * dropped while locked, music deferred via `pendingMusicKey` and flushed on
 * the sound manager's 'unlocked' event); known native HTML5 refusals retire
 * their voice and may retry latest music through playMusic or existing unlock;
 * fades are a manual volume ramp in `update`, never scene tweens; settings apply live from
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
  readonly fromGain: number;
  readonly durationMs: number;
  elapsedMs: number;
}

/** All Phaser 3.90 backends expose this lifecycle, including NoAudio. */
type SoundHandle = ReturnType<Phaser.Scene['sound']['add']>;

const PRIORITY_RANK: Readonly<Record<AudioPriority, number>> = { combat: 0, feedback: 1, alert: 2, terminal: 3 };

interface OwnedVoice {
  readonly kind: 'sfx' | 'music';
  readonly sound: SoundHandle;
  released: boolean;
  /** Failed starts are removed immediately: NoAudio has no update sweep. */
  release(removeImmediately?: boolean): void;
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
  private readonly priorityByKey = new Map<string, AudioPriority>();
  // Retiring a sound does not mean Phaser has removed its handle yet.
  private readonly retainedVoices = new Set<OwnedVoice>();
  private allocatingHandles = 0;
  private admittingSfx = 0;
  private admissionPendingMusic = false;
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
  private currentMusic?: OwnedVoice;
  private readonly activeSfx = new Map<OwnedVoice, { readonly multiplier: number; readonly priority: number }>();
  private currentMusicKey?: string;
  private pendingMusicKey?: string;
  private desiredMusicKey?: string;
  private failedMusicKey?: string;
  private musicIntent = 0;
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
        this.priorityByKey.set(entry.sfxKey, entry.priority ?? 'feedback');
      }
      // Each family-keyed variant gets its own independent cooldown clock
      // (lastPlayed is tracked per resolved sfxKey), all using the entry's
      // one configured duration — so e.g. pistol and shotgun fire SFX from a
      // multi-weapon rack never gate each other out, but each still can't
      // spam faster than cooldownMs against itself.
      for (const familyKey of Object.values(entry.sfxKeyByFamily ?? {})) {
        this.cooldownMsByKey.set(familyKey, cooldownMs);
        this.priorityByKey.set(familyKey, entry.priority ?? 'feedback');
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
    if (!this.hasHandleCapacity()) return;
    const priority = PRIORITY_RANK[this.priorityByKey.get(sfxKey) ?? 'feedback'];
    const victim = this.liveSfxCount() + this.admittingSfx >= RuntimeConfig.performance.maxSfxVoices
      ? this.lowerPriorityVictim(priority) : undefined;
    if (!victim && this.liveSfxCount() + this.admittingSfx >= RuntimeConfig.performance.maxSfxVoices) return;
    // Charge admission across destroy/add/play callbacks, not only after add returns.
    this.admittingSfx += 1;
    let admissionReserved = true;
    try {
      victim?.release(); // Never splice Phaser's sound-update iteration.
      if (this.destroyed || this.muted || this.scene.sound.locked ||
          this.liveSfxCount() + this.admittingSfx > RuntimeConfig.performance.maxSfxVoices) return;
      const voice = this.addVoice(sfxKey, 'sfx');
      if (!voice) return;
      // The retained voice now owns this slot. Counting its reservation too
      // would wrongly reject a higher-priority cue requested during play().
      this.admittingSfx -= 1;
      admissionReserved = false;
      if (this.destroyed || this.muted || this.scene.sound.locked) {
        voice.release(true);
        return;
      }
      this.activeSfx.set(voice, { multiplier: volumeMultiplier, priority });
      if (this.startVoice(voice, { volume: clamp01(this.sfxVolume * volumeMultiplier) })) {
        this.lastPlayed.set(sfxKey, this.nowMs);
      }
    } finally {
      if (admissionReserved) this.admittingSfx -= 1;
    }
  }

  /** Scene-selected, manager-executed: menu/run loops (§4.5). Same-key calls
   *  are no-ops for retained loops unless a fade is active (Retry during
   *  run-end fade restarts fresh). A refused native start releases the key,
   *  allowing explicit retry; while locked the key is deferred, never played.
   *  At the owned-handle ceiling, keep the audible loop and defer only the
   *  latest music intent until backend removal (or failed retirement) completes. */
  playMusic(musicKey: string): void {
    if (this.destroyed || !this.initialized) return;
    const intent = ++this.musicIntent;
    this.desiredMusicKey = musicKey;
    this.failedMusicKey = undefined;
    // Same-key is a true no-op only when no fade owns the ramp; during a fade we
    // cancel it and restart fresh so a Retry/restart always replays music.
    if (this.currentMusic) this.reapStoppedVoice(this.currentMusic);
    if (!this.isCurrentMusicIntent(intent)) return;
    if (!this.fade && musicKey === this.pendingMusicKey) return;
    if (!this.fade && musicKey === this.currentMusicKey) {
      this.pendingMusicKey = undefined; // Latest intent supersedes a different pending request.
      this.admissionPendingMusic = false;
      return;
    }
    // A newer unavailable request also supersedes older locked intent. Keep
    // the retained-loop/pending-same-key no-op cases above unchanged.
    this.pendingMusicKey = undefined;
    this.admissionPendingMusic = false;
    if (!this.scene.cache.audio.exists(musicKey)) {
      this.warnOnce(musicKey);
      return;
    }
    if (this.scene.sound.locked) {
      this.pendingMusicKey = musicKey;
      return;
    }
    if (!this.hasHandleCapacity() || this.hasLiveRetiredMusic()) {
      this.pendingMusicKey = musicKey;
      this.admissionPendingMusic = true;
      return; // Retain the audible current loop until the backend frees capacity.
    }
    // Acquire inactive replacement first: retiring the old loop may reenter
    // admission and consume the last available slot. No second loop is started.
    const voice = this.addVoice(musicKey, 'music');
    if (!voice) return;
    if (!this.isCurrentMusicIntent(intent)) {
      voice.release();
      return;
    }
    const previous = this.currentMusic;
    previous?.release();
    if (!this.isCurrentMusicIntent(intent)) {
      voice.release();
      return;
    }
    if (previous && (previous.sound.isPlaying || previous.sound.isPaused)) {
      voice.release();
      this.pendingMusicKey = musicKey;
      this.admissionPendingMusic = true;
      return; // Failed optional retirement must not create two audible loops.
    }
    // Publish before play: synchronous completion/destruction can retire only
    // this exact voice, never a newer replacement with the same asset key.
    this.currentMusic = voice;
    this.currentMusicKey = musicKey;
    this.startVoice(voice, { loop: true, volume: this.musicVolume, mute: this.muted });
    // A newer same-key request or fade may still own this voice. Do not undo
    // that intent; only retire a handle that no longer belongs to it.
    if (!this.isCurrentMusicIntent(intent) && this.currentMusic !== voice) voice.release();
  }

  /** Non-finite (`NaN`/±Infinity) or non-positive `fadeMs` stops immediately;
   *  otherwise the volume ramps to zero in `update(dtMs)` (never tweens —
   *  tweens are scene-owned and would strand a game-scoped sound on scene
   *  shutdown). */
  stopMusic(fadeMs = 0): void {
    if (this.destroyed || !this.initialized) return;
    this.musicIntent += 1;
    this.desiredMusicKey = undefined;
    this.failedMusicKey = undefined;
    this.pendingMusicKey = undefined;
    this.admissionPendingMusic = false;
    const music = this.currentMusic;
    if (!music) {
      this.fade = undefined;
      return;
    }
    if (!Number.isFinite(fadeMs) || fadeMs <= 0) {
      music.release();
      return;
    }
    // Keep the envelope independent of user gain, including gain zero.
    this.fade = { fromGain: this.musicFadeGain(), elapsedMs: 0, durationMs: fadeMs };
  }

  /** User gain applies live, including during fades. Muting retires one-shot
   *  tails rather than allowing an old cue to reappear on a later unmute. */
  applySettings(settings: Settings): void {
    if (this.destroyed || !this.initialized) return;
    this.muted = settings.muted;
    this.musicVolume = clamp01(settings.musicVolume);
    this.sfxVolume = clamp01(settings.sfxVolume);
    for (const [voice, { multiplier }] of this.activeSfx) {
      if (this.muted) voice.release();
      else this.applyVoiceGain(voice, clamp01(this.sfxVolume * multiplier));
    }
    if (this.currentMusic) {
      this.applyVoiceGain(this.currentMusic, this.musicVolume * this.musicFadeGain());
    }
  }

  /** Existing first-gesture surface: delegate Phaser's lock handling, then
   *  retry only known-refused latest music when unlocked. Native HTML5 policy
   *  refusal can occur while Phaser reports locked=false. No immediate retry,
   *  extra gesture listeners, AudioContext resume or queued SFX. */
  unlock(): void {
    if (this.destroyed || !this.initialized) return;
    const sound = this.scene.sound as { readonly locked?: boolean; unlock?: () => void };
    if (sound.locked === true && typeof sound.unlock === 'function') {
      sound.unlock();
    }
    if (!this.scene.sound.locked && this.failedMusicKey !== undefined) {
      this.playMusic(this.failedMusicKey);
    }
  }

  /** The manager clock advances only here (repository time-source rule) and
   *  drives both the cooldown gates and the active fade ramp. */
  update(dtMs: number): void {
    if (this.destroyed || !this.initialized) return;
    if (!Number.isFinite(dtMs) || dtMs <= 0) return;
    this.nowMs += dtMs;
    // HTML5 tag stealing resets the old sound without complete/stop events.
    // Do not retire paused voices: pause/blur remains Phaser's responsibility.
    for (const voice of this.activeSfx.keys()) this.reapStoppedVoice(voice);
    if (this.currentMusic) this.reapStoppedVoice(this.currentMusic);
    this.advanceFade(dtMs);
    this.pruneRemovedVoices();
    if (this.admissionPendingMusic && !this.scene.sound.locked && this.hasHandleCapacity()) {
      const key = this.pendingMusicKey;
      this.pendingMusicKey = undefined;
      this.admissionPendingMusic = false;
      if (key !== undefined) this.playMusic(key);
    }
  }

  /** Full-game teardown and tests only. Unsubscribes everything, stops the
   *  owned music loop, and never calls `sound.stopAll()`. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.musicIntent += 1;
    this.desiredMusicKey = undefined;
    this.failedMusicKey = undefined;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.length = 0;
    this.currentMusic?.release();
    for (const voice of this.activeSfx.keys()) voice.release();
    this.currentMusic = undefined;
    this.currentMusicKey = undefined;
    this.pendingMusicKey = undefined;
    this.admissionPendingMusic = false;
    this.fade = undefined;
    this.retainedVoices.clear(); // Dead manager never allocates or retains entity/backend references again.
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
    const key = this.pendingMusicKey ?? this.failedMusicKey;
    if (key === undefined) return;
    this.pendingMusicKey = undefined;
    this.admissionPendingMusic = false;
    this.playMusic(key);
  };

  private isCurrentMusicIntent(intent: number): boolean {
    return !this.destroyed && intent === this.musicIntent;
  }

  private musicFadeGain(): number {
    const fade = this.fade;
    return fade ? clamp01(fade.fromGain * (1 - fade.elapsedMs / fade.durationMs)) : 1;
  }

  private advanceFade(dtMs: number): void {
    const fade = this.fade;
    const music = this.currentMusic;
    if (!fade || !music) return;
    fade.elapsedMs += dtMs;
    if (fade.elapsedMs >= fade.durationMs) {
      music.release();
      return;
    }
    this.applyVoiceGain(music, this.musicVolume * this.musicFadeGain());
  }

  /** Only an acquired voice can clear its own identity. Detach before calling
   *  Phaser destroy (which synchronously stops and emits destroy); never
   *  destroy again from an external destroy callback. No global stop/remove.
   *  Completion uses normal deferred Phaser removal so its sound-update
   *  iteration is not spliced while other voices are being updated. */
  private addVoice(key: string, kind: OwnedVoice['kind']): OwnedVoice | undefined {
    if (!this.hasHandleCapacity()) return undefined;
    let sound: SoundHandle;
    // Backend add may synchronously reenter before returning its new handle.
    this.allocatingHandles += 1;
    try {
      sound = this.scene.sound.add(key);
    } catch {
      return undefined; // Missing/failed backend stays optional and silent.
    } finally {
      this.allocatingHandles -= 1;
    }
    let restoreNativeStart: (() => void) | undefined;
    const forget = (): void => {
      if (voice.released) return;
      voice.released = true;
      restoreNativeStart?.();
      this.removeFromBlurResumeQueue(sound);
      sound.off('complete', complete);
      sound.off('destroy', forget);
      this.activeSfx.delete(voice);
      if (this.currentMusic === voice) {
        this.currentMusic = undefined;
        this.currentMusicKey = undefined;
        this.fade = undefined;
      }
    };
    const complete = (): void => voice.release();
    const voice: OwnedVoice = {
      kind,
      sound,
      released: false,
      release: (removeImmediately = false): void => {
        if (voice.released) return;
        forget();
        try {
          if (removeImmediately) {
            if (this.scene.sound.remove(sound)) this.retainedVoices.delete(voice);
          } else sound.destroy();
        } catch {
          // Audio teardown must not prevent terminal feedback or game teardown.
        }
      },
    };
    if (!this.destroyed) this.retainedVoices.add(voice);
    sound.on('complete', complete);
    sound.on('destroy', forget);
    restoreNativeStart = this.observeNativeStart(voice);
    return voice;
  }

  /** Only Phaser's actual retained array establishes physical removal. */
  private pruneRemovedVoices(): void {
    // Installed Phaser 3.90 exposes this on BaseSoundManager; its NoAudio
    // declaration omits the inherited field. Keep the narrow runtime guard.
    const sounds = (this.scene.sound as unknown as { readonly sounds?: readonly SoundHandle[] }).sounds;
    if (!Array.isArray(sounds)) return; // Malformed/absent optional backend fails closed at the finite ceiling.
    for (const voice of this.retainedVoices) {
      if (!sounds.includes(voice.sound)) this.retainedVoices.delete(voice);
    }
  }

  private hasHandleCapacity(): boolean {
    this.pruneRemovedVoices();
    return this.retainedVoices.size + this.allocatingHandles < RuntimeConfig.performance.maxAudioOwnedHandles;
  }

  private hasLiveRetiredMusic(): boolean {
    for (const voice of this.retainedVoices) {
      if (voice.kind === 'music' && voice.released && (voice.sound.isPlaying || voice.sound.isPaused)) return true;
    }
    return false;
  }

  private liveSfxCount(): number {
    let count = 0;
    for (const voice of this.retainedVoices) {
      // A failed backend retirement must not make a still-playing/paused tail free.
      if (voice.kind === 'sfx' && (!voice.released || voice.sound.isPlaying || voice.sound.isPaused)) count += 1;
    }
    return count;
  }

  private lowerPriorityVictim(priority: number): OwnedVoice | undefined {
    let victim: OwnedVoice | undefined;
    let lowest = priority;
    // Map insertion order provides oldest-first ties; music never enters this map.
    for (const [voice, state] of this.activeSfx) {
      if (state.priority < lowest) {
        victim = voice;
        lowest = state.priority;
      }
    }
    return victim;
  }

  /** Phaser 3.90 HTML5AudioSound.playCatchPromise has no failure event. This
   *  instance-only adapter retains its native play call and warning, including
   *  legacy no-Promise starts. WebAudio/NoAudio have no such method. Revalidate
   *  against installed Phaser source on upgrades; never patch shared tags or
   *  prototypes. Each resume/loop attempt supersedes its prior Promise. */
  private observeNativeStart(voice: OwnedVoice): (() => void) | undefined {
    type NativeSound = {
      audio: HTMLAudioElement | null;
      playCatchPromise?: () => void;
    };
    const sound = voice.sound as unknown as NativeSound;
    const original = sound.playCatchPromise;
    if (typeof original !== 'function') return undefined;
    const hadOwnMethod = Object.prototype.hasOwnProperty.call(sound, 'playCatchPromise');
    let attempt = 0;
    const observe = (): void => {
      const tag = sound.audio;
      const currentAttempt = ++attempt;
      // Match Phaser's synchronous throw/no-Promise behavior. startVoice owns
      // synchronous failure; only the native rejection owns the async path.
      const promise = tag!.play();
      if (promise) {
        promise.catch((reason: unknown) => {
          console.warn(reason);
          if (voice.released || attempt !== currentAttempt || sound.audio !== tag) return;
          // A terminal/fade or newer key may still need cleanup, but must never
          // turn this rejected old intent into a retry after the terminal.
          if (this.currentMusic === voice && this.currentMusicKey === this.desiredMusicKey && !this.fade) {
            this.failedMusicKey = this.currentMusicKey;
          }
          voice.release(true);
        });
      }
    };
    sound.playCatchPromise = observe;
    return (): void => {
      attempt += 1;
      // Restore only our own seam; preserve an external replacement, if any.
      if (sound.playCatchPromise !== observe) return;
      if (hadOwnMethod) sound.playCatchPromise = original;
      else delete sound.playCatchPromise;
    };
  }

  /** Phaser 3.90 HTML5 keeps a private blur-resume queue even after destroy.
   *  Its focus handler does not skip pendingRemove handles. Remove only this
   *  retiring identity; keep every unrelated paused sound and engine listener.
   *  WebAudio/NoAudio have no such queue. Real-manager tests pin this adapter. */
  private removeFromBlurResumeQueue(sound: SoundHandle): void {
    const queue = (this.scene.sound as unknown as { onBlurPausedSounds?: unknown }).onBlurPausedSounds;
    if (!Array.isArray(queue)) return;
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (queue[index] === sound) queue.splice(index, 1);
    }
  }

  private startVoice(voice: OwnedVoice, config: Phaser.Types.Sound.SoundConfig): boolean {
    try {
      if (voice.sound.play(config)) return true;
    } catch {
      // WebAudio start can throw; HTML5/NoAudio can return false.
    }
    voice.release(true);
    return false;
  }

  private applyVoiceGain(voice: OwnedVoice, volume: number): void {
    if (voice.released) return;
    try {
      voice.sound.setMute(this.muted);
      voice.sound.setVolume(clamp01(volume));
    } catch {
      voice.release();
    }
  }

  private reapStoppedVoice(voice: OwnedVoice): void {
    if (!voice.sound.isPlaying && !voice.sound.isPaused) voice.release();
  }

  /** Dev-only, at most once per key: missing or deleted assets never throw
   *  and never block boot (§11). */
  private warnOnce(key: string): void {
    if (!RuntimeConfig.isDev || this.warnedKeys.has(key)) return;
    this.warnedKeys.add(key);
    console.warn(`[AudioManager] Missing audio asset "${key}"`);
  }
}
