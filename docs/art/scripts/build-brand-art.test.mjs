import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptsDirectory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(scriptsDirectory, '../../..');

function makeFixture() {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'meowcenary-brand-check-'));
  const fixtureRoot = join(temporaryRoot, 'repo');
  for (const relativePath of [
    'docs/art/scripts/build-brand-art.mjs',
    'assets-src/ui/source/brand-art.json',
    'assets-src/ui/source/brand-art.pxo',
    'public/assets/ui/brand-art.png',
    'public/assets/ui/brand-art.json',
  ]) {
    const target = join(fixtureRoot, relativePath);
    mkdirSync(resolve(target, '..'), { recursive: true });
    cpSync(join(root, relativePath), target);
  }
  return { fixtureRoot, temporaryRoot };
}

function replacePxoMember(pxoPath, memberName, update) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'meowcenary-brand-pxo-'));
  try {
    execFileSync('unzip', ['-q', pxoPath, '-d', temporaryDirectory]);
    const memberPath = join(temporaryDirectory, memberName);
    update(memberPath);
    const replacement = `${pxoPath}.replacement`;
    execFileSync('zip', ['-X', '-q', '-r', replacement, 'data.json', 'mimetype', 'image_data'], { cwd: temporaryDirectory });
    cpSync(replacement, pxoPath);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function assertBrandCheckFails(fixtureRoot) {
  assert.throws(() => execFileSync(
    process.execPath,
    ['docs/art/scripts/build-brand-art.mjs', '--check'],
    { cwd: fixtureRoot, stdio: 'pipe' },
  ));
}

test('brand PXO check rejects stale project metadata while preserving its pixel payload', (t) => {
  const fixture = makeFixture();
  t.after(() => rmSync(fixture.temporaryRoot, { recursive: true, force: true }));
  const pxoPath = join(fixture.fixtureRoot, 'assets-src/ui/source/brand-art.pxo');
  const originalPixels = execFileSync('unzip', ['-p', pxoPath, 'image_data/frames/1/layer_1']);

  replacePxoMember(pxoPath, 'data.json', (path) => {
    const project = JSON.parse(readFileSync(path, 'utf8'));
    project.export_file_name = 'invalid-brand-name';
    writeFileSync(path, JSON.stringify(project));
  });

  assert.deepEqual(execFileSync('unzip', ['-p', pxoPath, 'image_data/frames/1/layer_1']), originalPixels);
  assertBrandCheckFails(fixture.fixtureRoot);
});

test('brand PXO check rejects an invalid Pixelorama mimetype while preserving its pixel payload', (t) => {
  const fixture = makeFixture();
  t.after(() => rmSync(fixture.temporaryRoot, { recursive: true, force: true }));
  const pxoPath = join(fixture.fixtureRoot, 'assets-src/ui/source/brand-art.pxo');
  const originalPixels = execFileSync('unzip', ['-p', pxoPath, 'image_data/frames/1/layer_1']);

  replacePxoMember(pxoPath, 'mimetype', (path) => writeFileSync(path, 'application/x-invalid'));

  assert.deepEqual(execFileSync('unzip', ['-p', pxoPath, 'image_data/frames/1/layer_1']), originalPixels);
  assertBrandCheckFails(fixture.fixtureRoot);
});
