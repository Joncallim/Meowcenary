#!/usr/bin/env node
// Epic 10 · Slice 5 — deterministic audio placeholder generator.
//
// Reads src/data/audio-assets.json. The default/--check command only checks
// existing placeholder bytes; it never repairs or replaces shipped audio.
// --output exports to a fresh directory outside public, marked unaccepted.
// Use the repository's Node 22 environment; built-in modules only.
// The bytes are fully deterministic: FNV-1a/xorshift32 noise seeded by
// the asset key, no wall-clock values, no random source, no metadata chunk,
// no platform newlines inside the WAV bytes.
//
// Per docs/architecture/epic-10-audio-remainder.md §8.2-8.4. Run directly:
//   node scripts/generate-audio-placeholders.mjs --check
//   node scripts/generate-audio-placeholders.mjs --output /tmp/fresh-audition

import { closeSync, constants, fsyncSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 8000;
const HEADER_SIZE = 44;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const check = args.length === 0 || (args.length === 1 && args[0] === '--check');
const exportPath = args.length === 2 && args[0] === '--output' && args[1].length > 0 ? resolve(args[1]) : undefined;
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: generate-audio-placeholders.mjs [--check | --output FRESH_DIRECTORY]\nDefault is read-only. Exports outside public remain unaccepted placeholders.');
  process.exit(0);
}
if (!check && exportPath === undefined) throw new Error('Expected --check or --output FRESH_DIRECTORY; no files changed.');

function assertRealDirectories(path) {
  for (let current = path; ; current = dirname(current)) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Audio tooling refuses symlinked or non-directory ancestors.');
    if (dirname(current) === current) break;
  }
}

// ── Frozen synthesis profiles (§8.4) ───────────────────────────────────────

/** SFX: one or more tone segments with a Hann envelope, an optional sweep,
 *  and an optional deterministic noise mix. */
const SFX_PROFILES = {
  'sfx-weapon-fired': [
    { durationMs: 120, startHz: 880, endHz: 440, gain: 0.42, noiseMix: 0.00 },
  ],
  // Epic 17: family-distinct fire/impact character, matching each family's
  // Slice 1 presentation identity (pistol: punchy; SMG: thin/rapid;
  // shotgun: heavy/boomy). Same profile shape as the generic keys above,
  // which stay as the sfxKeyByFamily fallback.
  'sfx-weapon-fired-pistol': [
    { durationMs: 100, startHz: 950, endHz: 480, gain: 0.42, noiseMix: 0.05 },
  ],
  'sfx-weapon-fired-smg': [
    { durationMs: 55, startHz: 1100, endHz: 900, gain: 0.30, noiseMix: 0.10 },
  ],
  'sfx-weapon-fired-shotgun': [
    { durationMs: 160, startHz: 300, endHz: 140, gain: 0.48, noiseMix: 0.45 },
  ],
  'sfx-projectile-hit': [
    { durationMs: 100, startHz: 180, endHz: 90, gain: 0.34, noiseMix: 0.55 },
  ],
  'sfx-projectile-hit-pistol': [
    { durationMs: 90, startHz: 200, endHz: 100, gain: 0.34, noiseMix: 0.50 },
  ],
  'sfx-projectile-hit-smg': [
    { durationMs: 55, startHz: 260, endHz: 140, gain: 0.26, noiseMix: 0.50 },
  ],
  'sfx-projectile-hit-shotgun': [
    { durationMs: 140, startHz: 140, endHz: 60, gain: 0.40, noiseMix: 0.55 },
  ],
  'sfx-enemy-killed': [
    { durationMs: 90, startHz: 220, endHz: 440, gain: 0.32, noiseMix: 0.00 },
    { durationMs: 120, startHz: 440, endHz: 660, gain: 0.35, noiseMix: 0.00 },
  ],
  'sfx-player-damaged': [
    { durationMs: 220, startHz: 120, endHz: 70, gain: 0.38, noiseMix: 0.25 },
  ],
  'sfx-drop-collected': [
    { durationMs: 80, startHz: 660, endHz: 660, gain: 0.30, noiseMix: 0.00 },
    { durationMs: 100, startHz: 880, endHz: 990, gain: 0.34, noiseMix: 0.00 },
  ],
  'sfx-level-up': [
    { durationMs: 90, startHz: 440, endHz: 440, gain: 0.30, noiseMix: 0.00 },
    { durationMs: 90, startHz: 660, endHz: 660, gain: 0.32, noiseMix: 0.00 },
    { durationMs: 140, startHz: 880, endHz: 880, gain: 0.35, noiseMix: 0.00 },
  ],
  // Epic 17: a short metallic clink (scrap locking into place) followed by a
  // rising power-surge sweep, distinct from sfx-level-up's flat ascending
  // chime — reads as "the gun changed", not "the run progressed".
  'sfx-weapon-merged': [
    { durationMs: 60, startHz: 900, endHz: 700, gain: 0.28, noiseMix: 0.35 },
    { durationMs: 180, startHz: 520, endHz: 1040, gain: 0.34, noiseMix: 0.00 },
  ],
  'sfx-card-chosen': [
    { durationMs: 70, startHz: 520, endHz: 520, gain: 0.28, noiseMix: 0.00 },
    { durationMs: 100, startHz: 780, endHz: 780, gain: 0.32, noiseMix: 0.00 },
  ],
  'sfx-run-won': [
    { durationMs: 100, startHz: 523, endHz: 523, gain: 0.30, noiseMix: 0.00 },
    { durationMs: 100, startHz: 659, endHz: 659, gain: 0.32, noiseMix: 0.00 },
    { durationMs: 220, startHz: 784, endHz: 784, gain: 0.35, noiseMix: 0.00 },
  ],
  'sfx-run-lost': [
    { durationMs: 160, startHz: 330, endHz: 247, gain: 0.32, noiseMix: 0.00 },
    { durationMs: 220, startHz: 247, endHz: 165, gain: 0.34, noiseMix: 0.10 },
  ],
  'sfx-ui-navigate': [
    { durationMs: 80, startHz: 700, endHz: 760, gain: 0.25, noiseMix: 0.00 },
  ],
  'sfx-ui-confirm': [
    { durationMs: 110, startHz: 520, endHz: 700, gain: 0.28, noiseMix: 0.00 },
  ],
  'sfx-ui-back': [
    { durationMs: 110, startHz: 520, endHz: 360, gain: 0.28, noiseMix: 0.00 },
  ],
};

