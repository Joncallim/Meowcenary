import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createEventBus, type EventBus } from '../src/engine/eventBus';
import { AudioManager } from '../src/systems/audio';
import type { AudioMapEntry, AudioData } from '../src/systems/types';
import type { Settings } from '../src/systems/save';

// AudioManager is runtime-Phaser-free (type-only imports), so the harness
// below is pure TS: a fake scene exposing a fake sound manager + audio cache,
// and the real createEventBus for bus wiring.

const ALL_KEYS = new Set([
  'sfx-weapon-fired',
  'sfx-projectile-hit',
  'sfx-enemy-killed',
  'sfx-run-won',
  'sfx-run-lost',
  'sfx-ui-confirm',
  'music-menu',
  'music-run',
]);

const DEFAULT_MAP: readonly AudioMapEntry[] = [
  { event: 'weapon:fired', sfxKey: 'sfx-weapon-fired', cooldownMs: 90 },
  { event: 'run:won', sfxKey: 'sfx-run-won', stopMusic: true, musicFadeMs: 600 },
];

const SETTINGS: Settings = {
  muted: false,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  reducedMotion: false,
};

const WEAPON_FIRED = { weaponId: 'w1', x: 0, y: 0 } as const;
const RUN_WON = { timeMs: 60_000, level: 5, kills: 10 } as const;

class FakeAudioCache {
  constructor(private readonly keys: ReadonlySet<string>) {}

  exists(key: string): boolean {
    return this.keys.has(key);
  }
}

class FakeSound {
  readonly key: string;
  isPlaying = false;
  volume = 1;
  mute = false;
  readonly playCalls: Array<Record<string, unknown>> = [];

  constructor(key: string, private readonly log?: string[]) {
    this.key = key;
  }

  play(config?: Record<string, unknown>): this {
    this.isPlaying = true;
    // Phaser applies the play config to the sound instance; the fake mirrors
    // that so volume/mute state reflects the last play call.
    if (typeof config?.volume === 'number') this.volume = config.volume;
    if (typeof config?.mute === 'boolean') this.mute = config.mute;
    this.playCalls.push(config ?? {});
    return this;
  }

  stop(): this {
    this.isPlaying = false;
    this.log?.push('stop');
    return this;
  }

  setVolume(volume: number): this {
    this.volume = volume;
    return this;
  }

  setMute(mute: boolean): this {
    this.mute = mute;
    return this;
  }
}

class FakeSoundManager {
  locked = false;
  unlockCalls = 0;
  stopAllCalls = 0;
  readonly playedSfx: Array<{ key: string; config: Record<string, unknown> }> = [];
  readonly added: FakeSound[] = [];
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(private readonly log?: string[]) {}

  on(event: string, listener: (...args: unknown[]) => void): this {
    const set = this.listeners.get(event) ?? [];
    set.push(listener);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    const set = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      set.filter((candidate) => candidate !== listener),
    );
    return this;
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      listener(...args);
    }
  }

  play(key: string, config?: Record<string, unknown>): boolean {
    this.playedSfx.push({ key, config: config ?? {} });
    this.log?.push(`play:${key}`);
    return true;
  }

  add(key: string): FakeSound {
    const sound = new FakeSound(key, this.log);
    this.added.push(sound);
    return sound;
  }

  unlock(): void {
    this.unlockCalls += 1;
  }

  stopAll(): void {
    this.stopAllCalls += 1;
  }
}

interface Harness {
  audio: AudioManager;
  bus: EventBus;
  sound: FakeSoundManager;
}

function createHarness(
  map: readonly AudioMapEntry[] = DEFAULT_MAP,
  log?: string[],
): Harness {
  const bus = createEventBus();
  const sound = new FakeSoundManager(log);
  const scene = { sound, cache: { audio: new FakeAudioCache(ALL_KEYS) } } as never;
  const audio = new AudioManager(scene);
  audio.init(bus, SETTINGS, { assets: { sfx: [], music: [] }, map });
  return { audio, bus, sound };
}

function audioData(map: readonly AudioMapEntry[]): AudioData {
  return { assets: { sfx: [], music: [] }, map };
}

