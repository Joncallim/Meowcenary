#!/usr/bin/env node
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_CHUNKS = 4096;
const MAX_UNKNOWN_CHUNK_BYTES = 16 * 1024 * 1024;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(message) {
  throw new Error(message);
}

function exactReader(readAt, fileBytes, maxUnknownChunkBytes) {
  if (!Number.isSafeInteger(fileBytes) || fileBytes < 12) fail('WAV is shorter than the RIFF/WAVE header');
  const header = readAt(0, 12);
  if (!header.subarray(0, 4).equals(Buffer.from('RIFF', 'ascii')) || !header.subarray(8, 12).equals(Buffer.from('WAVE', 'ascii'))) {
    fail('WAV must be a little-endian RIFF/WAVE file');
  }
  const riffBytes = header.readUInt32LE(4);
  if (riffBytes < 4 || riffBytes + 8 !== fileBytes) fail('RIFF size does not match the file length');
  const riffEnd = riffBytes + 8;
  let offset = 12;
  let format;
  let dataBytes;
  let chunkCount = 0;

  while (offset < riffEnd) {
    if (++chunkCount > MAX_CHUNKS) fail(`WAV exceeds the bounded ${MAX_CHUNKS}-chunk scan`);
    if (riffEnd - offset < 8) fail('Truncated RIFF chunk header');
    const chunkHeader = readAt(offset, 8);
    const chunkId = chunkHeader.toString('latin1', 0, 4);
    const chunkBytes = chunkHeader.readUInt32LE(4);
    const payload = offset + 8;
    const end = payload + chunkBytes;
    const paddedEnd = end + (chunkBytes & 1);
    if (end > riffEnd || paddedEnd > riffEnd) fail(`Truncated or inconsistent ${chunkId} chunk`);

    if (chunkHeader.subarray(0, 4).equals(Buffer.from('fmt ', 'ascii'))) {
      if (format) fail('WAV contains duplicate fmt chunks');
      if (chunkBytes !== 16 && chunkBytes !== 18) fail('WAV fmt chunk must be canonical PCM (16 bytes) or PCM with empty extension (18 bytes)');
      const fmt = readAt(payload, chunkBytes);
      const encoding = fmt.readUInt16LE(0);
      const channels = fmt.readUInt16LE(2);
      const sampleRate = fmt.readUInt32LE(4);
      const byteRate = fmt.readUInt32LE(8);
      const blockAlign = fmt.readUInt16LE(12);
      const bitsPerSample = fmt.readUInt16LE(14);
      if (chunkBytes === 18 && fmt.readUInt16LE(16) !== 0) fail('WAV PCM fmt extension must be empty');
      if (encoding !== 1) fail('WAV must use integer PCM encoding');
      if (channels < 1 || sampleRate < 1) fail('WAV must declare positive channels and sample rate');
      if (bitsPerSample !== 16) fail('WAV must use PCM16 samples');
      const expectedAlign = channels * 2;
      const expectedByteRate = sampleRate * expectedAlign;
      if (blockAlign !== expectedAlign || byteRate !== expectedByteRate || expectedByteRate > 0xffffffff) {
        fail('WAV PCM byte-rate or block-align metadata is inconsistent');
      }
      format = { channels, sampleRate, blockAlign };
    } else if (chunkHeader.subarray(0, 4).equals(Buffer.from('data', 'ascii'))) {
      if (dataBytes !== undefined) fail('WAV contains duplicate data chunks');
      if (chunkBytes === 0) fail('WAV data chunk must not be empty');
      dataBytes = chunkBytes;
    } else if (chunkBytes > maxUnknownChunkBytes) {
      fail(`Unknown ${chunkId} chunk exceeds the bounded ${maxUnknownChunkBytes}-byte skip`);
    }
    offset = paddedEnd;
  }

  if (offset !== riffEnd) fail('RIFF chunks do not end at the declared file boundary');
  if (!format) fail('WAV is missing its fmt chunk');
  if (dataBytes === undefined) fail('WAV is missing its data chunk');
  if (dataBytes % format.blockAlign !== 0) fail('WAV data length is not an integral number of PCM frames');
  const frames = dataBytes / format.blockAlign;
  if (!Number.isSafeInteger(frames) || frames < 1) fail('WAV must contain at least one complete PCM frame');
  return { ...format, frames, encodedBytes: fileBytes, durationSeconds: frames / format.sampleRate };
}

