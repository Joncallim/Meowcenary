import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import audioAssetsJson from '../src/data/audio-assets.json';

// Slice 5 asset conformance (§8.3, §8.5 of
// docs/architecture/epic-10-audio-remainder.md): the generated placeholder
// WAVs must match the catalog one-to-one and carry the exact canonical
// 16-bit mono 8 kHz PCM header.

const AUDIO_DIR = join(process.cwd(), 'public', 'assets', 'audio');
const SAMPLE_RATE = 8000;
const HEADER_SIZE = 44;

const rows = [...audioAssetsJson.sfx, ...audioAssetsJson.music];

function readWav(key: string): Buffer {
  return readFileSync(join(AUDIO_DIR, `${key}.wav`));
}

describe('audio placeholder assets', () => {
  it('maps every catalog URL one-to-one to an existing file', () => {
    const urls = rows.map((row) => row.url);
    expect(new Set(urls).size).toBe(rows.length);

    for (const row of rows) {
      // URLs are public-relative ("assets/audio/<key>.wav").
      expect(basename(row.url)).toBe(`${row.key}.wav`);
      expect(existsSync(join(AUDIO_DIR, basename(row.url)))).toBe(true);
    }
  });

  it('contains exactly the declared .wav keys and nothing else', () => {
    const expected = rows.map((row) => `${row.key}.wav`).sort();
    const actual = readdirSync(AUDIO_DIR)
      .filter((name) => name.endsWith('.wav'))
      .sort();
    expect(actual).toEqual(expected);
  });

  it.each(rows.map((row) => row.key))('encodes %s with the exact canonical header', (key) => {
    const file = readWav(key);
    const dataBytes = file.length - HEADER_SIZE;

    expect(file.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(file.readUInt32LE(4)).toBe(36 + dataBytes);
    expect(file.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(file.subarray(12, 16).toString('ascii')).toBe('fmt ');
    expect(file.readUInt32LE(16)).toBe(16);
    expect(file.readUInt16LE(20)).toBe(1); // PCM
    expect(file.readUInt16LE(22)).toBe(1); // mono
    expect(file.readUInt32LE(24)).toBe(SAMPLE_RATE);
    expect(file.readUInt32LE(28)).toBe(SAMPLE_RATE * 2); // sampleRate * channels * bytesPerSample
    expect(file.readUInt16LE(32)).toBe(2);
    expect(file.readUInt16LE(34)).toBe(16);
    expect(file.subarray(36, 40).toString('ascii')).toBe('data');
    expect(file.readUInt32LE(40)).toBe(dataBytes);

    // A non-empty data chunk with an even byte length (16-bit samples).
    expect(dataBytes).toBeGreaterThan(0);
    expect(dataBytes % 2).toBe(0);
  });

  it('keeps the RIFF size consistent with the real buffer length', () => {
    for (const row of rows) {
      const file = readWav(row.key);
      const dataBytes = file.length - HEADER_SIZE;
      expect(file.readUInt32LE(4)).toBe(36 + dataBytes);
      expect(file.readUInt32LE(40)).toBe(dataBytes);
    }
  });
});
