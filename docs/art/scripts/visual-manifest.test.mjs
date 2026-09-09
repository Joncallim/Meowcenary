import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { validateVisualManifest } from './validate-visual-art.mjs';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000100000001008060000001fF3ff61', 'hex');
function write(root, path, value = '') { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, value); }
function resource(overrides = {}) { return { id: 'resource:test', textureKey: 'art-test', sampling: 'nearest', load: { type: 'image', imageUrl: 'assets/test/test.png' }, ...overrides }; }
function binding(overrides = {}) { return { id: 'upgrade-icon:test', kind: 'upgrade-icon', required: true, display: { width: 16, height: 16 }, resourceId: 'resource:test', ...overrides }; }
function fixture({ bindings = [binding()], resources = [resource()], files = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'meow-art-'));
  write(root, 'src/data/visual-art.json', JSON.stringify({ bindings })); write(root, 'src/data/visual-resources.json', JSON.stringify(resources));
  if (files) for (const row of resources) {
    const url = row.load.imageUrl; const name = url.split('/').pop().replace('.png', ''); const dir = url.replace(/^assets\//, '').replace(/\/[^/]+$/, '');
    write(root, `public/${url}`, png); write(root, `public/${url.replace('.png', '.json')}`, JSON.stringify({ export_directory_path: '', export_file_name: name, size_x: 16, size_y: 16, frames: [{}], layers: [{ name: 'notes', visible: false }], tags: [] }));
    write(root, `assets-src/${dir}/source/${name}.pxo`); write(root, `docs/art/scripts/build-${name}.lua`);
  }
  return root;
}
function run(options) { const root = fixture(options); try { return validateVisualManifest(root); } finally { rmSync(root, { recursive: true, force: true }); } }
function expectFail(options, pattern) { const result = run(options); assert.equal(result.ok, false); assert.match(result.errors.join('\n'), pattern); }

