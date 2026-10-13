#!/usr/bin/env node
// Offline original audition renderer. No runtime import, network, dependencies,
// dynamic code, gameplay RNG, catalog mutation, or production asset writes.
import { constants, closeSync, fstatSync, fsyncSync, linkSync, openSync, readSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const target = join(directory, 'music-run.audition.wav');
const RATE = 24000;
const FRAMES = 288000;
const WAV_BYTES = 576044;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Invalid score: ${message}`); };

// Open first, then inspect that descriptor; no symlinks, devices or unbounded
// reads. The extra byte also catches a file growing after fstat.
function readBounded(path, maximum) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maximum) throw new Error('Expected a bounded regular file');
    const buffer = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (!read) break;
      length += read;
    }
    if (length > maximum) throw new Error('File exceeded size bound');
    return buffer.subarray(0, length);
  } finally { closeSync(fd); }
}

function fields(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || actual.join(',') !== [...keys].sort().join(',')) fail(`${label} has missing or unknown fields`);
}
function number(value, low, high, label, integer = false) {
  if (!Number.isFinite(value) || value < low || value > high || (integer && !Number.isInteger(value))) fail(label);
}
function string(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 300) fail(label);
}
function validate(score) {
  fields(score, ['schemaVersion', 'key', 'title', 'productionAccepted', 'provenance', 'rendererVersion', 'sampleRate', 'channels', 'bitsPerSample', 'bpm', 'beatsPerBar', 'bars', 'seed', 'patches', 'events'], 'score');
  for (const [key, value] of Object.entries({ schemaVersion: 1, key: 'music-run', productionAccepted: false, rendererVersion: 1, sampleRate: RATE, channels: 1, bitsPerSample: 16, bpm: 120, beatsPerBar: 4, bars: 6 })) {
    if (score[key] !== value) fail(`${key} is fixed for this audition`);
  }
  string(score.title, 'title');
  number(score.seed, 1, 0xffffffff, 'seed', true);
  fields(score.provenance, ['method', 'author', 'created', 'thirdPartySources'], 'provenance');
  for (const key of ['method', 'author', 'created']) string(score.provenance[key], `provenance.${key}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(score.provenance.created)) fail('created date');
  if (!Array.isArray(score.provenance.thirdPartySources) || score.provenance.thirdPartySources.length) fail('thirdPartySources must be empty');
  if (!score.patches || typeof score.patches !== 'object' || Array.isArray(score.patches)) fail('patches');
  const patches = Object.entries(score.patches);
  if (patches.length < 1 || patches.length > 4) fail('one to four patches required');
  for (const [id, patch] of patches) {
    if (!/^[a-z][a-z0-9-]{0,23}$/.test(id)) fail('patch identifier');
    fields(patch, ['partials', 'gain', 'attackSeconds', 'releaseSeconds', 'decay', 'noiseMix'], `patch ${id}`);
    number(patch.gain, 0.001, 0.25, 'patch gain');
    number(patch.attackSeconds, 0.002, 0.03, 'attack');
    number(patch.releaseSeconds, 0.005, 0.08, 'release');
    number(patch.decay, 0.1, 10, 'decay');
    number(patch.noiseMix, 0, 0.8, 'noise mix');
    if (!Array.isArray(patch.partials) || patch.partials.length < 1 || patch.partials.length > 4) fail('one to four partials required');
    for (const partial of patch.partials) {
      fields(partial, ['ratio', 'gain'], 'partial');
      number(partial.ratio, 0.5, 8, 'partial ratio');
      number(partial.gain, 0.001, 1, 'partial gain');
    }
  }
  if (!Array.isArray(score.events) || score.events.length < 1 || score.events.length > 128) fail('one to 128 events required');
  // Validate before allocating the fixed rendering buffers. Beat and duration
  // become integer frames exactly once and share that representation downstream.
  const notes = score.events.map((event, index) => {
    fields(event, ['beat', 'patch', 'note', 'durationSeconds', 'velocity'], 'event');
    number(event.beat, 0, 24, 'beat');
    if (event.beat >= 24) fail('event must start before loop end');
    number(event.note, 36, 84, 'MIDI note', true);
    number(event.durationSeconds, 0.02, 0.6, 'event duration');
    number(event.velocity, 0.001, 1, 'velocity');
    if (typeof event.patch !== 'string' || !Object.hasOwn(score.patches, event.patch)) fail('unknown patch');
    const patch = score.patches[event.patch];
    if (patch.attackSeconds + patch.releaseSeconds >= event.durationSeconds) fail('envelope exceeds duration');
    const hz = 440 * 2 ** ((event.note - 69) / 12);
    if (patch.partials.some(partial => partial.ratio * hz >= RATE / 2)) fail('partial reaches Nyquist');
    const start = Math.round(event.beat * RATE * 60 / score.bpm);
    if (start >= FRAMES) fail('rounded event starts outside loop');
    return { ...event, index, patch, hz, start, length: Math.round(event.durationSeconds * RATE) };
  });
  return notes;
}