let warnSpy: MockInstance;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('AudioManager init', () => {
  it('throws when init is called twice', () => {
    const bus = createEventBus();
    const sound = new FakeSoundManager();
    const scene = { sound, cache: { audio: new FakeAudioCache(ALL_KEYS) } } as never;
    const audio = new AudioManager(scene);
    audio.init(bus, SETTINGS, audioData(DEFAULT_MAP));
    expect(() => audio.init(bus, SETTINGS, audioData(DEFAULT_MAP))).toThrow(/twice/);
  });

  it('no-ops every API call before init', () => {
    const sound = new FakeSoundManager();
    const scene = { sound, cache: { audio: new FakeAudioCache(ALL_KEYS) } } as never;
    const audio = new AudioManager(scene);
    audio.play('sfx-weapon-fired');
    audio.playMusic('music-run');
    audio.stopMusic(100);
    audio.applySettings(SETTINGS);
    audio.update(16);
    sound.locked = true; // even a locked sound manager is never poked pre-init
    audio.unlock();
    expect(sound.playedSfx).toHaveLength(0);
    expect(sound.added).toHaveLength(0);
    expect(sound.unlockCalls).toBe(0);
  });
});

describe('AudioManager mapped SFX', () => {
  it('dispatches the mapped sfx with the current sfx volume', () => {
    const { bus, sound } = createHarness();

    bus.emit('weapon:fired', WEAPON_FIRED);

    expect(sound.playedSfx).toEqual([{ key: 'sfx-weapon-fired', config: { volume: 0.8 } }]);
  });

  it('rate-limits a mapped key through the update-driven clock', () => {
    const { audio, bus, sound } = createHarness();

    bus.emit('weapon:fired', WEAPON_FIRED); // now = 0 → plays
    expect(sound.playedSfx).toHaveLength(1);

    audio.update(50); // now = 50, still on cooldown
    bus.emit('weapon:fired', WEAPON_FIRED);
    audio.update(39); // now = 89, still blocked
    bus.emit('weapon:fired', WEAPON_FIRED);
    expect(sound.playedSfx).toHaveLength(1);

    audio.update(1); // now = 90 → exact boundary plays
    bus.emit('weapon:fired', WEAPON_FIRED);
    expect(sound.playedSfx).toHaveLength(2);
  });

  it('does not consume the cooldown while muted', () => {
    const { audio, bus, sound } = createHarness();

    bus.emit('weapon:fired', WEAPON_FIRED); // now = 0 → plays, cooldown starts
    audio.applySettings({ ...SETTINGS, muted: true });
    bus.emit('weapon:fired', WEAPON_FIRED); // muted → dropped, no cooldown write
    audio.applySettings({ ...SETTINGS, muted: false });
    audio.update(45); // now = 45 < 90 — the muted play must not have reset the window
    bus.emit('weapon:fired', WEAPON_FIRED);
    expect(sound.playedSfx).toHaveLength(1);

    audio.update(45); // now = 90 → boundary plays
    bus.emit('weapon:fired', WEAPON_FIRED);
    expect(sound.playedSfx).toHaveLength(2);
  });

  it('drops one-shots while locked, never queueing them', () => {
    const { bus, sound } = createHarness();

    sound.locked = true;
    bus.emit('weapon:fired', WEAPON_FIRED);
    expect(sound.playedSfx).toHaveLength(0);

    sound.locked = false;
    bus.emit('weapon:fired', WEAPON_FIRED); // same nowMs — nothing was recorded while locked
    expect(sound.playedSfx).toHaveLength(1);
  });

  it('ignores non-finite, negative, and zero dtMs on the cooldown clock', () => {
    const { audio, bus, sound } = createHarness();

    bus.emit('weapon:fired', WEAPON_FIRED); // now = 0 → plays
    audio.update(Number.NaN);
    audio.update(Number.POSITIVE_INFINITY);
    audio.update(-10);
    audio.update(0);
    bus.emit('weapon:fired', WEAPON_FIRED); // now still 0 → cooldown blocks
    expect(sound.playedSfx).toHaveLength(1);

    audio.update(90);
    bus.emit('weapon:fired', WEAPON_FIRED);
    expect(sound.playedSfx).toHaveLength(2);
  });
});

