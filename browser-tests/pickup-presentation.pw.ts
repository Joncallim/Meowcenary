import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { completeRunStartIntro } from './run-start-helpers';
import type { WeaponDefinition, VisualArtBinding, VisualTextureResource } from '../src/systems/types';
import type { LootGrant } from '../src/gameplay/loot';

type Command = { kind: 'spawn'; grant: LootGrant }
  | { kind: 'reset' | 'inspect'; debugId: number }
  | { kind: 'blocked'; debugId: number; blocked: boolean };
type Facts = {
  debugId: number; active: boolean; blocked: boolean; grant?: LootGrant;
  allocated: number; activeCount: number; artNodes: number; rackCount: number; configuredRadius: number;
  body: { radius: number; enabled: boolean; isCircle: boolean; velocity: { x: number; y: number } };
  art: { texture: string; frame: string | number; playing: boolean; width: number; height: number;
    alpha: number; tint: number; flipX: boolean; flipY: boolean; rotation: number;
    originX: number; originY: number; visible: boolean; active: boolean };
  marker: { visible: boolean; active: boolean; colour: number };
};
type Seam = {
  waitForMenuPresentation(): Promise<boolean>; waitForPreparedGame(): Promise<boolean>;
  startPerformanceTraining(seed: number): Promise<boolean>;
  pickupPresentationFixture(command: Command): Facts | undefined;
  freeze(): Promise<void>; resume(): void;
};
type Globals = typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: Seam };
const data = { weapons: JSON.parse(readFileSync(new URL('../src/data/weapons.json', import.meta.url), 'utf8')) as WeaponDefinition[] };
const bindings = JSON.parse(readFileSync(new URL('../src/data/visual-art.json', import.meta.url), 'utf8')).bindings as VisualArtBinding[];
const resources = JSON.parse(readFileSync(new URL('../src/data/visual-resources.json', import.meta.url), 'utf8')) as VisualTextureResource[];
const art = { bindingById(id: string) {
  const binding = bindings.find(row => row.id === id)!;
  const resource = resources.find(row => row.id === binding.resourceId)!;
  return { ...binding, textureKey: resource.textureKey };
} };
const pistol = data.weapons.find(row => row.family === 'pistol' && row.mergeTier === 1)!;
const shotgun = data.weapons.find(row => row.family === 'shotgun' && row.mergeTier === 3)!;