/** Music: exactly 4 seconds of integer-Hz sine components with no envelope
 *  and no noise, so the loop boundary stays phase-aligned. */
const MUSIC_PROFILES = {
  'music-menu': {
    durationMs: 4000,
    gain: 0.12,
    components: [
      { hz: 220, weight: 1.00 },
      { hz: 330, weight: 0.50 },
      { hz: 440, weight: 0.35 },
    ],
  },
  'music-run': {
    durationMs: 4000,
    gain: 0.12,
    components: [
      { hz: 110, weight: 1.00 },
      { hz: 165, weight: 0.50 },
      { hz: 220, weight: 0.35 },
    ],
  },
};

// ── Deterministic noise helpers (§8.4, verbatim) ───────────────────────────

function seedFor(key) {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(key, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 0x6d2b79f5;
}

function nextNoise(state) {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  return {
    state: next || 0x6d2b79f5,
    value: (next / 0xffffffff) * 2 - 1,
  };
}

// ── Synthesis (§8.4) ────────────────────────────────────────────────────────

/** One phase accumulator per tone segment; phase resets to zero at each
 *  segment while the noise state persists across segments of one asset. */
function renderSfxSamples(key, segments) {
  const samples = [];
  let noiseState = seedFor(key);
  for (const segment of segments) {
    const segmentSamples = Math.round((segment.durationMs * SAMPLE_RATE) / 1000);
    let phase = 0;
    for (let index = 0; index < segmentSamples; index += 1) {
      const progress = index / Math.max(1, segmentSamples - 1);
      const envelope = 0.5 - 0.5 * Math.cos(2 * Math.PI * progress);
      const frequency = segment.startHz + (segment.endHz - segment.startHz) * progress;
      phase += (2 * Math.PI * frequency) / SAMPLE_RATE;
      const stepped = nextNoise(noiseState);
      noiseState = stepped.state;
      const sample =
        envelope * segment.gain *
        ((1 - segment.noiseMix) * Math.sin(phase) + segment.noiseMix * stepped.value);
      samples.push(sample);
    }
  }
  return samples;
}

function renderMusicSamples(profile) {
  const totalSamples = Math.round((profile.durationMs * SAMPLE_RATE) / 1000);
  const weightSum = profile.components.reduce((sum, component) => sum + component.weight, 0);
  const phases = profile.components.map(() => 0);
  const samples = [];
  for (let index = 0; index < totalSamples; index += 1) {
    let value = 0;
    for (let c = 0; c < profile.components.length; c += 1) {
      const component = profile.components[c];
      phases[c] += (2 * Math.PI * component.hz) / SAMPLE_RATE;
      value += component.weight * Math.sin(phases[c]);
    }
    // Normalize by the weight sum before applying the gain.
    samples.push((profile.gain * value) / weightSum);
  }
  return samples;
}

// ── WAV encoding (§8.3) ─────────────────────────────────────────────────────

/** 44-byte canonical RIFF/WAVE header + data chunk. 16-bit little-endian
 *  samples clamped to [-1, 1] and encoded with Math.round(sample * 32767). */
function encodeWav(samples) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(HEADER_SIZE + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // sampleRate * channels * bytesPerSample
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.min(1, Math.max(-1, samples[index]));
    buffer.writeInt16LE(Math.round(clamped * 32767), HEADER_SIZE + index * 2);
  }
  return buffer;
}

