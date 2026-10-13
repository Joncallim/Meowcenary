import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const temporary: string[] = [];
type Layer = { startSeconds: number; durationSeconds: number; frequencyHz: number; endFrequencyHz: number; gain: number; attackSeconds: number; releaseSeconds: number; decay: number; noiseMix: number; noiseSmoothing: number; partials: { ratio: number; gain: number }[] };
type Bank = { productionAccepted: boolean; sampleRate: number; seed: number; provenance: { thirdPartySources: string[] }; cues: { key: string; title: string; durationSeconds: number; layers: Layer[] }[] };
type Score = typeof import('../assets-src/audio/music-menu/score.json');
function fixture(kind: 'sfx' | 'music-run'): string {
  const root = mkdtempSync(join(tmpdir(), 'meowcenary-originals-')); temporary.push(root);
  const target = join(root, 'assets-src/audio', kind); mkdirSync(target, { recursive: true });
  for (const name of ['export.mjs', kind === 'sfx' ? 'bank.json' : 'score.json']) copyFileSync(join(ROOT, 'assets-src/audio', kind, name), join(target, name));
  mkdirSync(join(root, 'src/data'), { recursive: true });
  copyFileSync(join(ROOT, 'src/data/audio-assets.json'), join(root, 'src/data/audio-assets.json'));
  return target;
}
function run(dir: string, ...args: string[]) { return spawnSync(process.execPath, [join(dir, 'export.mjs'), ...args], { cwd: tmpdir(), encoding: 'utf8', timeout: 10000 }); }
function edit<T>(dir: string, file: string, mutate: (source: T) => void): void { const source = JSON.parse(readFileSync(join(dir, file), 'utf8')) as T; mutate(source); writeFileSync(join(dir, file), JSON.stringify(source)); }
function signal(bytes: Buffer): number[] { return Array.from({ length: (bytes.length - 44) / 2 }, (_, i) => bytes.readInt16LE(44 + i * 2) / 32768); }
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
afterEach(() => { for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('original run loop candidate', () => {
  it('reproduces a distinct 12-second mono PCM16 loop and checks without writes', () => {
    const dir = fixture('music-run'); const result = run(dir, '--write'); expect(result.status, result.stderr).toBe(0);
    const path = join(dir, 'music-run.audition.wav'); const bytes = readFileSync(path); const before = lstatSync(path).mtimeMs;
    expect(bytes.length).toBe(576044); expect(bytes.readUInt32LE(24)).toBe(24000); expect(bytes.readUInt16LE(22)).toBe(1); expect(bytes.readUInt16LE(34)).toBe(16);
    const samples = signal(bytes); const peak = Math.max(...samples.slice(0, 24000)); expect(peak).toBeGreaterThan(0.02);
    expect(samples.every(v => Number.isFinite(v) && Math.abs(v) <= 0.5)).toBe(true);
    expect(Math.abs(samples[0] - samples.at(-1)!)).toBeLessThan(0.015);
    expect(sha(bytes)).not.toBe(sha(readFileSync(join(ROOT, 'assets-src/audio/music-menu/music-menu.audition.wav'))));
    expect(run(dir, '--check').status).toBe(0); expect(lstatSync(path).mtimeMs).toBe(before);
    expect(run(dir, '--write').status).not.toBe(0); expect(readFileSync(path)).toEqual(bytes);
    expect(JSON.parse(result.stdout).productionAccepted).toBe(false);
  });
  it('checks the committed run export and measurements exactly', () => {
    const dir = join(ROOT, 'assets-src/audio/music-run'); const result = run(dir, '--check');
    expect(result.status, result.stderr).toBe(0); expect(JSON.parse(result.stdout)).toEqual(JSON.parse(readFileSync(join(dir, 'measurements.json'), 'utf8')));
  });
  it.each([
    ['overlap', (s: Score) => { s.events = Array.from({ length: 9 }, () => s.events[0]); }],
    ['Nyquist', (s: Score) => { s.events[0].patch = 'pluck'; s.events[0].note = 84; s.patches.pluck.partials[0].ratio = 8; }],
    ['nonfinite', (s: Score) => { s.patches.bass.gain = Infinity; }],
    ['accepted', (s: Score) => { s.productionAccepted = true; }],
    ['rate', (s: Score) => { s.sampleRate = 96000; }],
  ] as const)('rejects invalid run %s without publication', (_name, mutate) => {
    const dir = fixture('music-run'); edit<Score>(dir, 'score.json', mutate); expect(run(dir, '--write').status).not.toBe(0);
    expect(existsSync(join(dir, 'music-run.audition.wav'))).toBe(false);
  });
  it('wraps late run tails and rejects overlapping wraparound notes', () => {
    const dir = fixture('music-run');
    edit<Score>(dir, 'score.json', s => { s.events = [{ beat: 23.8, patch: 'metal', note: 69, durationSeconds: 0.4, velocity: 0.5 }]; });
    const measured = run(dir, '--measure'); expect(measured.status, measured.stderr).toBe(0); expect(JSON.parse(measured.stdout).wrappedSynthesisFrames).toBe(7200);
    edit<Score>(dir, 'score.json', s => { s.events = Array.from({ length: 8 }, () => ({ ...s.events[0], velocity: 0.01 })); s.events.push({ beat: 0, patch: 'bass', note: 45, durationSeconds: 0.3, velocity: 0.01 }); });
    expect(run(dir, '--write').stderr).toContain('eight simultaneous synthesis voices'); expect(existsSync(join(dir, 'music-run.audition.wav'))).toBe(false);
  });
  it('rejects run source and output symlinks and drift without changing referents', () => {
    const dir = fixture('music-run'); const other = fixture('music-run'); const score = join(dir, 'score.json'); const output = join(dir, 'music-run.audition.wav');
    const bytes = readFileSync(join(other, 'score.json')); symlinkSync(join(other, 'score.json'), output);
    expect(run(dir, '--write').status).not.toBe(0); expect(run(dir, '--check').status).not.toBe(0); expect(readFileSync(join(other, 'score.json'))).toEqual(bytes);
    rmSync(output); rmSync(score); symlinkSync(join(other, 'score.json'), score); expect(run(dir, '--write').status).not.toBe(0); expect(existsSync(output)).toBe(false);
  });
});

describe('original catalog-complete SFX candidates', () => {
  it('exports all 19 sources deterministically with independently bounded signal and exact metadata', () => {
    const first = fixture('sfx'); const second = fixture('sfx');
    const result = run(first, '--write'); expect(result.status, result.stderr).toBe(0); expect(run(second, '--write').status).toBe(0);
    const catalog = JSON.parse(readFileSync(join(ROOT, 'src/data/audio-assets.json'), 'utf8')) as { sfx: { key: string }[] };
    const output = join(first, 'auditions'); const report = JSON.parse(result.stdout);
    expect(readdirSync(output).sort()).toEqual([...catalog.sfx.map(v => `${v.key}.audition.wav`), 'measurements.json'].sort());
    expect(report.productionAccepted).toBe(false); expect(report.cues).toHaveLength(19);
    let totalSeconds = 0; const hashes = new Set<string>();
    for (const { key } of catalog.sfx) {
      const file = `${key}.audition.wav`; const bytes = readFileSync(join(output, file));
      expect(bytes).toEqual(readFileSync(join(second, 'auditions', file)));
      expect(bytes.subarray(0, 4).toString()).toBe('RIFF'); expect(bytes.readUInt32LE(4)).toBe(bytes.length - 8);
      expect(bytes.readUInt16LE(20)).toBe(1); expect(bytes.readUInt16LE(22)).toBe(1); expect(bytes.readUInt32LE(24)).toBe(24000); expect(bytes.readUInt16LE(34)).toBe(16);
      expect(bytes.readUInt32LE(40)).toBe(bytes.length - 44);
      const samples = signal(bytes); expect(samples.every(v => Number.isFinite(v) && Math.abs(v) <= 0.5)).toBe(true);
      expect(samples.slice(0, 48).every(v => v === 0)).toBe(true); expect(samples.slice(-48).every(v => v === 0)).toBe(true);
      const peak = samples.reduce((p, v) => Math.max(p, Math.abs(v)), 0); const dc = samples.reduce((sum, v) => sum + v, 0) / samples.length;
      expect(peak).toBeGreaterThan(0.015); expect(Math.abs(dc)).toBeLessThan(0.005); totalSeconds += samples.length / 24000; hashes.add(sha(bytes));
      const metric = report.cues.find((v: { key: string }) => v.key === key);
      expect(metric.wavSha256).toBe(sha(bytes)); expect(metric.peak).toBe(peak); expect(metric.dc).toBe(dc);
    }
    expect(totalSeconds).toBeLessThanOrEqual(3.5); expect(hashes.size).toBe(19);
    expect(JSON.parse(readFileSync(join(output, 'measurements.json'), 'utf8'))).toEqual(report);
    const before = lstatSync(join(output, 'measurements.json')).mtimeMs; expect(run(first, '--check').status).toBe(0); expect(lstatSync(join(output, 'measurements.json')).mtimeMs).toBe(before);
  });
  it('matches checked exports and rejects drift or extra outputs read-only', () => {
    const checked = join(ROOT, 'assets-src/audio/sfx'); expect(run(checked, '--check').status).toBe(0);
    const dir = fixture('sfx'); expect(run(dir, '--write').status).toBe(0); const output = join(dir, 'auditions');
    writeFileSync(join(output, 'extra.wav'), 'sentinel'); expect(run(dir, '--check').status).not.toBe(0); rmSync(join(output, 'extra.wav'));
    const path = join(output, 'sfx-ui-confirm.audition.wav'); const bytes = readFileSync(path); bytes[100] ^= 1; writeFileSync(path, bytes);
    expect(run(dir, '--check').status).not.toBe(0); expect(readFileSync(path)).toEqual(bytes);
  });
  it('does not create files for measure/check and refuses existing output directories', () => {
    const dir = fixture('sfx'); const before = readdirSync(dir); expect(run(dir, '--measure').status).toBe(0); expect(run(dir, '--check').status).not.toBe(0); expect(readdirSync(dir)).toEqual(before);
    mkdirSync(join(dir, 'auditions')); writeFileSync(join(dir, 'auditions/keep'), 'sentinel'); expect(run(dir, '--write').status).not.toBe(0); expect(readdirSync(join(dir, 'auditions'))).toEqual(['keep']);
  });
  it.each([
    ['missing key', (s: Bank) => { s.cues.pop(); }],
    ['extra key', (s: Bank) => { s.cues.push({ ...s.cues[0], key: 'sfx-extra' }); }],
    ['duplicate key', (s: Bank) => { s.cues[1].key = s.cues[0].key; }],
    ['unsafe key', (s: Bank) => { s.cues[0].key = '../../unsafe'; }],
    ['nonfinite gain', (s: Bank) => { s.cues[0].layers[0].gain = Infinity; }],
    ['Nyquist', (s: Bank) => { s.cues[0].layers[0].frequencyHz = 12000; }],
    ['envelope', (s: Bank) => { s.cues[0].layers[0].attackSeconds = 1; }],
    ['late layer', (s: Bank) => { s.cues[0].layers[0].startSeconds = 1; }],
    ['too many layers', (s: Bank) => { s.cues[0].layers = Array.from({ length: 9 }, () => s.cues[0].layers[0]); }],
    ['unbounded duration', (s: Bank) => { s.cues[0].durationSeconds = 900; }],
    ['silent gain', (s: Bank) => { s.cues[0].layers[0].gain = 0; }],
    ['accepted', (s: Bank) => { s.productionAccepted = true; }],
    ['foreign provenance', (s: Bank) => { s.provenance.thirdPartySources = ['unknown']; }],
    ['rate', (s: Bank) => { s.sampleRate = 192000; }],
  ] as const)('rejects %s before any output is published', (_name, mutate) => {
    const dir = fixture('sfx'); edit<Bank>(dir, 'bank.json', mutate); const result = run(dir, '--write'); expect(result.status, result.stdout).not.toBe(0); expect(existsSync(join(dir, 'auditions'))).toBe(false);
  });
  it('rejects over-peak synthesis instead of clamping it', () => {
    const dir = fixture('sfx'); edit<Bank>(dir, 'bank.json', s => { const layer = { ...s.cues[0].layers[0], gain: 0.25, noiseMix: 0, decay: 0.1 }; s.cues[0].layers = Array.from({ length: 8 }, () => layer); });
    const result = run(dir, '--write'); expect(result.status).not.toBe(0); expect(result.stderr).toContain('peak'); expect(existsSync(join(dir, 'auditions'))).toBe(false);
  });
  it('rejects source/catalog/output symlinks and oversized/malformed input', () => {
    const dir = fixture('sfx'); const other = fixture('sfx'); const bank = join(dir, 'bank.json');
    for (const text of [' '.repeat(65537), '{']) { writeFileSync(bank, text); expect(run(dir, '--write').status).not.toBe(0); }
    rmSync(bank); symlinkSync(join(other, 'bank.json'), bank); expect(run(dir, '--write').status).not.toBe(0); rmSync(bank); copyFileSync(join(other, 'bank.json'), bank);
    symlinkSync(other, join(dir, 'auditions')); expect(run(dir, '--write').status).not.toBe(0); expect(run(dir, '--check').status).not.toBe(0); rmSync(join(dir, 'auditions'));
    const catalog = join(dir, '../../../src/data/audio-assets.json'); rmSync(catalog); symlinkSync(join(other, '../../../src/data/audio-assets.json'), catalog); expect(run(dir, '--write').status).not.toBe(0);
  });
  it('rejects arbitrary output flags', () => { const dir = fixture('sfx'); for (const args of [[], ['--write', '--force'], ['--output', '/tmp/unsafe']]) expect(run(dir, ...args).status).not.toBe(0); });
  it('rejects malformed last-cue input before publishing an otherwise valid bank', () => {
    const dir = fixture('sfx'); edit<Bank>(dir, 'bank.json', s => { s.cues.at(-1)!.layers[0].partials[0].ratio = 8; s.cues.at(-1)!.layers[0].frequencyHz = 6000; });
    const result = run(dir, '--write'); expect(result.status).not.toBe(0); expect(result.stderr).toContain('Nyquist'); expect(existsSync(join(dir, 'auditions'))).toBe(false);
  });
  it('rejects true nonfinite JSON and changed catalog inventory before writing', () => {
    const dir = fixture('sfx'); const path = join(dir, 'bank.json'); const original = readFileSync(path, 'utf8');
    writeFileSync(path, original.replace('"seed": 2371319', '"seed": 1e309')); expect(run(dir, '--write').status).not.toBe(0); writeFileSync(path, original);
    const catalogPath = join(dir, '../../../src/data/audio-assets.json'); const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { sfx: { key: string }[] }; catalog.sfx.pop(); writeFileSync(catalogPath, JSON.stringify(catalog));
    expect(run(dir, '--write').status).not.toBe(0); expect(existsSync(join(dir, 'auditions'))).toBe(false);
  });
  it('elects exactly one complete writer when two exporters race', async () => {
    const dir = fixture('sfx');
    const attempt = () => new Promise<number | null>((resolve, reject) => { const child = spawn(process.execPath, [join(dir, 'export.mjs'), '--write'], { stdio: 'ignore', timeout: 10000 }); child.on('error', reject); child.on('exit', resolve); });
    expect((await Promise.all([attempt(), attempt()])).sort()).toEqual([0, 1]); expect(run(dir, '--check').status).toBe(0);
  });
  it('checks each output as a bounded no-follow regular file and rejects missing or drifted completion metadata', () => {
    const dir = fixture('sfx'); expect(run(dir, '--write').status).toBe(0);
    const output = join(dir, 'auditions'); const cue = join(output, 'sfx-ui-confirm.audition.wav'); const bytes = readFileSync(cue);
    rmSync(cue); symlinkSync(join(output, 'sfx-ui-back.audition.wav'), cue); expect(run(dir, '--check').status).not.toBe(0);
    rmSync(cue); writeFileSync(cue, bytes); const metadata = join(output, 'measurements.json'); writeFileSync(metadata, '{}'); expect(run(dir, '--check').status).not.toBe(0); rmSync(metadata); expect(run(dir, '--check').status).not.toBe(0);
  });
});