export function parsePcm16Wav(buffer) {
  if (!Buffer.isBuffer(buffer)) fail('WAV parser expects a Buffer');
  return exactReader((offset, length) => {
    if (offset < 0 || length < 0 || offset + length > buffer.length) fail('Truncated WAV read');
    return buffer.subarray(offset, offset + length);
  }, buffer.length, MAX_UNKNOWN_CHUNK_BYTES);
}

export function estimateDecodedBytes({ frames, sampleRate, channels }, targetSampleRateHz = 96000, bytesPerFloatSample = 4) {
  for (const [name, value] of Object.entries({ frames, sampleRate, channels, targetSampleRateHz, bytesPerFloatSample })) {
    if (!Number.isSafeInteger(value) || value < 1) fail(`${name} must be a positive safe integer`);
  }
  const sourceFrames = BigInt(frames);
  const targetRate = BigInt(targetSampleRateHz);
  const sourceRate = BigInt(sampleRate);
  const outputFrames = (sourceFrames * targetRate + sourceRate - 1n) / sourceRate;
  const bytes = outputFrames * BigInt(channels) * BigInt(bytesPerFloatSample);
  if (bytes > MAX_SAFE) fail('Decoded-size estimate exceeds JavaScript safe-integer range');
  return Number(bytes);
}

function readPolicy(root) {
  const policy = JSON.parse(readFileSync(path.join(root, 'assets-src/audio/package-budget.json'), 'utf8'));
  if (policy?.version !== 1 || policy?.targetSampleRateHz !== 96000 || policy?.bytesPerFloatSample !== 4 ||
      !Number.isSafeInteger(policy?.maxCacheUnionBytes) || policy.maxCacheUnionBytes < 1 ||
      !Number.isSafeInteger(policy?.maxSfxBytes) || policy.maxSfxBytes < 1) {
    fail('Invalid audio package budget policy');
  }
  return policy;
}

function readCatalog(root) {
  return JSON.parse(readFileSync(path.join(root, 'src/data/audio-assets.json'), 'utf8'));
}

function readAssetInfo(audioDir, url) {
  const match = typeof url === 'string' && /^assets\/audio\/([A-Za-z0-9][A-Za-z0-9._-]*\.wav)$/.exec(url);
  if (!match) fail(`Audio URL must be a public-relative assets/audio/<basename>.wav path: ${String(url)}`);
  const directoryInfo = lstatSync(audioDir);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) fail('public/assets/audio must be a real directory');
  const realDirectory = realpathSync(audioDir);
  const filename = path.join(audioDir, match[1]);
  const entryInfo = lstatSync(filename);
  if (!entryInfo.isFile() || entryInfo.isSymbolicLink()) fail(`Audio asset must be a regular non-symlink file: ${match[1]}`);
  const realFilename = realpathSync(filename);
  if (path.dirname(realFilename) !== realDirectory) fail(`Audio asset escapes public/assets/audio: ${match[1]}`);
  if (typeof constants.O_NOFOLLOW !== 'number' || typeof constants.O_NONBLOCK !== 'number') {
    fail('Audio package guard requires O_NOFOLLOW and O_NONBLOCK file-open flags');
  }
  const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const openedInfo = fstatSync(fd);
    if (!openedInfo.isFile() || openedInfo.dev !== entryInfo.dev || openedInfo.ino !== entryInfo.ino) {
      fail(`Audio asset changed or is not a regular file: ${match[1]}`);
    }
    const info = exactReader((offset, length) => {
      const chunk = Buffer.alloc(length);
      let read = 0;
      while (read < length) {
        const amount = readSync(fd, chunk, read, length - read, offset + read);
        if (amount <= 0) fail(`Unexpected end of WAV file: ${match[1]}`);
        read += amount;
      }
      return chunk;
    }, openedInfo.size, MAX_UNKNOWN_CHUNK_BYTES);
    return { ...info, realFilename };
  } finally {
    closeSync(fd);
  }
}

function addSafeInteger(current, addition, name) {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(addition) || current < 0 || addition < 0) {
    fail(`Audio package ${name} values must be nonnegative safe integers`);
  }
  const total = BigInt(current) + BigInt(addition);
  if (total > MAX_SAFE) fail(`Audio package ${name} aggregate exceeds JavaScript safe-integer range`);
  return Number(total);
}

