import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import audioAssets from '../src/data/audio-assets.json';

const roots: string[] = [];
const rows = [...audioAssets.sfx, ...audioAssets.music];
function fixture(withAudio = true) {
  const root = mkdtempSync(join(tmpdir(), 'meowcenary-placeholder-safety-'));
  roots.push(root);
  for (const directory of ['scripts', 'src/data', 'public/assets/audio']) mkdirSync(join(root, directory), { recursive: true });
  copyFileSync('scripts/generate-audio-placeholders.mjs', join(root, 'scripts/generate-audio-placeholders.mjs'));
  writeFileSync(join(root, 'src/data/audio-assets.json'), JSON.stringify(audioAssets));
  if (withAudio) for (const row of rows) copyFileSync(join('public', row.url), join(root, 'public', row.url));
  const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/generate-audio-placeholders.mjs', ...args], { cwd: root, encoding: 'utf8' });
  const file = (key: string) => join(root, 'public/assets/audio', `${key}.wav`);
  return { root, run, file };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('placeholder generation is separated from production audio', () => {
  it.each([{ args: [] }, { args: ['--check'] }])('never replaces an authored file through $args', ({ args }) => {
    const f = fixture();
    const authored = Buffer.from('authored audio must survive a legacy generator command');
    writeFileSync(f.file('music-menu'), authored);
    const result = f.run(...args);
    const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
    expect(digest(readFileSync(f.file('music-menu')))).toBe(digest(authored));
    expect(result.status).not.toBe(0);
  });

  it('checks matching placeholders without changing any shipped bytes', () => {
    const f = fixture();
    const before = rows.map(row => readFileSync(f.file(row.key)));
    expect(f.run('--check').status).toBe(0);
    expect(rows.map(row => readFileSync(f.file(row.key)))).toEqual(before);
  });

  it('does not repair or create missing shipped audio', () => {
    const f = fixture(false);
    expect(f.run().status).not.toBe(0);
    expect(readdirSync(join(f.root, 'public/assets/audio'))).toEqual([]);
  });

  it('exports the unchanged deterministic bytes only to an explicit fresh directory', () => {
    const f = fixture();
    const output = join(f.root, 'audition');
    expect(f.run('--output', output).status).toBe(0);
    for (const row of rows) expect(readFileSync(join(output, `${row.key}.wav`))).toEqual(readFileSync(f.file(row.key)));
    const provenance = JSON.parse(readFileSync(join(output, 'PLACEHOLDER-ONLY.json'), 'utf8'));
    expect(provenance.productionAccepted).toBe(false);
    expect(provenance.keys).toEqual(rows.map(row => row.key));
    expect(JSON.parse(readFileSync(join(output, 'EXPORT-COMPLETE.json'), 'utf8'))).toEqual({ complete: true, productionAccepted: false });
  });

  it('refuses an existing destination instead of overwriting or appending', () => {
    const f = fixture();
    const output = join(f.root, 'audition');
    mkdirSync(output);
    writeFileSync(join(output, 'music-menu.wav'), 'original');
    expect(f.run('--output', output).status).not.toBe(0);
    expect(readdirSync(output)).toEqual(['music-menu.wav']);
    expect(readFileSync(join(output, 'music-menu.wav'), 'utf8')).toBe('original');
  });

  it.each(['public', 'public/placeholder-audition', 'public/assets/audio/child'])('rejects the public destination %s', (destination) => {
    const f = fixture();
    const before = readFileSync(f.file('music-menu'));
    expect(f.run('--output', join(f.root, destination)).status).not.toBe(0);
    expect(readFileSync(f.file('music-menu'))).toEqual(before);
    if (destination !== 'public') expect(existsSync(join(f.root, destination))).toBe(false);
  });

  it('rejects a symlinked ancestor instead of following it into public', () => {
    const f = fixture();
    symlinkSync(join(f.root, 'public'), join(f.root, 'alias'), 'dir');
    expect(f.run('--output', join(f.root, 'alias', 'new-audio')).status).not.toBe(0);
    expect(existsSync(join(f.root, 'public/new-audio'))).toBe(false);
  });

  it('does not create missing destination parents', () => {
    const f = fixture();
    expect(f.run('--output', join(f.root, 'missing', 'audition')).status).not.toBe(0);
    expect(existsSync(join(f.root, 'missing'))).toBe(false);
  });

  it.each([['--unknown'], ['--output'], ['--check', '--output', 'audition'], ['--output', 'a', '--output', 'b'], ['unexpected']].map(args => ({ args })))('fails closed on invalid arguments $args', ({ args }) => {
    const f = fixture();
    const before = readFileSync(f.file('music-menu'));
    expect(f.run(...args).status).not.toBe(0);
    expect(readFileSync(f.file('music-menu'))).toEqual(before);
  });

  it('validates the complete catalog before creating an export destination', () => {
    const f = fixture();
    writeFileSync(join(f.root, 'src/data/audio-assets.json'), JSON.stringify({ ...audioAssets, sfx: [...audioAssets.sfx, { key: 'unregistered', url: 'assets/audio/unregistered.wav' }] }));
    const output = join(f.root, 'audition');
    expect(f.run('--output', output).status).not.toBe(0);
    expect(existsSync(output)).toBe(false);
  });

  it('rejects a FIFO without blocking on a producer', () => {
    const f = fixture(false);
    expect(spawnSync('mkfifo', [f.file('music-menu')]).status).toBe(0);
    const result = spawnSync(process.execPath, ['scripts/generate-audio-placeholders.mjs', '--check'], { cwd: f.root, encoding: 'utf8', timeout: 2000 });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
  });

  it('labels an interrupted export as unaccepted without publishing completion', () => {
    const f = fixture();
    const injection = join(f.root, 'fail-write.mjs');
    writeFileSync(injection, `import fs from 'node:fs';\nimport { syncBuiltinESMExports } from 'node:module';\nconst original = fs.writeFileSync;\nfs.writeFileSync = function (...args) { if (typeof args[0] === 'number' && Buffer.isBuffer(args[1])) throw new Error('simulated ENOSPC'); return original(...args); };\nsyncBuiltinESMExports();\n`);
    const output = join(f.root, 'audition');
    const result = spawnSync(process.execPath, ['--import', injection, 'scripts/generate-audio-placeholders.mjs', '--output', output], { cwd: f.root, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('simulated ENOSPC');
    expect(JSON.parse(readFileSync(join(output, 'PLACEHOLDER-ONLY.json'), 'utf8')).productionAccepted).toBe(false);
    expect(existsSync(join(output, 'EXPORT-COMPLETE.json'))).toBe(false);
  });
});
