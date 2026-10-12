import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import audioAssetsJson from '../src/data/audio-assets.json';
import { aggregateAudioPackageRows, estimateDecodedBytes, inspectAudioPackage, parsePcm16Wav } from '../scripts/audio-package-budget.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policy = {
  version: 1 as const,
  targetSampleRateHz: 96000 as const,
  bytesPerFloatSample: 4 as const,
  maxCacheUnionBytes: 16 * 1024 * 1024,
  maxSfxBytes: 2 * 1024 * 1024,
};

function chunk(id: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(id, 0, 4, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  return payload.length % 2 === 0 ? Buffer.concat([header, payload]) : Buffer.concat([header, payload, Buffer.alloc(1)]);
}

interface WavOptions {
  sampleRate?: number;
  channels?: number;
  frames?: number;
  encoding?: number;
  bits?: number;
  byteRate?: number;
  blockAlign?: number;
  extraChunks?: readonly Buffer[];
}

function wav({ sampleRate = 96000, channels = 1, frames = 1, encoding = 1, bits = 16, byteRate, blockAlign, extraChunks = [] }: WavOptions = {}): Buffer {
  const align = blockAlign ?? channels * 2;
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(encoding, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(byteRate ?? sampleRate * align, 8);
  fmt.writeUInt16LE(align, 12);
  fmt.writeUInt16LE(bits, 14);
  const data = Buffer.alloc(frames * align);
  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), ...extraChunks, chunk('fmt ', fmt), chunk('data', data)]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function fixture() {
  const dir = mkdtempSync(resolve(tmpdir(), 'meow-audio-package-'));
  mkdirSync(resolve(dir, 'public/assets/audio'), { recursive: true });
  mkdirSync(resolve(dir, 'src/data'), { recursive: true });
  mkdirSync(resolve(dir, 'assets-src/audio'), { recursive: true });
  writeFileSync(resolve(dir, 'assets-src/audio/package-budget.json'), JSON.stringify(policy));
  const rows: { sfx: Array<{ key: string; url: string; lifecycle: string }>; music: Array<{ key: string; url: string; lifecycle: string }> } = { sfx: [], music: [] };
  const add = (kind: 'sfx' | 'music', key: string, fileName: string, lifecycle: string, data: Buffer) => {
    writeFileSync(resolve(dir, 'public/assets/audio', fileName), data);
    rows[kind].push({ key, url: `assets/audio/${fileName}`, lifecycle });
  };
  return { dir, rows, add, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('audio package size content guard', () => {
  it('checks the real catalog from an unrelated working directory', () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'meow-audio-budget-'));
    try {
      const result = spawnSync(process.execPath, [resolve(root, 'scripts/audio-package-budget.mjs')], {
        cwd,
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      const report = JSON.parse(result.stdout) as { total: { keys: number }; policy: { decodedUnionBytes: number } };
      expect(report.total.keys).toBe(21);
      expect(report.policy.decodedUnionBytes).toBe(16 * 1024 * 1024);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('runs the actual content gate from an unrelated cwd and surfaces the guard budget failure', () => {
    const gateRoot = mkdtempSync(resolve(tmpdir(), 'meow-content-gate-'));
    const cwd = mkdtempSync(resolve(tmpdir(), 'meow-content-cwd-'));
    try {
      mkdirSync(resolve(gateRoot, 'scripts'), { recursive: true });
      mkdirSync(resolve(gateRoot, 'public/assets/audio'), { recursive: true });
      mkdirSync(resolve(gateRoot, 'src/data'), { recursive: true });
      mkdirSync(resolve(gateRoot, 'assets-src/audio'), { recursive: true });
      writeFileSync(resolve(gateRoot, 'scripts/content-validate.mjs'), readFileSync(resolve(root, 'scripts/content-validate.mjs')));
      writeFileSync(resolve(gateRoot, 'scripts/audio-package-budget.mjs'), readFileSync(resolve(root, 'scripts/audio-package-budget.mjs')));
      writeFileSync(resolve(gateRoot, 'assets-src/audio/package-budget.json'), JSON.stringify({ ...policy, maxCacheUnionBytes: 4 }));
      writeFileSync(resolve(gateRoot, 'src/data/audio-assets.json'), JSON.stringify({
        sfx: [], music: [{ key: 'music-test', url: 'assets/audio/test.wav', lifecycle: 'menu-common' }],
      }));
      writeFileSync(resolve(gateRoot, 'public/assets/audio/test.wav'), wav({ sampleRate: 96000, frames: 2 }));

      const result = spawnSync(process.execPath, [resolve(gateRoot, 'scripts/content-validate.mjs')], { cwd, encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Audio package budget failed: Audio cache-key union exceeds package budget: 8 > 4 decoded-equivalent bytes');
    } finally {
      rmSync(gateRoot, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('uses exact ceiling arithmetic for resampling and channel count', () => {
    expect(estimateDecodedBytes({ frames: 1, sampleRate: 44100, channels: 2 })).toBe(24);
    expect(estimateDecodedBytes({ frames: 1, sampleRate: 96000, channels: 2 })).toBe(8);
    const exact = { frames: 4_194_304, sampleRate: 96000, channels: 1 };
    expect(estimateDecodedBytes(exact)).toBe(policy.maxCacheUnionBytes);
    expect(estimateDecodedBytes({ ...exact, frames: exact.frames + 1 })).toBe(policy.maxCacheUnionBytes + 4);
  });

  it('fails closed instead of rounding an unsafe aggregate byte count', () => {
    const row = {
      lifecycle: 'run-common' as const, kind: 'music' as const,
      encodedBytes: Number.MAX_SAFE_INTEGER, decodedBytes: Number.MAX_SAFE_INTEGER, durationSeconds: 1,
    };
    expect(() => aggregateAudioPackageRows([row, { ...row, encodedBytes: 1 }])).toThrow(/encoded-byte aggregate exceeds/);
    expect(() => aggregateAudioPackageRows([row, { ...row, encodedBytes: 0, decodedBytes: 1 }])).toThrow(/decoded-byte aggregate exceeds/);
  });

  it('parses legal unknown RIFF chunks while rejecting empty, truncated, unsupported and inconsistent WAVs', () => {
    expect(parsePcm16Wav(wav({ extraChunks: [chunk('JUNK', Buffer.from([3, 4, 5]))] }))).toMatchObject({ frames: 1, sampleRate: 96000, channels: 1 });
    expect(parsePcm16Wav(wav({ channels: 2 }))).toMatchObject({ channels: 2, blockAlign: 4 });
    expect(() => parsePcm16Wav(wav({ extraChunks: [chunk('JUNK', Buffer.alloc(16 * 1024 * 1024 + 1))] }))).toThrow(/bounded/);
    const valid = wav();
    expect(() => parsePcm16Wav(valid.subarray(0, valid.length - 1))).toThrow(/RIFF size|Truncated/);
    expect(() => parsePcm16Wav(wav({ frames: 0 }))).toThrow(/empty/);
    expect(() => parsePcm16Wav(wav({ encoding: 3 }))).toThrow(/integer PCM/);
    expect(() => parsePcm16Wav(wav({ bits: 24 }))).toThrow(/PCM16/);
    expect(() => parsePcm16Wav(wav({ blockAlign: 4 }))).toThrow(/byte-rate or block-align/);
    expect(() => parsePcm16Wav(Buffer.from('RIFF'))).toThrow(/shorter/);
  });

  it.each([0, 8, 12, 36])('rejects a high-bit corruption in RIFF tag byte %i', (offset) => {
    const corrupt = wav();
    corrupt[offset] |= 0x80;
    expect(() => parsePcm16Wav(corrupt)).toThrow();
  });

  it('accepts the exact total ceiling and rejects one complete PCM frame over', () => {
    const exact = fixture();
    try {
      exact.add('music', 'music-menu', 'menu.wav', 'menu-common', wav({ sampleRate: 96000, frames: policy.maxCacheUnionBytes / 4 }));
      expect(inspectAudioPackage({ root: exact.dir, catalog: exact.rows, policy }).total.decodedBytes).toBe(policy.maxCacheUnionBytes);
      exact.add('music', 'music-run', 'run.wav', 'run-common', wav({ sampleRate: 96000, frames: 1 }));
      expect(() => inspectAudioPackage({ root: exact.dir, catalog: exact.rows, policy })).toThrow(/cache-key union exceeds/);
    } finally { exact.cleanup(); }
  });

  it('rejects a cumulative union above budget even when each lifecycle closure independently fits', () => {
    const f = fixture();
    try {
      const half = Math.floor(policy.maxCacheUnionBytes * 0.55 / 4);
      f.add('music', 'music-menu', 'menu.wav', 'menu-common', wav({ sampleRate: 96000, frames: half }));
      f.add('music', 'music-run', 'run.wav', 'run-common', wav({ sampleRate: 96000, frames: half }));
      expect(() => inspectAudioPackage({ root: f.dir, catalog: f.rows, policy })).toThrow(/cache-key union exceeds/);
    } finally { f.cleanup(); }
  });

  it('enforces the SFX-only ceiling independently from the total cache union', () => {
    const f = fixture();
    try {
      const exactFrames = policy.maxSfxBytes / 4;
      f.add('sfx', 'sfx-a', 'a.wav', 'run-common', wav({ sampleRate: 96000, frames: exactFrames }));
      expect(inspectAudioPackage({ root: f.dir, catalog: f.rows, policy }).sfx.decodedBytes).toBe(policy.maxSfxBytes);
      f.add('sfx', 'sfx-b', 'b.wav', 'run-common', wav({ sampleRate: 96000, frames: 1 }));
      expect(() => inspectAudioPackage({ root: f.dir, catalog: f.rows, policy })).toThrow(/SFX exceed package budget/);
    } finally { f.cleanup(); }
  });

  it('deduplicates identical cache keys, rejects conflicting keys, and counts one URL under two keys twice', () => {
    const duplicate = fixture();
    try {
      duplicate.add('music', 'music-shared', 'shared.wav', 'menu-common', wav({ frames: 10 }));
      duplicate.rows.music.push({ ...duplicate.rows.music[0] });
      expect(inspectAudioPackage({ root: duplicate.dir, catalog: duplicate.rows, policy }).total).toMatchObject({ keys: 1, decodedBytes: 40 });
      duplicate.rows.music.push({ ...duplicate.rows.music[0], lifecycle: 'run-common' });
      expect(() => inspectAudioPackage({ root: duplicate.dir, catalog: duplicate.rows, policy })).toThrow(/Conflicting catalog rows/);
    } finally { duplicate.cleanup(); }

    const sameUrl = fixture();
    try {
      sameUrl.add('music', 'music-a', 'shared.wav', 'menu-common', wav({ frames: 10 }));
      sameUrl.rows.music.push({ ...sameUrl.rows.music[0], key: 'music-b' });
      expect(inspectAudioPackage({ root: sameUrl.dir, catalog: sameUrl.rows, policy }).total).toMatchObject({ keys: 2, decodedBytes: 80 });
    } finally { sameUrl.cleanup(); }
  });

  it('rejects traversal, external URLs, symlinks, non-files, and empty catalogs', () => {
    const f = fixture();
    try {
      f.add('music', 'music-menu', 'menu.wav', 'menu-common', wav());
      f.rows.music[0].url = 'assets/audio/../outside.wav';
      expect(() => inspectAudioPackage({ root: f.dir, catalog: f.rows, policy })).toThrow(/public-relative/);
      f.rows.music[0].url = 'https://example.invalid/audio.wav';
      expect(() => inspectAudioPackage({ root: f.dir, catalog: f.rows, policy })).toThrow(/public-relative/);
      f.rows.music[0].url = 'assets/audio/menu.wav';
      symlinkSync(resolve(f.dir, 'public/assets/audio/menu.wav'), resolve(f.dir, 'public/assets/audio/alias.wav'));
      f.rows.music.push({ ...f.rows.music[0], key: 'music-alias', url: 'assets/audio/alias.wav' });
      expect(() => inspectAudioPackage({ root: f.dir, catalog: f.rows, policy })).toThrow(/regular non-symlink/);
      f.rows.music.pop();
      const fifo = resolve(f.dir, 'public/assets/audio/pipe.wav');
      const fifoResult = spawnSync('mkfifo', [fifo]);
      expect(fifoResult.status, fifoResult.stderr?.toString()).toBe(0);
      f.rows.music.push({ ...f.rows.music[0], key: 'music-pipe', url: 'assets/audio/pipe.wav' });
      expect(() => inspectAudioPackage({ root: f.dir, catalog: f.rows, policy })).toThrow(/regular non-symlink/);
      const empty = { sfx: [], music: [] };
      expect(() => inspectAudioPackage({ root: f.dir, catalog: empty, policy })).toThrow(/no SFX or music/);
    } finally { f.cleanup(); }
  });

  it('inspects the actual 21 current catalog files and computes lifecycle and union closures', () => {
    const report = inspectAudioPackage({ root, catalog: audioAssetsJson });
    expect(report.total).toMatchObject({ keys: 21, encodedBytes: 181084, decodedBytes: 4_323_840 });
    expect(report.closures['menu-common']).toMatchObject({ keys: 4, encodedBytes: 68_976, decodedBytes: 1_651_200 });
    expect(report.closures['run-common']).toMatchObject({ keys: 17, encodedBytes: 112_108, decodedBytes: 2_672_640 });
  });
});