describe('AudioManager music', () => {
  it('starts a looping music instance at the music volume', () => {
    const { audio, sound } = createHarness();

    audio.playMusic('music-run');

    expect(sound.added).toHaveLength(1);
    expect(sound.added[0].playCalls).toEqual([{ loop: true, volume: 0.7, mute: false }]);
  });

  it('treats a repeated playMusic of the current key as a no-op', () => {
    const { audio, sound } = createHarness();

    audio.playMusic('music-run');
    audio.playMusic('music-run');

    expect(sound.added).toHaveLength(1);
  });

  it('stops the previous loop when switching music', () => {
    const { audio, sound } = createHarness();

    audio.playMusic('music-run');
    const runMusic = sound.added[0];
    audio.playMusic('music-menu');

    expect(runMusic.isPlaying).toBe(false);
    expect(sound.added).toHaveLength(2);
    expect(sound.added[1].isPlaying).toBe(true);
  });

  it('defers music while locked and flushes exactly once on unlock', () => {
    const { audio, sound } = createHarness();

    sound.locked = true;
    audio.playMusic('music-run');
    audio.playMusic('music-run'); // same key while pending — no-op
    audio.playMusic('music-menu'); // replaces the pending key
    expect(sound.added).toHaveLength(0);

    // Phaser's real order: locked clears, then 'unlocked' emits on the tick.
    sound.locked = false;
    sound.emit('unlocked');
    expect(sound.added).toHaveLength(1);
    expect(sound.added[0].key).toBe('music-menu');

    sound.emit('unlocked'); // nothing pending anymore — no second flush
    expect(sound.added).toHaveLength(1);
  });

  it('stops music immediately when fadeMs is not positive', () => {
    const { audio, sound } = createHarness();

    audio.playMusic('music-run');
    audio.stopMusic();
    expect(sound.added[0].isPlaying).toBe(false);

    audio.playMusic('music-run');
    audio.stopMusic(0);
    expect(sound.added[1].isPlaying).toBe(false);
  });

  it('treats stopMusic without current music as a no-op', () => {
    const { audio } = createHarness();

    expect(() => audio.stopMusic(500)).not.toThrow();
  });

  it('treats non-finite fadeMs as an immediate stop', () => {
    const { audio, sound } = createHarness();

    audio.playMusic('music-run');
    audio.stopMusic(Number.NaN);
    expect(sound.added[0].isPlaying).toBe(false);

    audio.playMusic('music-run');
    audio.stopMusic(Number.POSITIVE_INFINITY);
    expect(sound.added[1].isPlaying).toBe(false);

    audio.playMusic('music-run');
    audio.stopMusic(Number.NEGATIVE_INFINITY);
    expect(sound.added[2].isPlaying).toBe(false);

    // undefined coerces to NaN under Number.isFinite — the defensive path
    // that would otherwise create a broken, never-completing fade.
    audio.playMusic('music-run');
    audio.stopMusic(undefined as unknown as number);
    expect(sound.added[3].isPlaying).toBe(false);
  });

  it('clamps a non-finite music volume before the fade ramp', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const { audio, sound } = createHarness();

      audio.playMusic('music-run');
      const music = sound.added[0];
      // A rogue MusicLoop instance (the manager does not control its
      // volume): the value must never leak into the fade ramp.
      music.volume = value;

      audio.stopMusic(300);
      audio.update(150); // t = 1/2 → fromVolume * 0.5, never NaN
      expect(music.volume).toBe(0);

      audio.update(150);
      expect(music.isPlaying).toBe(false);
    }
  });

  it('ramps the volume down over the fade and stops at completion', () => {
    const { audio, sound } = createHarness();

    audio.playMusic('music-run');
    const music = sound.added[0];
    expect(music.volume).toBe(0.7);

    audio.stopMusic(600);
    audio.update(300);
    expect(music.volume).toBeCloseTo(0.35);
    expect(music.isPlaying).toBe(true);

    audio.update(300);
    expect(music.isPlaying).toBe(false);
    expect(music.volume).toBeCloseTo(0.35); // no further ramp after completion
  });

  it('restarts the fade ramp from the current volume on a repeated stopMusic', () => {
    const { audio, sound } = createHarness();

    audio.playMusic('music-run');
    const music = sound.added[0];

    audio.stopMusic(600);
    audio.update(200); // t = 1/3 → volume ≈ 0.7 * 2/3
    const mid = music.volume;

    audio.stopMusic(300); // ramp restarts from the current volume
    audio.update(150); // t = 1/2
    expect(music.volume).toBeCloseTo(mid / 2);
    expect(music.isPlaying).toBe(true);

    audio.update(150);
    expect(music.isPlaying).toBe(false);
  });

  it('stops a fading loop immediately when a new music key starts', () => {
    const { audio, sound } = createHarness();

    audio.playMusic('music-run');
    const runMusic = sound.added[0];
    audio.stopMusic(600);
    audio.update(100);

    audio.playMusic('music-menu');

    expect(runMusic.isPlaying).toBe(false);
    expect(sound.added[1].isPlaying).toBe(true);
  });
});

