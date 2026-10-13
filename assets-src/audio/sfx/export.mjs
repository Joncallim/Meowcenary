#!/usr/bin/env node
// Dedicated offline one-shot candidate author. Built-ins only; no game imports.
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const output = join(directory, 'auditions');
const RATE = 24000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Invalid original SFX: ${message}`); };

function readBounded(path, maximum) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maximum) fail('expected bounded regular file');
    const buffer = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (!read) break;
      length += read;
    }
    if (length > maximum) fail('file exceeded size bound');
    return buffer.subarray(0, length);
  } finally { closeSync(fd); }
}
function fields(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) fail(`${label} fields`);
}
function number(value, low, high, label, integer = false) {
  if (!Number.isFinite(value) || value < low || value > high || (integer && !Number.isInteger(value))) fail(label);
}
function string(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 300) fail(label);
}
function validate(bank, catalog) {
  fields(bank, ['schemaVersion', 'rendererVersion', 'productionAccepted', 'sampleRate', 'channels', 'bitsPerSample', 'seed', 'provenance', 'cues'], 'bank');
  for (const [key, value] of Object.entries({ schemaVersion: 1, rendererVersion: 1, productionAccepted: false, sampleRate: RATE, channels: 1, bitsPerSample: 16 })) {
    if (bank[key] !== value) fail(`${key} fixed for auditions`);
  }
  number(bank.seed, 1, 0xffffffff, 'seed', true);
  fields(bank.provenance, ['method', 'author', 'created', 'thirdPartySources'], 'provenance');
  for (const key of ['method', 'author', 'created']) string(bank.provenance[key], key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bank.provenance.created)) fail('created date');
  if (!Array.isArray(bank.provenance.thirdPartySources) || bank.provenance.thirdPartySources.length) fail('third-party sources must be empty');
  // The checked-in catalog remains the ID authority; this exporter cannot add cues.
  if (!catalog || !Array.isArray(catalog.sfx) || catalog.sfx.length !== 19) fail('expected current 19-key SFX catalog');
  const keys = catalog.sfx.map(row => {
    if (!row || typeof row.key !== 'string' || !/^sfx-[a-z0-9-]{1,60}$/.test(row.key) || row.url !== `assets/audio/${row.key}.wav`) fail('catalog key/url');
    return row.key;
  });
  if (new Set(keys).size !== 19) fail('duplicate catalog keys');
  if (!Array.isArray(bank.cues) || bank.cues.length !== keys.length) fail('source/catalog key inventory');
  const sourceKeys = bank.cues.map(cue => cue?.key);
  if (new Set(sourceKeys).size !== keys.length || sourceKeys.some(key => !keys.includes(key))) fail('source/catalog key inventory');
  return bank.cues.map(cue => {
    fields(cue, ['key', 'title', 'durationSeconds', 'layers'], 'cue');
    string(cue.title, 'title');
    number(cue.durationSeconds, 0.03, 0.6, 'cue duration');
    const frames = Math.round(cue.durationSeconds * RATE);
    if (!Array.isArray(cue.layers) || cue.layers.length < 1 || cue.layers.length > 8) fail('one to eight synthesis layers');
    const layers = cue.layers.map(layer => {
      fields(layer, ['startSeconds', 'durationSeconds', 'frequencyHz', 'endFrequencyHz', 'gain', 'attackSeconds', 'releaseSeconds', 'decay', 'noiseMix', 'noiseSmoothing', 'partials'], 'layer');
      number(layer.startSeconds, 0.002, 0.59, 'layer start');
      number(layer.durationSeconds, 0.012, 0.59, 'layer duration');
      number(layer.frequencyHz, 40, 6000, 'frequency'); number(layer.endFrequencyHz, 40, 6000, 'end frequency');
      number(layer.gain, 0.001, 0.25, 'gain');
      number(layer.attackSeconds, 0.002, 0.03, 'attack'); number(layer.releaseSeconds, 0.005, 0.08, 'release');
      number(layer.decay, 0.1, 10, 'decay'); number(layer.noiseMix, 0, 0.8, 'noise mix'); number(layer.noiseSmoothing, 0.01, 0.5, 'noise smoothing');
      if (layer.attackSeconds + layer.releaseSeconds >= layer.durationSeconds) fail('envelope exceeds duration');
      if (!Array.isArray(layer.partials) || layer.partials.length < 1 || layer.partials.length > 4) fail('one to four partials');
      for (const partial of layer.partials) {
        fields(partial, ['ratio', 'gain'], 'partial'); number(partial.ratio, 0.5, 8, 'partial ratio'); number(partial.gain, 0.001, 1, 'partial gain');
        if (Math.max(layer.frequencyHz, layer.endFrequencyHz) * partial.ratio >= RATE / 2) fail('partial reaches Nyquist');
      }
      const start = Math.round(layer.startSeconds * RATE); const length = Math.round(layer.durationSeconds * RATE);
      if (start + length > frames - 48) fail('layer tail must end before final2ms silence');
      return { ...layer, start, length, attack: Math.round(layer.attackSeconds * RATE), release: Math.round(layer.releaseSeconds * RATE) };
    });
    return { ...cue, frames, layers };
  });
}

function render(cue, seed) {
  const mix = new Float64Array(cue.frames);
  const active = new Uint8Array(cue.frames);
  let maxSynthesisVoices = 0;
  // Seed by stable key, so reordering catalog or source rows does not change cues.
  let keySeed = seed;
  for (const char of cue.key) keySeed = Math.imul(keySeed ^ char.charCodeAt(0), 16777619) >>> 0;
  cue.layers.forEach((layer, index) => {
    let noise = (keySeed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0 || 1;
    let filtered = 0;
    const weight = layer.partials.reduce((sum, partial) => sum + partial.gain, 0);
    for (let j = 0; j < layer.length; j++) {
      const frame = layer.start + j;
      active[frame]++;
      maxSynthesisVoices = Math.max(maxSynthesisVoices, active[frame]);
      const rise = j < layer.attack ? (1 - Math.cos(Math.PI * j / layer.attack)) / 2 : 1;
      const remaining = layer.length - 1 - j;
      const fall = remaining < layer.release ? (1 - Math.cos(Math.PI * remaining / layer.release)) / 2 : 1;
      const envelope = rise * fall * Math.exp(-layer.decay * j / layer.length);
      const seconds = j / RATE;
      const phase = 2 * Math.PI * (layer.frequencyHz * seconds + (layer.endFrequencyHz - layer.frequencyHz) * seconds * seconds / (2 * layer.durationSeconds));
      let tone = 0;
      for (const partial of layer.partials) tone += partial.gain * Math.sin(partial.ratio * phase);
      noise ^= noise << 13; noise ^= noise >>> 17; noise ^= noise << 5; noise >>>= 0;
      filtered += layer.noiseSmoothing * (noise / 0xffffffff * 2 - 1 - filtered);
      mix[frame] += layer.gain * envelope * ((1 - layer.noiseMix) * tone / weight + layer.noiseMix * filtered);
    }
  });
  const buffer = Buffer.alloc(44 + cue.frames * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(RATE, 24); buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(cue.frames * 2, 40);
  for (let i = 0; i < cue.frames; i++) {
    if (!Number.isFinite(mix[i]) || Math.abs(mix[i]) > 0.5) fail(`${cue.key} nonfinite sample or peak above0.5`);
    buffer.writeInt16LE(Math.round(mix[i] * 32767), 44 + i * 2);
  }
  let peak = 0, energy = 0, sum = 0, maxAdjacentDelta = 0, previous = 0;
  for (let i = 0; i < cue.frames; i++) {
    const sample = buffer.readInt16LE(44 + i * 2) / 32768;
    if ((i < 48 || i >= cue.frames - 48) && sample !== 0) fail('nonzero silence boundary');
    peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; sum += sample;
    maxAdjacentDelta = Math.max(maxAdjacentDelta, Math.abs(sample - previous)); previous = sample;
  }
  const rms = Math.sqrt(energy / cue.frames), dc = sum / cue.frames;
  if (peak < 0.015 || rms < 0.001 || Math.abs(dc) >= 0.005) fail(`${cue.key} silence/level/DC bounds`);
  return { buffer, metrics: { key: cue.key, title: cue.title, frames: cue.frames, durationSeconds: cue.frames / RATE, encodedBytes: buffer.length, wavSha256: hash(buffer), peak, rms, dc, maxAdjacentDelta, silenceBoundaryFrames: 48, maxSynthesisVoices } };
}

function writeFresh(path, bytes) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--write', '--check', '--measure'].includes(args[0])) throw new Error('Usage: node export.mjs --write | --check | --measure (fresh auditions only)');
  const source = readBounded(join(directory, 'bank.json'), 65536);
  const catalogBytes = readBounded(join(directory, '../../../src/data/audio-assets.json'), 65536);
  const bank = JSON.parse(source.toString('utf8'));
  const cues = validate(bank, JSON.parse(catalogBytes.toString('utf8')));
  // Validate and render every cue before publishing anything; no clipped repair.
  const rendered = cues.map(cue => render(cue, bank.seed));
  const report = {
    productionAccepted: false, rendererVersion: 1, provenance: bank.provenance,
    sourceSha256: hash(source), exporterSha256: hash(readBounded(fileURLToPath(import.meta.url), 65536)), catalogSha256: hash(catalogBytes),
    sampleRate: RATE, channels: 1, bitsPerSample: 16,
    totalFrames: cues.reduce((n, cue) => n + cue.frames, 0),
    totalDurationSeconds: cues.reduce((n, cue) => n + cue.frames, 0) / RATE,
    totalEncodedBytes: rendered.reduce((n, cue) => n + cue.buffer.length, 0),
    decodedMeasurement: 'not-browser-measured; package budgets are checked by their separate owner',
    cues: rendered.map(cue => cue.metrics),
  };
  const metadata = Buffer.from(JSON.stringify(report, null, 2) + '\n');
  const files = rendered.map(cue => ({ name: `${cue.metrics.key}.audition.wav`, bytes: cue.buffer }));
  files.push({ name: 'measurements.json', bytes: metadata });
  if (args[0] === '--write') {
    // Exclusive directory creation elects one writer. Metadata is the completion
    // marker and is written last. Failed I/O leaves an incomplete fresh folder;
    // no success report is emitted and --check rejects missing/drifted contents.
    // This is deliberately not a multi-file atomic/crash-durability claim.
    mkdirSync(output, { mode: 0o755 });
    for (const file of files) writeFresh(join(output, file.name), file.bytes);
  } else if (args[0] === '--check') {
    const stat = lstatSync(output);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('output must be a real directory');
    if (readdirSync(output).sort().join(',') !== files.map(file => file.name).sort().join(',')) fail('output inventory differs');
    for (const file of files) if (!readBounded(join(output, file.name), file.bytes.length).equals(file.bytes)) fail(`output differs: ${file.name}`);
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
