import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { AudioManager } from '../src/systems/audio';
import { createEventBus } from '../src/engine/eventBus';

// Import the installed 3.90 sound modules without importing Phaser's DOM boot.
// Backend objects are real; browser audio nodes/tags are small test doubles.
const require = createRequire(import.meta.url);
const NoAudioManager = require('phaser/src/sound/noaudio/NoAudioSoundManager.js') as typeof Phaser.Sound.NoAudioSoundManager;
const HtmlSound = require('phaser/src/sound/html5/HTML5AudioSound.js') as typeof Phaser.Sound.HTML5AudioSound;
const HtmlManager = require('phaser/src/sound/html5/HTML5AudioSoundManager.js') as new(game: unknown) => HtmlManagerHarness;
const WebSound = require('phaser/src/sound/webaudio/WebAudioSound.js') as typeof Phaser.Sound.WebAudioSound;
const BaseManager = require('phaser/src/sound/BaseSoundManager.js') as {
  prototype: { update(time: number, delta: number): void; remove(sound: unknown): boolean };
};
const settings = { muted: false, musicVolume: 0.7, sfxVolume: 0.8, reducedMotion: false };

type Sound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;

class AudioTag {
  dataset = { used: 'false' };
  duration = 1;
  currentTime = 0;
  paused = true;
  muted = false;
  volume = 1;
  playbackRate = 1;
  play(): void { this.paused = false; }
  pause(): void { this.paused = true; }
}

class AudioNode {
  readonly gain = { value: 1, setValueAtTime: (value: number): void => { this.gain.value = value; } };
  readonly playbackRate = { setValueAtTime: vi.fn() };
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly start = vi.fn();
  readonly stop = vi.fn();
  onended?: (event: { target: AudioNode }) => void;
}

class BackendManager extends EventEmitter {
  readonly sounds: Sound[] = [];
  readonly tags = new Map<string, AudioTag[]>();
  readonly nodes: AudioNode[] = [];
  readonly context = {
    currentTime: 0,
    createGain: (): AudioNode => new AudioNode(),
    createBufferSource: (): AudioNode => {
      const node = new AudioNode();
      this.nodes.push(node);
      return node;
    },
  };
  readonly destination = {};
  readonly game = { cache: { audio: { get: (key: string) => {
    if (this.backend === 'web') return { duration: 1 };
    if (!this.tags.has(key)) this.tags.set(key, [new AudioTag()]);
    return this.tags.get(key);
  } } } };
  locked = false;
  mute = false;
  volume = 1;
  rate = 1;
  detune = 0;
  override = true;
  loopEndOffset = 0;
  audioPlayDelay = 0;

  constructor(private readonly backend: 'web' | 'html') { super(); }
  isLocked(): boolean { return this.locked; }
  add(key: string): Sound {
    const sound = this.backend === 'web'
      ? new WebSound(this as never, key)
      : new HtmlSound(this as never, key);
    this.sounds.push(sound);
    return sound;
  }
  remove(sound: Sound): boolean { return BaseManager.prototype.remove.call(this, sound); }
  forEachActiveSound(callback: (sound: Sound) => void, scope?: unknown): void {
    for (const sound of this.sounds) if (!sound.pendingRemove) callback.call(scope, sound);
  }
  tick(): void { BaseManager.prototype.update.call(this, 0, 16); }
}

// Use the complete installed HTML5 manager for blur/focus queue ownership.
interface HtmlManagerHarness {
  readonly sounds: Phaser.Sound.HTML5AudioSound[];
  readonly onBlurPausedSounds: Phaser.Sound.HTML5AudioSound[];
  add(key: string): Phaser.Sound.HTML5AudioSound;
  onGameBlur(): void;
  onGameFocus(): void;
  update(time: number, delta: number): void;
  destroy(): void;
}