describe('AudioManager settings', () => {
  it('reacts to settings:changed with live applySettings', () => {
    const { audio, bus, sound } = createHarness();

    audio.playMusic('music-run');
    const music = sound.added[0];
    bus.emit('settings:changed', { settings: { ...SETTINGS, muted: true } });

    expect(music.mute).toBe(true);
  });

  it('applies mute mid-fade but never fights the volume ramp', () => {
    const { audio, sound } = createHarness();

    audio.playMusic('music-run');
    const music = sound.added[0];
    audio.stopMusic(600);

    audio.applySettings({ ...SETTINGS, muted: true, musicVolume: 0.3 });

    expect(music.mute).toBe(true);
    expect(music.volume).toBe(0.7); // the fade owns the volume

    audio.update(600); // fade completes
    audio.playMusic('music-menu'); // the next loop uses the new settings
    expect(sound.added[1].playCalls[0]).toEqual({ loop: true, volume: 0.3, mute: true });
  });

  it('applies a new sfx volume to subsequent one-shots', () => {
    const { audio, bus, sound } = createHarness();

    audio.applySettings({ ...SETTINGS, sfxVolume: 0.25 });
    bus.emit('weapon:fired', WEAPON_FIRED);

    expect(sound.playedSfx[0].config.volume).toBe(0.25);
  });

  it('clamps volume settings into [0, 1]', () => {
    const { audio, bus, sound } = createHarness();

    audio.applySettings({ ...SETTINGS, sfxVolume: 5, musicVolume: -2 });
    bus.emit('weapon:fired', WEAPON_FIRED);
    expect(sound.playedSfx[0].config.volume).toBe(1);

    audio.playMusic('music-run');
    expect(sound.added[0].playCalls[0].volume).toBe(0);
  });

  it('clamps non-finite volume settings to 0', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const { audio, bus, sound } = createHarness();

      audio.applySettings({ ...SETTINGS, sfxVolume: value, musicVolume: value });
      bus.emit('weapon:fired', WEAPON_FIRED);
      expect(sound.playedSfx[0].config.volume).toBe(0);

      audio.playMusic('music-run');
      expect(sound.added[0].playCalls[0].volume).toBe(0);
    }
  });
});

