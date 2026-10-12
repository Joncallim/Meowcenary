import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const SOURCE = join(process.cwd(), 'assets-src/audio/music-menu');
const workspaces: string[] = [];
type Score = typeof import('../assets-src/audio/music-menu/score.json');
function fixture(change?: (score: Score) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'meowcenary-audio-source-'));
  workspaces.push(dir);
  const score: Score = JSON.parse(readFileSync(join(SOURCE, 'score.json'), 'utf8'));
  change?.(score);
  writeFileSync(join(dir, 'score.json'), JSON.stringify(score));
  if (existsSync(join(SOURCE, 'export.mjs'))) copyFileSync(join(SOURCE, 'export.mjs'), join(dir, 'export.mjs'));
  return dir;
}
function run(dir: string, ...args: string[]) {
  return spawnSync(process.execPath, [join(dir, 'export.mjs'), ...args], { cwd: dir, encoding: 'utf8', timeout: 10_000 });
}
function wav(dir: string) { return join(dir, 'music-menu.audition.wav'); }
afterEach(() => { for (const dir of workspaces.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('original menu audition source and exporter', () => {
  it('exports the actual score reproducibly and checks without changing bytes or mtime', () => {
    const first = fixture();
    const second = fixture();
    expect(run(first, '--write').status).toBe(0);
    expect(run(second, '--write').status).toBe(0);
    expect(readFileSync(wav(first))).toEqual(readFileSync(wav(second)));
    const before = lstatSync(wav(first));
    expect(run(first, '--check').status).toBe(0);
    expect(lstatSync(wav(first)).mtimeMs).toBe(before.mtimeMs);
  });

  it('encodes the exact canonical 12 second 24 kHz mono PCM16 header and signal bounds', () => {
    const dir = fixture();
    const result = run(dir, '--write');
    expect(result.status).toBe(0);
    const b = readFileSync(wav(dir));
    expect(b.length).toBe(576044);
    expect(b.subarray(0, 4).toString()).toBe('RIFF');
    expect(b.readUInt32LE(4)).toBe(576036);
    expect(b.subarray(8, 16).toString()).toBe('WAVEfmt ');
    expect(b.readUInt32LE(16)).toBe(16);
    expect(b.readUInt16LE(20)).toBe(1);
    expect(b.readUInt16LE(22)).toBe(1);
    expect(b.readUInt32LE(24)).toBe(24000);
    expect(b.readUInt32LE(28)).toBe(48000);
    expect(b.readUInt16LE(32)).toBe(2);
    expect(b.readUInt16LE(34)).toBe(16);
    expect(b.subarray(36, 40).toString()).toBe('data');
    expect(b.readUInt32LE(40)).toBe(576000);
    const samples = Array.from({ length: 288000 }, (_, i) => b.readInt16LE(44 + i * 2) / 32768);
    expect(samples.every(Number.isFinite)).toBe(true);
    const peak = samples.reduce((n, value) => Math.max(n, Math.abs(value)), 0);
    const rms = Math.sqrt(samples.reduce((n, value) => n + value * value, 0) / samples.length);
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(0.5);
    expect(rms).toBeGreaterThan(0.01);
    expect(Math.abs(samples[0] - samples.at(-1)!)).toBeLessThan(0.015);
    // Read back signal bytes independently rather than trusting exporter metrics.
    const edge = [...samples.slice(-240), ...samples.slice(0, 240)];
    expect(edge.slice(1).every((value, i) => Math.abs(value - edge[i]) < 0.025)).toBe(true);
    const report = JSON.parse(result.stdout);
    expect(report.decodedSampleBytesAt48000).toBe(2304000);
    expect(report.decodedMeasurement).toBe('calculated-not-browser-measured');
    expect(report.maxSynthesisVoices).toBeLessThanOrEqual(8);
    expect(report.productionAccepted).toBe(false);
  });

  it('matches the checked audition and measurement record', () => {
    const result = run(SOURCE, '--check');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(readFileSync(join(SOURCE, 'measurements.json'), 'utf8')));
  });

  it('renders a second valid score from data alone and changes the signal', () => {
    const first = fixture();
    const second = fixture(score => { score.events = [{ beat: 15.8, patch: 'metal', note: 69, durationSeconds: 0.52, velocity: 0.5 }]; });
    expect(run(first, '--write').status).toBe(0);
    expect(run(second, '--write').status).toBe(0);
    expect(readFileSync(wav(first))).not.toEqual(readFileSync(wav(second)));
    // A late event's tail must wrap into the start of the next loop.
    expect(readFileSync(wav(second)).subarray(44, 2044).some(byte => byte !== 0)).toBe(true);
  });

  it('never overwrites an existing output, even if its contents differ', () => {
    const dir = fixture();
    writeFileSync(wav(dir), 'valuable sentinel');
    expect(run(dir, '--write').status).not.toBe(0);
    expect(readFileSync(wav(dir), 'utf8')).toBe('valuable sentinel');
    expect(readdirSync(dir).sort()).toEqual(['export.mjs', 'music-menu.audition.wav', 'score.json']);
  });

  it('detects one-byte drift without repairing it', () => {
    const dir = fixture();
    expect(run(dir, '--write').status).toBe(0);
    const b = readFileSync(wav(dir));
    b[1000] ^= 1;
    writeFileSync(wav(dir), b);
    expect(run(dir, '--check').status).not.toBe(0);
    expect(readFileSync(wav(dir))).toEqual(b);
  });

  it('does not create an output when checking a missing candidate', () => {
    const dir = fixture();
    expect(run(dir, '--check').status).not.toBe(0);
    expect(existsSync(wav(dir))).toBe(false);
  });

  it.each([
    ['unknown output path', (s: Score) => Object.assign(s, { output: '../../public/assets/audio/music-menu.wav' })],
    ['changed stable key', (s: Score) => { s.key = '../music-menu'; }],
    ['production accepted', (s: Score) => { s.productionAccepted = true; }],
    ['unbounded sample rate', (s: Score) => { s.sampleRate = 192000; }],
    ['unbounded bars', (s: Score) => { s.bars = 4000000; }],
    ['unknown patch', (s: Score) => { s.events[0].patch = 'arbitrary-code'; }],
    ['negative time', (s: Score) => { s.events[0].beat = -1; }],
    ['event after loop', (s: Score) => { s.events[0].beat = 16; }],
    ['zero length event', (s: Score) => { s.events[0].durationSeconds = 0; }],
    ['fractional MIDI note', (s: Score) => { s.events[0].note = 69.5; }],
    ['oversized event list', (s: Score) => { s.events = Array.from({ length: 129 }, () => s.events[0]); }],
    ['too many synthesis voices', (s: Score) => { s.events = Array.from({ length: 9 }, () => s.events[0]); }],
    ['out of band partial', (s: Score) => { s.patches.pluck.partials[0].ratio = 100; }],
    ['invalid null gain', (s: Score) => { s.patches.pluck.gain = Infinity; }],
    ['unknown patch property', (s: Score) => Object.assign(s.patches.pluck, { code: 'process.exit()' })],
    ['invalid provenance', (s: Score) => { s.provenance.method = ''; }],
  ])('rejects %s before any output exists', (_label, change) => {
    const dir = fixture(change);
    const result = run(dir, '--write');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Invalid score');
    expect(existsSync(wav(dir))).toBe(false);
  });

  it('rejects excessive file bytes and malformed JSON before rendering', () => {
    const dir = fixture();
    for (const text of [' '.repeat(65537), '{"schemaVersion":']) {
      writeFileSync(join(dir, 'score.json'), text);
      expect(run(dir, '--write').status).not.toBe(0);
      expect(existsSync(wav(dir))).toBe(false);
    }
  });

  it('rejects symlink source and output targets without touching their referents', () => {
    const dir = fixture();
    const other = fixture();
    symlinkSync(join(other, 'score.json'), wav(dir));
    const original = readFileSync(join(other, 'score.json'));
    expect(run(dir, '--write').status).not.toBe(0);
    expect(run(dir, '--check').status).not.toBe(0);
    expect(readFileSync(join(other, 'score.json'))).toEqual(original);
    rmSync(wav(dir));
    rmSync(join(dir, 'score.json'));
    symlinkSync(join(other, 'score.json'), join(dir, 'score.json'));
    expect(run(dir, '--write').status).not.toBe(0);
    expect(existsSync(wav(dir))).toBe(false);
  });

  it('measures without writing and rejects true nonfinite numeric JSON', () => {
    const dir = fixture();
    const files = readdirSync(dir).sort();
    expect(run(dir, '--measure').status).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(files);
    const source = readFileSync(join(dir, 'score.json'), 'utf8');
    writeFileSync(join(dir, 'score.json'), source.replace('\"gain\":0.15', '\"gain\":1e309'));
    const result = run(dir, '--write');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Invalid score: patch gain');
    expect(existsSync(wav(dir))).toBe(false);
  });

  it('rejects an over-peak valid mix instead of silently clipping or normalizing', () => {
    const dir = fixture(score => {
      score.patches.pluck.gain = 0.25;
      score.events = Array.from({ length: 8 }, () => ({ beat: 8, patch: 'pluck', note: 69, durationSeconds: 0.46, velocity: 1 }));
    });
    const result = run(dir, '--write');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('sample peak above 0.5');
    expect(existsSync(wav(dir))).toBe(false);
  });

  it('counts wrapped tails against the synthesis overlap limit', () => {
    const dir = fixture(score => {
      score.events = Array.from({ length: 8 }, () => ({ beat: 15.9, patch: 'metal', note: 69, durationSeconds: 0.52, velocity: 0.01 }));
      score.events.push({ beat: 0, patch: 'bass', note: 45, durationSeconds: 0.58, velocity: 0.01 });
    });
    const result = run(dir, '--write');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('eight simultaneous synthesis voices');
    expect(existsSync(wav(dir))).toBe(false);
  });

  it('publishes exactly one complete file when two writers race', async () => {
    const dir = fixture();
    const attempt = () => new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, [join(dir, 'export.mjs'), '--write'], { cwd: dir, stdio: 'ignore', timeout: 10000 });
      child.on('error', reject);
      child.on('exit', resolve);
    });
    const statuses = await Promise.all([attempt(), attempt()]);
    expect(statuses.sort()).toEqual([0, 1]);
    expect(run(dir, '--check').status).toBe(0);
    expect(readdirSync(dir).filter(name => name.endsWith('.tmp'))).toEqual([]);
  });

  it('rejects extra flags and arbitrary output arguments', () => {
    const dir = fixture();
    for (const args of [[], ['--output', '/tmp/unowned.wav'], ['--write', '--force'], ['--write', '--check']]) {
      expect(run(dir, ...args).status).not.toBe(0);
    }
    expect(existsSync(wav(dir))).toBe(false);
  });
});