async function command(page: Page, value: Command): Promise<Facts> {
  const result = await page.evaluate(async value => {
    const seam = (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!;
    seam.resume();
    const admitted = seam.pickupPresentationFixture(value);
    if (!admitted) return undefined;
    await seam.freeze();
    // Read rendered state after the freeze boundary, rather than accepting a
    // pre-render snapshot that could conceal retained animation repaint.
    return seam.pickupPresentationFixture({ kind: 'inspect', debugId: admitted.debugId });
  }, value);
  expect(result).toBeDefined(); return result!;
}
function boundedView(facts: Facts, id: number, radius: number): void {
  expect(facts).toMatchObject({ debugId: id, allocated: 1, artNodes: 1,
    activeCount: 1, active: true, body: { radius, enabled: true, isCircle: true },
    art: { visible: true, active: true, flipX: false, flipY: false,
      rotation: 0, originX: .5, originY: .5 } });
}
async function capture(page: Page, info: TestInfo, label: string, facts: Facts): Promise<void> {
  await writeFile(info.outputPath(`${label}-facts.json`), JSON.stringify({
    project: info.project.name, viewport: page.viewportSize(), facts,
  }, null, 2));
  await page.screenshot({ path: info.outputPath(`${label}.png`) });
}
async function reset(page: Page, id: number): Promise<void> {
  const state = await command(page, { kind: 'reset', debugId: id });
  expect(state).toMatchObject({ debugId: id, active: false, activeCount: 0,
    allocated: 1, artNodes: 1, blocked: false,
    body: { enabled: false, velocity: { x: 0, y: 0 } },
    art: { texture: '__DEFAULT', frame: '__BASE', playing: false, width: 1, height: 1,
      visible: false, active: false, alpha: 1, tint: 0xffffff,
      flipX: false, flipY: false, rotation: 0, originX: .5, originY: .5 },
    marker: { visible: false, active: false, colour: 0xffffff } });
  expect(state.grant).toBeUndefined();
}

test('one real pooled pickup keeps exact tier art through reset, blocking and consumable reuse', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  await page.addInitScript(() => localStorage.setItem('meowcenary.save.v2', JSON.stringify({
    version: 4, settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
    progression: { scrap: 0, unlocks: [] }, stages: {}, achievements: {}, characters: {},
  })));
  await page.goto('/?visual-test=1&perf-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as Globals).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForMenuPresentation())).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.startPerformanceTraining(200241))).toBe(true);
  expect(await page.evaluate(() => (globalThis as Globals).__MEOWCENARY_VISUAL_TEST__!.waitForPreparedGame())).toBe(true);
  await completeRunStartIntro(page, info.project.use.hasTouch ? 'touch' : 'keyboard');
  const saved = await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'));
  let state = await command(page, { kind: 'spawn', grant: { kind: 'weapon', definitionId: pistol.id } });
  const id = state.debugId, radius = state.configuredRadius;
  boundedView(state, id, radius);
  const pistolArt = art.bindingById(pistol.art.iconId)!;
  expect(state.art).toMatchObject({ texture: pistolArt.textureKey, frame: pistolArt.frameKey ?? '__BASE',
    playing: false, alpha: 1, tint: 0xffffff });
  expect(Math.max(state.art.width, state.art.height)).toBe(20);
  await capture(page, info, 'pistol-t1', state);
  await reset(page, id);
  state = await command(page, { kind: 'spawn', grant: { kind: 'weapon', definitionId: shotgun.id } });
  boundedView(state, id, radius);
  const shotgunArt = art.bindingById(shotgun.art.iconId)!;
  expect(state.art).toMatchObject({ texture: shotgunArt.textureKey, frame: shotgunArt.frameKey ?? '__BASE',
    playing: false, alpha: 1, tint: 0xffffff });
  expect(Math.max(state.art.width, state.art.height)).toBe(20);
  await capture(page, info, 'shotgun-t3', state);
  state = await command(page, { kind: 'blocked', debugId: id, blocked: true });
  boundedView(state, id, radius);
  expect(state).toMatchObject({ blocked: true, rackCount: 6, art: { texture: shotgunArt.textureKey,
    frame: shotgunArt.frameKey ?? '__BASE', alpha: .65, tint: 0xffa94d },
    body: { velocity: { x: 0, y: 0 } }, marker: { visible: true, colour: 0xffa94d } });
  await capture(page, info, 'shotgun-t3-blocked', state);
  state = await command(page, { kind: 'blocked', debugId: id, blocked: false });
  expect(state).toMatchObject({ blocked: false, art: { alpha: 1, tint: 0xffffff,
    texture: shotgunArt.textureKey, frame: shotgunArt.frameKey ?? '__BASE' }, marker: { visible: false } });
  await reset(page, id);
  for (const kind of ['scrap', 'xp', 'chest'] as const) {
    const grant: LootGrant = kind === 'chest' ? { kind, amount: 0, tableId: 'chest-standard' } : { kind, amount: 1 };
    state = await command(page, { kind: 'spawn', grant });
    boundedView(state, id, radius);
    const binding = art.bindingById(`drop:${kind}`)!;
    expect(state.art).toMatchObject({ texture: binding.textureKey, playing: true,
      width: binding.display.width, height: binding.display.height, alpha: 1, tint: 0xffffff });
    expect(state.grant).toEqual(grant);
    await capture(page, info, kind, state);
    await reset(page, id);
  }
  // A static icon must remain static after animated pickups have used this sprite.
  state = await command(page, { kind: 'spawn', grant: { kind: 'weapon', definitionId: pistol.id } });
  expect(state.art).toMatchObject({ texture: pistolArt.textureKey, frame: pistolArt.frameKey ?? '__BASE', playing: false });
  await reset(page, id);
  expect(await page.evaluate(() => localStorage.getItem('meowcenary.save.v2'))).toBe(saved);
  expect(errors).toEqual([]);
});