describe('AudioManager run-end mapping', () => {
  it('leaves music playing on SFX-only events and fades only on stopMusic entries', () => {
    const { audio, bus, sound } = createHarness();

    audio.playMusic('music-run');
    const music = sound.added[0];

    // weapon:fired has no stopMusic opt-in — it must never touch the loop.
    bus.emit('weapon:fired', WEAPON_FIRED);
    expect(music.isPlaying).toBe(true);

    // run:won opts in — the music fades under the stinger.
    bus.emit('run:won', RUN_WON);
    expect(sound.playedSfx).toEqual([
      { key: 'sfx-weapon-fired', config: { volume: 0.8 } },
      { key: 'sfx-run-won', config: { volume: 0.8 } },
    ]);
    expect(music.isPlaying).toBe(true);

    audio.update(600);
    expect(music.isPlaying).toBe(false);
  });

  it('fades the run music under the terminal stinger', () => {
    const { audio, bus, sound } = createHarness();

    audio.playMusic('music-run');
    const music = sound.added[0];

    bus.emit('run:won', RUN_WON);

    // The stinger dispatches while the music is still fading, not hard-stopped.
    expect(sound.playedSfx).toEqual([{ key: 'sfx-run-won', config: { volume: 0.8 } }]);
    expect(music.isPlaying).toBe(true);

    audio.update(600);
    expect(music.isPlaying).toBe(false);
  });

  it('handles a stopMusic-only entry without sfxKey', () => {
    const map: readonly AudioMapEntry[] = [
      { event: 'run:won', stopMusic: true, musicFadeMs: 300 },
    ];
    const { audio, bus, sound } = createHarness(map);

    audio.playMusic('music-run');
    bus.emit('run:won', RUN_WON);

    // No sfxKey — nothing dispatches; the stopMusic branch acts alone.
    expect(sound.playedSfx).toHaveLength(0);
    // The music is in a fade, never hard-stopped.
    expect(sound.added[0].isPlaying).toBe(true);

    audio.update(300);
    expect(sound.added[0].isPlaying).toBe(false);
  });

  it('applies stopMusic before the stinger dispatch, in that order', () => {
    const log: string[] = [];
    const map: readonly AudioMapEntry[] = [
      { event: 'run:won', sfxKey: 'sfx-run-won', stopMusic: true },
    ];
    const { audio, bus } = createHarness(map, log);

    audio.playMusic('music-run'); // stopMusic only acts on current music (§8)
    bus.emit('run:won', RUN_WON);

    expect(log).toEqual(['stop', 'play:sfx-run-won']);
  });
});

describe('AudioManager missing assets', () => {
  it('logs once and drops a missing sfx without throwing', () => {
    const { audio, sound } = createHarness();

    audio.play('sfx-does-not-exist');
    audio.play('sfx-does-not-exist');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(sound.playedSfx).toHaveLength(0);
  });

  it('logs once and drops a missing music key, which never becomes pending', () => {
    const { audio, sound } = createHarness();

    audio.playMusic('music-does-not-exist');
    audio.playMusic('music-does-not-exist');
    expect(sound.added).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    sound.locked = true;
    audio.playMusic('music-does-not-exist');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    audio.playMusic('music-run'); // a valid key still defers normally
    sound.locked = false;
    sound.emit('unlocked');
    expect(sound.added).toHaveLength(1);
  });

  it('drops a missing pending music key on the unlock flush', () => {
    const { audio, sound } = createHarness();

    sound.locked = true;
    audio.playMusic('music-does-not-exist');
    sound.locked = false;
    sound.emit('unlocked');

    expect(sound.added).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('AudioManager unlock and destroy', () => {
  it('delegates unlock only while the sound manager reports locked', () => {
    const { audio, sound } = createHarness();

    sound.locked = true;
    audio.unlock();
    audio.unlock(); // safe to repeat — Phaser arms listeners asynchronously
    expect(sound.unlockCalls).toBe(2);

    sound.locked = false;
    audio.unlock();
    expect(sound.unlockCalls).toBe(2);

    audio.destroy();
    audio.unlock();
    expect(sound.unlockCalls).toBe(2);
  });

  it('destroy stops music, unsubscribes, never calls stopAll, and is idempotent', () => {
    const { audio, bus, sound } = createHarness();

    audio.playMusic('music-run');
    const music = sound.added[0];
    audio.destroy();

    expect(music.isPlaying).toBe(false);
    expect(sound.listenerCount('unlocked')).toBe(0);
    expect(sound.stopAllCalls).toBe(0);

    // Post-destroy everything is inert: bus emits dispatch nothing and the
    // sound manager sees no new calls.
    bus.emit('weapon:fired', WEAPON_FIRED);
    bus.emit('run:won', RUN_WON);
    sound.emit('unlocked');
    audio.play('sfx-weapon-fired');
    audio.playMusic('music-run');
    audio.stopMusic(100);
    audio.applySettings(SETTINGS);
    audio.update(16);
    expect(sound.playedSfx).toHaveLength(0);
    expect(sound.added).toHaveLength(1);

    audio.destroy(); // idempotent
    expect(sound.stopAllCalls).toBe(0);
  });
});