function htmlManager(): HtmlManagerHarness {
  vi.stubGlobal('window', { performance: { now: () => 0 } });
  const tags = new Map<string, AudioTag[]>();
  return new HtmlManager({
    events: new EventEmitter(),
    cache: { json: {}, audio: { get: (key: string) => {
      if (!tags.has(key)) tags.set(key, [new AudioTag()]);
      return tags.get(key);
    } } },
  });
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function initialize(sound: unknown): AudioManager {
  const audio = new AudioManager({ sound, cache: { audio: { exists: () => true } } } as never);
  audio.init(createEventBus(), settings, { assets: { sfx: [], music: [] }, map: [] });
  return audio;
}

describe('AudioManager with installed Phaser 3.90 sound backends', () => {
  it('does not retain failed NoAudio handles even without a manager update loop', () => {
    const sound = new NoAudioManager({} as never);
    const audio = initialize(sound);
    for (let i = 0; i < 20; i += 1) {
      audio.play('sfx-test');
      audio.playMusic('music-run');
    }
    expect((sound as unknown as { sounds: unknown[] }).sounds).toHaveLength(0);
    expect(() => audio.destroy()).not.toThrow();
  });

  it.each(['web', 'html'] as const)('%s: releases music replacements, fades and mute-retired SFX', (backend) => {
    const sound = new BackendManager(backend);
    const audio = initialize(sound);
    audio.playMusic('music-run');
    expect(sound.sounds[0].isPlaying).toBe(true);
    const original = sound.sounds[0];
    audio.playMusic('music-menu');
    expect(original.pendingRemove).toBe(true);
    sound.tick();
    expect(sound.sounds).toHaveLength(1);
    audio.stopMusic(100);
    audio.update(50);
    audio.applySettings({ ...settings, musicVolume: 0.2 });
    expect(sound.sounds[0].volume).toBeCloseTo(0.1);
    audio.update(50);
    sound.tick();
    expect(sound.sounds).toHaveLength(0);
    audio.play('sfx-test', 0.5);
    audio.applySettings({ ...settings, sfxVolume: 0.4 });
    expect(sound.sounds[0].volume).toBeCloseTo(0.2);
    audio.applySettings({ ...settings, muted: true });
    sound.tick();
    expect(sound.sounds).toHaveLength(0);
    audio.destroy();
  });

  it.each(['web', 'html'] as const)('%s: completion destroys every ended voice without skipping manager iteration', (backend) => {
    const sound = new BackendManager(backend);
    const audio = initialize(sound);
    audio.play('sfx-first');
    audio.play('sfx-second');
    const voices = [...sound.sounds];
    if (backend === 'web') {
      for (const node of sound.nodes) node.onended?.({ target: node });
    } else {
      for (const tags of sound.tags.values()) tags[0].currentTime = 1;
    }
    sound.tick();
    expect(voices.every((voice) => voice.pendingRemove)).toBe(true);
    expect(voices.every((voice) => voice.listenerCount('complete') === 0)).toBe(true);
    sound.tick();
    expect(sound.sounds).toHaveLength(0);
    audio.destroy();
  });

  it('retires an actual HTML5 tag-hijacked voice without destroying its replacement', () => {
    const sound = new BackendManager('html');
    const audio = initialize(sound);
    audio.play('sfx-test');
    const original = sound.sounds[0];
    audio.play('sfx-test');
    const replacement = sound.sounds[1];
    expect(original.isPlaying).toBe(false);
    expect(replacement.isPlaying).toBe(true);
    audio.update(16);
    sound.tick();
    expect(sound.sounds).toEqual([replacement]);
    expect(replacement.isPlaying).toBe(true);
    audio.destroy();
  });

  it('releases an actual HTML5 tag-exhaustion failure immediately', () => {
    const sound = new BackendManager('html');
    sound.override = false;
    const audio = initialize(sound);
    audio.play('sfx-test');
    const first = sound.sounds[0];
    audio.play('sfx-test');
    expect(sound.sounds).toEqual([first]);
    expect(first.isPlaying).toBe(true);
    audio.destroy();
  });

  it('releases an actual WebAudio start failure and allows the same key to retry', () => {
    const sound = new BackendManager('web');
    const audio = initialize(sound);
    vi.spyOn(sound.context, 'createBufferSource').mockImplementationOnce(() => {
      throw new Error('Audio context unavailable');
    });
    expect(() => audio.playMusic('music-run')).not.toThrow();
    expect(sound.sounds).toHaveLength(0);
    audio.playMusic('music-run');
    expect(sound.sounds[0].isPlaying).toBe(true);
    audio.destroy();
  });

  it.each(['web', 'html'] as const)('%s: external sound destruction clears only its own ownership', (backend) => {
    const sound = new BackendManager(backend);
    const audio = initialize(sound);
    audio.playMusic('music-run');
    const first = sound.sounds[0];
    expect(() => first.destroy()).not.toThrow();
    audio.playMusic('music-run');
    sound.tick();
    expect(sound.sounds).toHaveLength(1);
    expect(sound.sounds[0]).not.toBe(first);
    audio.destroy();
  });
});


describe('AudioManager real HTML5 interruption and reentrant ownership', () => {
  it.each(['fade', 'mute', 'replacement', 'teardown', 'external-destroy'] as const)(
    'retires %s while blurred without resuming a dead handle or disturbing unrelated audio', (action) => {
      const sound = htmlManager();
      const audio = initialize(sound);
      const unrelated = sound.add('unrelated');
      unrelated.play({ loop: true });
      if (action === 'mute') audio.play('sfx-tail');
      else audio.playMusic('music-run');
      const retiring = sound.sounds[1];
      if (action === 'fade') audio.stopMusic(100);
      sound.onGameBlur();
      expect(sound.onBlurPausedSounds).toEqual([unrelated, retiring]);
      if (action === 'fade') audio.update(100);
      else if (action === 'mute') audio.applySettings({ ...settings, muted: true });
      else if (action === 'replacement') audio.playMusic('music-menu');
      else if (action === 'teardown') audio.destroy();
      else retiring.destroy();
      expect(retiring.pendingRemove).toBe(true);
      expect(() => sound.onGameFocus()).not.toThrow();
      expect(unrelated.isPlaying).toBe(true);
      expect(unrelated.pendingRemove).toBe(false);
      expect(sound.onBlurPausedSounds).toHaveLength(0);
      audio.destroy();
      sound.destroy();
    },
  );

  it('preserves ordinary blur/focus resumption of owned music and SFX', () => {
    const sound = htmlManager();
    const audio = initialize(sound);
    audio.playMusic('music-run');
    audio.play('sfx-tail');
    const voices = [...sound.sounds];
    sound.onGameBlur();
    audio.update(100);
    expect(voices.every((voice) => voice.isPaused && !voice.pendingRemove)).toBe(true);
    sound.onGameFocus();
    expect(voices.every((voice) => voice.isPlaying && !voice.pendingRemove)).toBe(true);
    audio.destroy();
    sound.destroy();
  });

  it.each(['stop', 'destroy'] as const)('%s callbacks cannot let obsolete replacement override a newer play, stop or teardown', (event) => {
    for (const action of ['play', 'stop', 'destroy'] as const) {
      const sound = htmlManager();
      const audio = initialize(sound);
      audio.playMusic('music-old');
      sound.sounds[0].once(event, () => {
        if (action === 'play') audio.playMusic('music-newer');
        else if (action === 'stop') audio.stopMusic();
        else audio.destroy();
      });
      audio.playMusic('music-outer');
      sound.update(0, 16);
      expect(sound.sounds.filter((voice) => voice.isPlaying).map((voice) => voice.key))
        .toEqual(action === 'play' ? ['music-newer'] : []);
      audio.destroy();
      sound.update(0, 16);
      expect(sound.sounds).toHaveLength(0);
      sound.destroy();
    }
  });

  it.each(['play', 'stop', 'destroy'] as const)('rechecks %s intent after a synchronous add hook', (action) => {
    const sound = htmlManager();
    const audio = initialize(sound);
    const add = sound.add.bind(sound);
    vi.spyOn(sound, 'add').mockImplementationOnce((key) => {
      const voice = add(key);
      if (action === 'play') audio.playMusic('music-newer');
      else if (action === 'stop') audio.stopMusic();
      else audio.destroy();
      return voice;
    });
    audio.playMusic('music-outer');
    sound.update(0, 16);
    expect(sound.sounds.filter((voice) => voice.isPlaying).map((voice) => voice.key))
      .toEqual(action === 'play' ? ['music-newer'] : []);
    audio.destroy();
    sound.update(0, 16);
    expect(sound.sounds).toHaveLength(0);
    sound.destroy();
  });

  it.each(['mute', 'destroy'] as const)('does not start a newly acquired SFX after %s during add', (action) => {
    const sound = htmlManager();
    const audio = initialize(sound);
    const add = sound.add.bind(sound);
    vi.spyOn(sound, 'add').mockImplementationOnce((key) => {
      const voice = add(key);
      if (action === 'mute') audio.applySettings({ ...settings, muted: true });
      else audio.destroy();
      return voice;
    });
    audio.play('sfx-tail');
    expect(sound.sounds).toHaveLength(0);
    audio.destroy();
    sound.destroy();
  });

  it('rechecks music intent after reaping a stopped voice', () => {
    const sound = htmlManager();
    const audio = initialize(sound);
    audio.playMusic('music-old');
    sound.sounds[0].stop();
    sound.sounds[0].once('destroy', () => audio.playMusic('music-newer'));
    audio.playMusic('music-outer');
    sound.update(0, 16);
    expect(sound.sounds.map((voice) => voice.key)).toEqual(['music-newer']);
    audio.destroy();
    sound.update(0, 16);
    expect(sound.sounds).toHaveLength(0);
    sound.destroy();
  });

  it.each(['play', 'stop', 'destroy'] as const)('preserves %s intent from a synchronous play callback', (action) => {
    const sound = htmlManager();
    const audio = initialize(sound);
    const add = sound.add.bind(sound);
    vi.spyOn(sound, 'add').mockImplementationOnce((key) => {
      const voice = add(key);
      voice.once('play', () => {
        if (action === 'play') audio.playMusic('music-newer');
        else if (action === 'stop') audio.stopMusic();
        else audio.destroy();
      });
      return voice;
    });
    audio.playMusic('music-outer');
    sound.update(0, 16);
    expect(sound.sounds.filter((voice) => voice.isPlaying).map((voice) => voice.key))
      .toEqual(action === 'play' ? ['music-newer'] : []);
    audio.destroy();
    sound.update(0, 16);
    expect(sound.sounds).toHaveLength(0);
    sound.destroy();
  });

  it('preserves a newer fade requested by a synchronous play callback', () => {
    const sound = htmlManager();
    const audio = initialize(sound);
    const add = sound.add.bind(sound);
    vi.spyOn(sound, 'add').mockImplementationOnce((key) => {
      const voice = add(key);
      voice.once('play', () => audio.stopMusic(100));
      return voice;
    });
    audio.playMusic('music-run');
    expect(sound.sounds[0].isPlaying).toBe(true);
    audio.update(50);
    expect(sound.sounds[0].volume).toBeCloseTo(0.35);
    audio.update(50);
    sound.update(0, 16);
    expect(sound.sounds).toHaveLength(0);
    audio.destroy();
    sound.destroy();
  });

  it('characterizes inherited HTML5 promise rejection: synchronous success can leave same-key intent latched', async () => {
    const sound = htmlManager();
    const audio = initialize(sound);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = new Error('Browser denied playback');
    vi.spyOn(AudioTag.prototype, 'play').mockImplementation(() => Promise.reject(failure));
    audio.playMusic('music-run');
    await Promise.resolve();
    sound.update(0, 16);
    audio.update(16);
    const voice = sound.sounds[0];
    expect(voice.isPlaying).toBe(true); // Phaser reports acceptance, not audible playback.
    expect(voice.audio?.paused).toBe(true);
    expect(warning).toHaveBeenCalledWith(failure);
    audio.playMusic('music-run');
    expect(sound.sounds).toEqual([voice]); // Known limitation; no automatic retry is claimed.
    audio.destroy();
    sound.destroy();
  });
});