// ── Catalog validation (§8.2) ───────────────────────────────────────────────

const catalogUrl = new URL('../src/data/audio-assets.json', import.meta.url);
const catalog = JSON.parse(readFileSync(catalogUrl, 'utf8'));
const rows = [...catalog.sfx, ...catalog.music];

for (const row of rows) {
  if (typeof row.key !== 'string' || !/^(?:sfx|music)-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.key)) {
    throw new Error(`audio-assets.json row has an empty key: ${JSON.stringify(row)}`);
  }
  if (row.url !== `assets/audio/${row.key}.wav`) {
    throw new Error(
      `audio-assets.json row "${row.key}" has url "${row.url}" — expected "assets/audio/${row.key}.wav"`,
    );
  }
}

const declaredKeys = new Set(rows.map((row) => row.key));
if (declaredKeys.size !== rows.length) throw new Error('Audio placeholder catalog contains duplicate keys.');
const profileKeys = new Set([...Object.keys(SFX_PROFILES), ...Object.keys(MUSIC_PROFILES)]);
const missingProfiles = [...profileKeys].filter((key) => !declaredKeys.has(key));
const extraProfiles = [...declaredKeys].filter((key) => !profileKeys.has(key));
if (missingProfiles.length > 0 || extraProfiles.length > 0) {
  const details = [
    missingProfiles.length > 0 ? `missing profiles: ${missingProfiles.join(', ')}` : '',
    extraProfiles.length > 0 ? `undeclared profiles: ${extraProfiles.join(', ')}` : '',
  ].filter(Boolean);
  throw new Error(`Catalog/profile key mismatch — ${details.join('; ')}`);
}

// Render the complete validated inventory before creating an export directory.
const rendered = rows.map(row => {
  const profile = SFX_PROFILES[row.key] ?? MUSIC_PROFILES[row.key];
  const samples = profile.durationMs === undefined
    ? renderSfxSamples(row.key, profile)
    : renderMusicSamples(profile);
  return { key: row.key, bytes: encodeWav(samples) };
});

if (check) {
  const outputDir = join(root, 'public', 'assets', 'audio');
  assertRealDirectories(outputDir);
  const mismatched = [];
  for (const { key, bytes } of rendered) {
    let fd;
    try {
      fd = openSync(join(outputDir, `${key}.wav`), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size !== bytes.length || !readFileSync(fd).equals(bytes)) mismatched.push(key);
    } catch {
      mismatched.push(key);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
  if (mismatched.length) throw new Error(`Shipped files differ from placeholders or are missing: ${mismatched.join(', ')}. No files changed; use the owning production source/exporter for authored audio.`);
  console.log(`Checked ${rendered.length} deterministic placeholders without writing shipped audio.`);
} else {
  const publicPath = join(root, 'public');
  const fromPublic = relative(publicPath, exportPath);
  if (fromPublic === '' || (fromPublic !== '..' && !fromPublic.startsWith(`..${sep}`) && !fromPublic.startsWith(sep))) {
    throw new Error('Placeholder exports must be outside public; production audio is never an output destination.');
  }
  // Parent must already exist and be real. No recursive mkdir, target reuse,
  // symlink traversal, force switch, or overwrite mode is supported.
  assertRealDirectories(dirname(exportPath));
  mkdirSync(exportPath, { mode: 0o700 });
  const writeExclusive = (name, bytes) => {
    const fd = openSync(join(exportPath, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      writeFileSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  };
  // Label before the first WAV; an interrupted partial export is unaccepted.
  writeExclusive('PLACEHOLDER-ONLY.json', `${JSON.stringify({ productionAccepted: false, sampleRate: SAMPLE_RATE, keys: rendered.map(row => row.key) }, null, 2)}\n`);
  for (const { key, bytes } of rendered) writeExclusive(`${key}.wav`, bytes);
  // Completion is distinct from production approval and appears only last.
  writeExclusive('EXPORT-COMPLETE.json', `${JSON.stringify({ complete: true, productionAccepted: false })}\n`);
  console.log(`Exported ${rendered.length} unaccepted deterministic placeholders outside public to ${exportPath}`);
}