function addRow(summary, row) {
  summary.keys = addSafeInteger(summary.keys, 1, 'key-count');
  summary.encodedBytes = addSafeInteger(summary.encodedBytes, row.encodedBytes, 'encoded-byte');
  summary.decodedBytes = addSafeInteger(summary.decodedBytes, row.decodedBytes, 'decoded-byte');
  summary.durationSeconds += row.durationSeconds;
  if (!Number.isFinite(summary.durationSeconds)) fail('Audio package duration aggregate is not finite');
}

function emptySummary() {
  return { keys: 0, encodedBytes: 0, decodedBytes: 0, durationSeconds: 0 };
}

export function aggregateAudioPackageRows(rows) {
  const closures = { 'menu-common': emptySummary(), 'run-common': emptySummary() };
  const total = emptySummary();
  const sfx = emptySummary();
  for (const row of rows) {
    const closure = closures[row.lifecycle];
    if (!closure || (row.kind !== 'sfx' && row.kind !== 'music')) fail('Invalid measured audio row lifecycle or kind');
    addRow(closure, row);
    addRow(total, row);
    if (row.kind === 'sfx') addRow(sfx, row);
  }
  return { closures, total, sfx };
}

export function inspectAudioPackage({ root = ROOT, catalog = readCatalog(root), policy = readPolicy(root) } = {}) {
  if (policy?.version !== 1 || policy?.targetSampleRateHz !== 96000 || policy?.bytesPerFloatSample !== 4 ||
      !Number.isSafeInteger(policy?.maxCacheUnionBytes) || policy.maxCacheUnionBytes < 1 ||
      !Number.isSafeInteger(policy?.maxSfxBytes) || policy.maxSfxBytes < 1) {
    fail('Invalid audio package budget policy');
  }
  const audioDir = path.join(root, 'public/assets/audio');
  const byKey = new Map();
  for (const [kind, rows] of [['sfx', catalog?.sfx], ['music', catalog?.music]]) {
    if (!Array.isArray(rows)) fail(`Audio catalog ${kind} must be an array`);
    for (const row of rows) {
      if (!row || typeof row.key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(row.key)) fail(`Invalid ${kind} audio key`);
      if (row.lifecycle !== 'menu-common' && row.lifecycle !== 'run-common') fail(`Invalid audio lifecycle for ${row.key}`);
      const normalized = { key: row.key, url: row.url, lifecycle: row.lifecycle, kind };
      const prior = byKey.get(row.key);
      if (prior) {
        if (prior.url !== normalized.url || prior.lifecycle !== normalized.lifecycle || prior.kind !== normalized.kind) {
          fail(`Conflicting catalog rows share audio cache key ${row.key}`);
        }
        continue;
      }
      const info = readAssetInfo(audioDir, row.url);
      const decodedBytes = estimateDecodedBytes(info, policy.targetSampleRateHz, policy.bytesPerFloatSample);
      byKey.set(row.key, { ...normalized, ...info, decodedBytes });
    }
  }
  if (byKey.size === 0) fail('Audio catalog has no SFX or music resources');

  const { closures, total, sfx } = aggregateAudioPackageRows([...byKey.values()]);
  const policyReport = {
    targetSampleRateHz: policy.targetSampleRateHz,
    bytesPerFloatSample: policy.bytesPerFloatSample,
    decodedUnionBytes: policy.maxCacheUnionBytes,
    decodedSfxBytes: policy.maxSfxBytes,
    interpretation: '96 kHz Float32-equivalent authoring yardstick; not an actual native, WebAudio, or HTML5 memory cap',
  };
  if (total.decodedBytes > policy.maxCacheUnionBytes) {
    fail(`Audio cache-key union exceeds package budget: ${total.decodedBytes} > ${policy.maxCacheUnionBytes} decoded-equivalent bytes`);
  }
  if (sfx.decodedBytes > policy.maxSfxBytes) {
    fail(`Audio SFX exceed package budget: ${sfx.decodedBytes} > ${policy.maxSfxBytes} decoded-equivalent bytes`);
  }
  return {
    policy: policyReport,
    closures,
    sfx,
    total,
    assets: [...byKey.values()].map(({ key, url, lifecycle, kind, sampleRate, channels, frames, durationSeconds, encodedBytes, decodedBytes }) =>
      ({ key, url, lifecycle, kind, sampleRate, channels, frames, durationSeconds, encodedBytes, decodedBytes })),
  };
}

function main() {
  try {
    process.stdout.write(`${JSON.stringify(inspectAudioPackage(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Audio package budget failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