test('one logical image resolves one physical resource', () => assert.equal(run().ok, true));
test('malformed catalogs and runtime-schema omissions cannot collapse to a green empty manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'meow-art-'));
  write(root, 'src/data/visual-art.json', '{}'); write(root, 'src/data/visual-resources.json', '{}');
  try { const result = validateVisualManifest(root); assert.equal(result.ok, false); assert.match(result.errors.join('\n'), /required array/); } finally { rmSync(root, { recursive: true, force: true }); }
  expectFail({ bindings: [{ id: 'upgrade-icon:test', kind: 'upgrade-icon', resourceId: 'resource:test' }], resources: [resource({ sampling: 'bilinear', extra: true })] }, /required must be boolean|sampling must be nearest|unknown physical resource field/);
});
test('shared atlas validates once and resolves every named frame', () => {
  const r = resource({ load: { type: 'atlas', imageUrl: 'assets/test/test.png', dataUrl: 'assets/test/atlas.json' } }); const root = fixture({ resources: [r], bindings: [binding({ frameKey: 'one' }), binding({ id: 'upgrade-icon:two', frameKey: 'two' })] });
  write(root, 'public/assets/test/atlas.json', JSON.stringify({ frames: { one: { frame: { x: 0, y: 0, w: 8, h: 8 } }, two: { frame: { x: 8, y: 0, w: 8, h: 8 } } } }));
  try { assert.equal(validateVisualManifest(root).ok, true); } finally { rmSync(root, { recursive: true, force: true }); }
});
test('missing and stale resources fail closed', () => { expectFail({ bindings: [binding({ resourceId: 'resource:gone' })] }, /does not resolve/); expectFail({ resources: [resource(), resource({ id: 'resource:orphan', textureKey: 'art-orphan', load: { type: 'image', imageUrl: 'assets/test/orphan.png' } })] }, /stale physical resource/); });
test('duplicate physical identity fails; logical sharing uses one resource', () => expectFail({ resources: [resource(), resource({ id: 'resource:two', textureKey: 'art-two' })], bindings: [binding(), binding({ id: 'upgrade-icon:two', resourceId: 'resource:two' })] }, /duplicate physical PNG identity/));
test('logical physical metadata and missing PNG fail', () => { expectFail({ bindings: [binding({ url: 'assets/nope.png' })] }, /obsolete physical field url/); expectFail({ files: false }, /missing PNG export/); });
test('logical renderer compatibility and ordinary family additions are data-driven', () => {
  expectFail({ bindings: [binding({ kind: 'not-a-renderer' })] }, /unsupported renderer kind/);
  expectFail({ bindings: [binding({ kind: 'character', clips: { idle: { start: 0, end: 0 } } })] }, /require a spritesheet resource/);
  const added = resource({ id: 'resource:ordinary', textureKey: 'art-ordinary', load: { type: 'image', imageUrl: 'assets/test/ordinary.png' } });
  assert.equal(run({ resources: [added], bindings: [binding({ resourceId: 'resource:ordinary' })] }).ok, true);
});
test('atlas frame identity, bounds, and overlap fail closed', () => {
  const make = (frames) => { const root = fixture({ resources: [resource({ load: { type: 'atlas', imageUrl: 'assets/test/test.png', dataUrl: 'assets/test/a.json' } })], bindings: [binding({ frameKey: 'missing' })] }); write(root, 'public/assets/test/a.json', JSON.stringify({ frames })); const result = validateVisualManifest(root); rmSync(root, { recursive: true, force: true }); return result; };
  assert.match(make({ actual: { frame: { x: 20, y: 0, w: 1, h: 1 } } }).errors.join('\n'), /outside PNG bounds/);
  assert.match(make({ a: { frame: { x: 0, y: 0, w: 8, h: 8 } }, b: { frame: { x: 4, y: 0, w: 8, h: 8 } } }).errors.join('\n'), /overlap/);
});
test('spritesheet clips, tags, source, and builder are physical-resource checks', () => {
  const r = resource({ load: { type: 'spritesheet', imageUrl: 'assets/test/test.png', frameWidth: 16, frameHeight: 16 } });
  expectFail({ resources: [r], bindings: [binding({ clips: { idle: { start: 0, end: 2 } } })] }, /outside physical frame count/);
  const root = fixture({ resources: [r], bindings: [binding({ clips: { idle: { start: 0, end: 0 } } })] }); try { assert.match(validateVisualManifest(root).errors.join('\n'), /missing declared clip tag/); } finally { rmSync(root, { recursive: true, force: true }); }
  expectFail({ resources: [resource({ production: { sourceUrl: 'assets-src/missing.pxo', builderPath: 'docs/art/scripts/missing.lua' } })] }, /editable Pixelorama source/);
  expectFail({ resources: [resource({ production: { sourceUrl: 'assets-src/test/source/other.pxo', builderPath: 'docs/art/scripts/build-test.lua' } })] }, /source\/export path mismatch/);
});
test('500 logical bindings backed by one atlas do not require 500 production chains', () => {
  const bindings = Array.from({ length: 500 }, (_, i) => binding({ id: `upgrade-icon:test-${i}`, frameKey: `f${i}` })); const r = resource({ load: { type: 'atlas', imageUrl: 'assets/test/test.png', dataUrl: 'assets/test/a.json' } }); const root = fixture({ bindings, resources: [r] });
  const atlasPng = Buffer.from(png); atlasPng.writeUInt32BE(16, 16); atlasPng.writeUInt32BE(32, 20); write(root, 'public/assets/test/test.png', atlasPng);
  write(root, 'public/assets/test/a.json', JSON.stringify({ frames: Object.fromEntries(bindings.map((_, i) => [`f${i}`, { frame: { x: i % 16, y: Math.floor(i / 16), w: 1, h: 1 } }])) }));
  try { const result = validateVisualManifest(root); assert.equal(result.ok, true); assert.equal(result.resourceCount, 1); } finally { rmSync(root, { recursive: true, force: true }); }
});