function render(score, notes) {
  const mix = new Float64Array(FRAMES);
  const active = new Uint8Array(FRAMES);
  let maxSynthesisVoices = 0, wrappedSynthesisFrames = 0;
  for (const note of notes) {
    const patch = note.patch;
    const attack = Math.round(patch.attackSeconds * RATE);
    const release = Math.round(patch.releaseSeconds * RATE);
    const weight = patch.partials.reduce((sum, partial) => sum + partial.gain, 0);
    // Authoring-only seed. It never reads the game's RNG or the wall clock.
    let noise = (score.seed ^ Math.imul(note.index + 1, 0x9e3779b9)) >>> 0 || 1;
    let filteredNoise = 0;
    for (let j = 0; j < note.length; j += 1) {
      if (note.start + j >= FRAMES) wrappedSynthesisFrames += 1;
      const frame = (note.start + j) % FRAMES;
      active[frame] += 1;
      maxSynthesisVoices = Math.max(maxSynthesisVoices, active[frame]);
      if (active[frame] > 8) fail('more than eight simultaneous synthesis voices');
      const rise = j < attack ? 0.5 - 0.5 * Math.cos(Math.PI * j / attack) : 1;
      const remaining = note.length - 1 - j;
      const fall = remaining < release ? 0.5 - 0.5 * Math.cos(Math.PI * remaining / release) : 1;
      const envelope = rise * fall * Math.exp(-patch.decay * j / note.length);
      let tone = 0;
      for (const partial of patch.partials) tone += partial.gain * Math.sin(2 * Math.PI * note.hz * partial.ratio * j / RATE);
      noise ^= noise << 13;
      noise ^= noise >>> 17;
      noise ^= noise << 5;
      noise >>>= 0;
      // A short low-pass recurrence softens the mechanical noise transient.
      filteredNoise += 0.35 * ((noise / 0xffffffff * 2 - 1) - filteredNoise);
      mix[frame] += envelope * patch.gain * note.velocity * ((1 - patch.noiseMix) * tone / weight + patch.noiseMix * filteredNoise);
    }
  }
  const buffer = Buffer.alloc(WAV_BYTES);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(WAV_BYTES - 8, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24); buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(FRAMES * 2, 40);
  let peak = 0, energy = 0, sum = 0, maxAdjacentDelta = 0, edgeMaxAdjacentDelta = 0;
  for (let i = 0; i < FRAMES; i += 1) {
    const sample = mix[i];
    if (!Number.isFinite(sample) || Math.abs(sample) > 0.5) fail('nonfinite sample or sample peak above 0.5');
    // Never clamp or normalize an invalid mix into a passing export.
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  const sampleAt = frame => buffer.readInt16LE(44 + frame * 2) / 32768;
  for (let i = 0; i < FRAMES; i += 1) {
    const sample = sampleAt(i);
    const delta = Math.abs(sample - sampleAt((i + FRAMES - 1) % FRAMES));
    peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; sum += sample;
    maxAdjacentDelta = Math.max(maxAdjacentDelta, delta);
    if (i < 240 || i >= FRAMES - 240) edgeMaxAdjacentDelta = Math.max(edgeMaxAdjacentDelta, delta);
  }
  const seamDelta = Math.abs(sampleAt(0) - sampleAt(FRAMES - 1));
  if (seamDelta >= 0.015 || edgeMaxAdjacentDelta >= 0.025) fail(`loop edge exceeds audition discontinuity bounds: seam=${seamDelta}, edge=${edgeMaxAdjacentDelta}`);
  const edgeRms = start => Math.sqrt(Array.from({ length: 240 }, (_, i) => sampleAt(start + i) ** 2).reduce((sum, value) => sum + value, 0) / 240);
  return { buffer, metrics: { peak, rms: Math.sqrt(energy / FRAMES), dc: sum / FRAMES, maxAdjacentDelta, seamDelta, edgeMaxAdjacentDelta, maxSynthesisVoices, wrappedSynthesisFrames, first10msRms: edgeRms(0), last10msRms: edgeRms(FRAMES - 240) } };
}

// Publish a complete file with atomic no-clobber semantics. Hard linking a
// closed same-directory temporary file fails if the destination exists, even
// when another exporter wins a race. There is intentionally no --force flag.
function publish(buffer) {
  const temporary = join(directory, `.music-run-audition-${randomUUID()}.tmp`);
  let created = false;
  try {
    const fd = openSync(temporary, 'wx', 0o644);
    created = true;
    try { writeFileSync(fd, buffer); fsyncSync(fd); } finally { closeSync(fd); }
    linkSync(temporary, target);
  } finally { if (created) unlinkSync(temporary); }
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--write', '--check', '--measure'].includes(args[0])) throw new Error('Usage: node export.mjs --write | --check | --measure (audition only; never overwrites)');
  const bytes = readBounded(join(directory, 'score.json'), 65536);
  let score;
  try { score = JSON.parse(bytes.toString('utf8')); } catch { fail('malformed JSON'); }
  const notes = validate(score);
  const { buffer, metrics } = render(score, notes);
  if (args[0] === '--write') publish(buffer);
  if (args[0] === '--check' && !readBounded(target, WAV_BYTES).equals(buffer)) throw new Error('Audition bytes differ from source; nothing was written');
  const report = {
    key: score.key, productionAccepted: false, rendererVersion: 1,
    sourceSha256: hash(bytes), exporterSha256: hash(readBounded(fileURLToPath(import.meta.url), 65536)),
    wavSha256: hash(buffer), sampleRate: RATE, channels: 1, bitsPerSample: 16,
    frames: FRAMES, durationSeconds: FRAMES / RATE, encodedBytes: buffer.length,
    decodedMeasurement: 'calculated-not-browser-measured',
    decodedSampleBytesAt44100: 2116800, decodedSampleBytesAt48000: 2304000, decodedSampleBytesAt96000: 4608000,
    ...metrics,
  };
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
