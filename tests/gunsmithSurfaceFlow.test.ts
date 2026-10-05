import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { GunsmithSurface } from '../src/ui/menuSurfaces/gunsmithSurface';
import { collectGunsmithArtIds, renderAssembledWeapon } from '../src/ui/menuSurfaces/weaponPresentation';
import { loadoutArtBounds, resolveLoadoutArtPlacement } from '../src/presentation/loadoutArtFraming';
import type { MainMenuSnapshot } from '../src/ui/menus';
import type { GunsmithSnapshot } from '../src/ui/gunsmithController';
import type { GunsmithSurfaceCommands, MenuSurfaceControls, MenuSurfaceLayout } from '../src/ui/menuSurfaces/surface';

vi.mock('../src/ui/text', () => ({ createUiText: (scene: any, x: number, y: number, text: string, style: unknown) => scene.add.text(x, y, text, style) }));

class ObjectView {
  list: ObjectView[] = [];
  parent?: ObjectView;
  style: any = {};
  text = '';
  height = 24;
  width = 100;
  destroyed = false;
  constructor(public x = 0, public y = 0) {}
  add(child: ObjectView): this { child.parent = this; this.list.push(child); return this; }
  sendToBack(child: ObjectView): this { this.list = [child, ...this.list.filter(item => item !== child)]; return this; }
  setScrollFactor(): this { return this; }
  setOrigin(): this { return this; }
  setText(text: string): this { this.text = text; return this; }
  setStyle(style: unknown): this { Object.assign(this.style, style); return this; }
  getBounds() { return { top: this.y, bottom: this.y + this.height }; }
  destroy(deep = true) { this.destroyed = true; if (deep) [...this.list].forEach(child => child.destroy()); if (this.parent) this.parent.list = this.parent.list.filter(child => child !== this); }
}

const part = (id: string, slot: string) => ({ instanceId: id, partId: `part:${id}`, name: `${id} Part`, slot,
  tier: 1, traits: [], compatible: true, fitted: false, stateLabel: 'STORED' as const,
  effectScope: 'Pistol', comparisonSummary: 'Detailed comparison', actionLabel: 'FIT',
  iconArtId: `icon:${id}`, traitIcons: [], state: 'owned-unfitted' as const,
  effectLines: ['+10 Range'], statChips: ['+10 Range'], sourceLabel: 'Fabricate 30 Scrap', traitLines: [] });
const receiver = part('receiver', 'receiver');
const barrel = part('barrel', 'barrel');
const snapshot = (changes: Partial<GunsmithSnapshot> = {}): MainMenuSnapshot => ({ panel: 'gunsmith', notice: undefined,
  stage: { stages: [] }, gunsmith: { surface: 'build', selectedSlot: 'receiver', parts: [receiver, barrel],
    families: [{ id: 'pistol', name: 'Pistol', iconArtId: 'chassis:pistol', previewBaseArtId: 'base:pistol', selected: true, existingBuildId: 'build:pistol' }],
    selectedBuild: { id: 'build:pistol', familyId: 'pistol', title: 'Pistol Build', status: 'Selected', activation: 'Active from start', summary: 'Range +10',
      preview: { baseArtId: 'base:pistol', layers: [], traitCores: [], traitEmblems: [] } },
    selectedBuildId: 'build:pistol', builds: [], slots: [
      { slot: 'receiver', label: 'Receiver', iconArtId: 'slot:receiver', candidates: [receiver] },
      { slot: 'barrel', label: 'Barrel', iconArtId: 'slot:barrel', candidates: [barrel] }],
    blueprints: [], catalog: [{ partId: receiver.partId, name: receiver.name, slot: 'receiver', rarity: 'common', iconArtId: receiver.iconArtId,
      traitIcons: [], state: 'fabricable', stateLabel: 'FABRICABLE', effectScope: 'Pistol / SMG / Shotgun', ownedCount: 1, effectLines: receiver.effectLines,
      statChips: receiver.statChips, comparisonSummary: 'Detailed catalog comparison', sourceLabel: 'Fabricate 30 Scrap', fabricationCost: 30, affordable: true, canFabricate: true, fabricationActionLabel: 'Fabricate • 30 Scrap' }],
    workshop: [{ kind: 'merge', groupId: 'merge:receiver', ownedCount: 2, label: 'Merge receiver' }], ...changes } } as unknown as MainMenuSnapshot);

function harness(width = 390, height = 844) {
  const objects: ObjectView[] = [];
  const buttons: Array<{ view: ObjectView; action?: () => void; key?: string }> = [];
  const art: Array<{ id: string; width: number; height: number; framing?: readonly string[] }> = [];
  const scene = { scale: { width, height }, add: {
    container: () => new ObjectView(),
    text: (x: number, y: number, text: string, style: unknown) => { const object = new ObjectView(x, y); object.text = text; object.style = style; object.height = 24 * text.split('\n').length; objects.push(object); return object; },
  } } as unknown as Phaser.Scene;
  const controls = { addButton: (root: ObjectView, x: number, y: number, label: string, minHeight: number, action?: () => void) => {
    const view = new ObjectView(x, y); view.text = label; view.height = Math.max(minHeight, label.split('\n').length * 24); objects.push(view); root.add(view); buttons.push({ view, action }); return view; },
    addHeading: (root: ObjectView, x: number, y: number, label: string) => { const view = new ObjectView(x, y); view.text = label; root.add(view); return view; },
    addCatalogIcon: (_root: unknown, _x: number, _y: number, id: string, size: number) => art.push({ id, width: size, height: size }),
    addLoadoutArt: (_root: unknown, _x: number, _y: number, id: string, w: number, h: number, _owner?: number, framing?: readonly string[]) => art.push({ id, width: w, height: h, framing }),
    disableButton: vi.fn(), beginScrollableRegion: vi.fn(), endScrollableRegion: vi.fn(), registerScrollObject: vi.fn(),
    buttonIndex: (view: ObjectView) => buttons.findIndex(button => button.view === view),
    rememberFocus: (view: ObjectView, key: string) => { buttons.find(button => button.view === view)!.key = key; return view; },
    focusNext: vi.fn(), focusAfterRender: vi.fn(), equipmentSlotColumns: vi.fn(), } as unknown as MenuSurfaceControls;
  const commands = Object.fromEntries(['back', 'selectGunBuild', 'createGunBuild', 'removeUnavailableGunPart', 'unequipGunPart', 'fitGunPart',
    'beginGunMerge', 'requestGunWorkshop', 'selectGunMergeInput', 'confirmGunWorkshop', 'cancelGunWorkshop', 'fabricateGunPart',
    'resetGunWorkshop', 'openGunsmithSurface', 'selectGunsmithSlot', 'selectGunsmithTraitSocket', 'previewGunPart', 'commitGunPartPreview', 'cancelGunPartPreview'].map(name => [name, vi.fn(() => snapshot())])) as unknown as GunsmithSurfaceCommands;
  let surface!: GunsmithSurface;
  const panelResources = vi.fn();
  const onSnapshot = vi.fn((state: MainMenuSnapshot, change?: string) => { if (change === 'gunsmith-body' && surface.canUpdateBody(state, 100)) surface.updateBody(surface.root!, state, 100); });
  surface = new GunsmithSurface({ scene, controls, resources: { panel: panelResources, equipment: vi.fn(), gunsmith: vi.fn() }, onSnapshot }, commands);
  const layout = { width, height, margin: 16, rightMargin: 16, centerX: width / 2, top: 60, hitTarget: 48, scrollBottom: height - 64,
    viewport: { canvasWidth: width, canvasHeight: height, displayWidth: width, displayHeight: height, layoutInsets: { top: 0, bottom: 0, left: 0, right: 0 } } } as unknown as MenuSurfaceLayout;
  const parent = new ObjectView();
  const present = (state = snapshot()) => surface.present(parent as unknown as Phaser.GameObjects.Container, state, layout, 100);
  const visibleCopy = () => objects.filter(object => !object.destroyed).map(object => object.text).join('\n');
  const press = (key: string) => { const button = [...buttons].reverse().find(button => !button.view.destroyed && button.key === key); expect(button, key).toBeDefined(); button!.action!(); };
  return { surface, present, visibleCopy, press, controls, commands, art, buttons, parent, onSnapshot, panelResources };
}

describe('Gunsmith native flow surface', () => {
  it('keeps compact landscape Back clear of the left-aligned screen title', () => {
    const h = harness(844, 390); h.present();
    const back = h.buttons.find(button => button.key === 'gunsmith-back')!;
    expect(back.view.x).toBe(844 - 16 - 120);
  });
  it('renders only selected-slot candidates and keeps Workshop and Parts behind separate controls', () => {
    const h = harness(); h.present();
    expect(h.panelResources).toHaveBeenCalledWith('gunsmith', []);
    expect(h.visibleCopy()).toContain('receiver Part');
    expect(h.visibleCopy()).not.toContain('barrel Part');
    expect(h.visibleCopy()).not.toContain('Merge receiver');
    expect(h.visibleCopy()).not.toContain('Detailed catalog comparison');
    h.press('gunsmith-surface:workshop');
    expect((h.commands as any).openGunsmithSurface).toHaveBeenCalledWith('workshop');
  });
  it('candidate selection only previews, then a separate action commits', () => {
    const h = harness(); h.present(); h.press('gunsmith-part:receiver');
    expect((h.commands as any).previewGunPart).toHaveBeenCalledWith('receiver');
    expect(h.commands.fitGunPart).not.toHaveBeenCalled();
  });
  it('Parts browse selection does not fabricate and confirmation is separate', () => {
    const h = harness(); h.present(snapshot({ surface: 'parts' })); h.press('gunsmith-catalog:part:receiver');
    expect(h.commands.fabricateGunPart).not.toHaveBeenCalled();
    h.press('gunsmith-fabricate-request:part:receiver');
    expect(h.commands.fabricateGunPart).not.toHaveBeenCalled();
    const confirm = h.buttons.find(button => button.key === 'gunsmith-fabricate-confirm:part:receiver')!.action!;
    h.press('gunsmith-fabricate-confirm:part:receiver');
    confirm();
    expect(h.commands.fabricateGunPart).toHaveBeenCalledWith('part:receiver');
    expect(h.commands.fabricateGunPart).toHaveBeenCalledTimes(1);
  });
  it('uses one common assembly framing with phone-visible 326px width', () => {
    const h = harness(); h.present(snapshot({ selectedCandidateInstanceId: 'receiver', candidatePreview: {
      baseArtId: 'base:pistol', layers: [{ instanceId: 'receiver', slot: 'receiver', tier: 2, artId: 'layer:t2' }], traitCores: [], traitEmblems: [] } }));
    const assemblies = h.art.filter(entry => entry.id.startsWith('base:') || entry.id.startsWith('layer:'));
    expect(assemblies.length).toBeGreaterThanOrEqual(3);
    expect(assemblies.every(entry => entry.width === 326)).toBe(true);
    expect(assemblies.every(entry => JSON.stringify(entry.framing) === JSON.stringify(['base:pistol', 'layer:t2']))).toBe(true);
  });
  it('renders controller-owned clamped stat rows and commits only through the preview action', () => {
    const h = harness();
    h.present(snapshot({ selectedCandidateInstanceId: 'receiver', candidatePreview: { baseArtId: 'base:pistol', layers: [], traitCores: [], traitEmblems: [] },
      candidateComparison: { lines: ['PROSE MUST NOT DRIVE STATS'], before: { modifiers: [], families: [] }, after: { modifiers: [], families: [] },
        stats: [{ key: 'spreadDeg', label: 'Accuracy', before: 10, after: 0, displayBefore: '10° spread', displayAfter: '0° spread', direction: 'better' }] } }));
    expect(h.visibleCopy()).toContain('Accuracy • 10° spread to 0° spread');
    expect(h.visibleCopy()).not.toContain('PROSE MUST NOT DRIVE STATS');
    const statCopy = h.visibleCopy().split('\n').find(line => line.startsWith('Accuracy •'))!;
    expect(statCopy).not.toContain('→');
    h.press('gunsmith-commit');
    expect((h.commands as any).commitGunPartPreview).toHaveBeenCalledTimes(1);
    expect(h.commands.fitGunPart).not.toHaveBeenCalled();
  });
  it('hides incompatible candidates and selects a physical trait socket by stable identity', () => {
    const h = harness();
    const core = { ...part('core', 'trait'), fitted: true, state: 'fitted-here' as const, stateLabel: 'EQUIPPED' as const };
    const blocked = { ...part('blocked', 'trait'), compatible: false, state: 'incompatible' as const };
    h.present(snapshot({ selectedSlot: 'trait', parts: [core, blocked], slots: [{ slot: 'trait', label: 'Traits', iconArtId: 'slot:trait', traitFitted: [core], candidates: [core, blocked] }] }));
    expect(h.visibleCopy()).not.toContain('blocked Part');
    h.press('gunsmith-trait-socket:core');
    expect((h.commands as any).selectGunsmithTraitSocket).toHaveBeenCalledWith('core');
  });
  it('Workshop shows exact input/output art, traits and destructive fitting consequences before confirm', () => {
    const h = harness();
    const first = { ...receiver, slot: 'receiver' as const, fittingLocations: [{ buildId: 'build:pistol', buildName: 'Sidearm', familyId: 'pistol', slot: 'receiver' as const, instanceId: 'receiver' }], traitLines: [], traitIcons: [] };
    const second = { ...first, instanceId: 'second', fittingLocations: [] };
    const output = { ...first, instanceId: 'merged', name: 'Output Part', tier: 2, iconArtId: 'icon:receiver:t2', fittingLocations: [],
      traitLines: ['FIRE' as const], traitIcons: [{ trait: 'FIRE' as const, iconArtId: 'trait:fire' }] };
    const state = snapshot({ surface: 'workshop', confirmation: { kind: 'merge', title: 'Merge receivers', confirmLabel: 'Confirm Merge',
      inputLines: [], outputLine: 'Output', mechanicalDelta: ['+20 Range'], inputs: [first, second], output,
      consumedInstanceIds: ['receiver', 'second'], preservedInstanceIds: [], clearedFittings: first.fittingLocations, preservedFittings: [],
      sideEffectLines: ['Output remains STORED. Fit it separately.'],
      comparison: { before: { modifiers: [], families: [] }, after: { modifiers: [], families: [] }, lines: [], stats: [] } } });
    h.present(state);
    expect(h.visibleCopy()).toContain('INPUT A'); expect(h.visibleCopy()).toContain('INPUT B'); expect(h.visibleCopy()).toContain('OUTPUT');
    expect(h.visibleCopy()).toContain('Output Part T2'); expect(h.visibleCopy()).toContain('FIRE');
    expect(h.visibleCopy()).toContain('EMPTIES Sidearm • receiver.');
    expect(h.visibleCopy()).toContain('Output remains STORED. Fit it separately.');
    expect(h.visibleCopy()).toContain('CONSUMES receiver Part.');
    expect(h.art.map(entry => entry.id)).toEqual(expect.arrayContaining(['icon:receiver', 'icon:receiver:t2', 'trait:fire']));
    expect(collectGunsmithArtIds(state)).toEqual(expect.arrayContaining(['icon:receiver:t2', 'trait:fire']));
    expect(h.commands.confirmGunWorkshop).not.toHaveBeenCalled();
    h.press('gunsmith-confirm'); expect(h.commands.confirmGunWorkshop).toHaveBeenCalledTimes(1);
  });
  it('uses only rule-owned legal second merge choices and keeps duplicate instance identities distinct', () => {
    const h = harness();
    const duplicate = { ...receiver, instanceId: 'second' };
    h.present(snapshot({ surface: 'workshop', parts: [receiver, duplicate], mergeSelection: { groupId: 'group', step: 'second',
      title: 'Choose legal second input', firstInstanceId: 'receiver', choices: [{ instanceId: 'second', label: 'second', recommended: true }] } }));
    expect(h.buttons.filter(button => !button.view.destroyed && button.key?.startsWith('gunsmith-merge-input:')).map(button => button.key)).toEqual(['gunsmith-merge-input:second']);
    h.press('gunsmith-merge-input:second'); expect(h.commands.selectGunMergeInput).toHaveBeenCalledWith('second');
  });
  it('changing Workshop operation resets unfinished merge selection without attempting a confirmation cancel', () => {
    const h = harness();
    h.present(snapshot({ surface: 'workshop', mergeSelection: { groupId: 'group', step: 'first', title: 'Choose first input', choices: [] } }));
    h.press('gunsmith-workshop-kind:infuse');
    expect((h.commands as any).resetGunWorkshop).toHaveBeenCalledTimes(1);
    expect(h.commands.cancelGunWorkshop).not.toHaveBeenCalled();
  });
  it('Parts Back cancels confirmation before closing stable selected detail', () => {
    const h = harness(); const state = snapshot({ surface: 'parts' }); h.present(state);
    h.press('gunsmith-catalog:part:receiver'); h.press('gunsmith-fabricate-request:part:receiver');
    expect(h.surface.handleBack(state)).toBe(true);
    expect(h.visibleCopy()).not.toContain('Spend 30 Scrap?');
    expect(h.visibleCopy()).toContain('Detailed catalog comparison');
    expect(h.surface.handleBack(state)).toBe(true);
    expect(h.visibleCopy()).not.toContain('Detailed catalog comparison');
    expect(h.surface.handleBack(state)).toBe(false);
    expect(h.commands.fabricateGunPart).not.toHaveBeenCalled();
  });
  it('large inventory keeps every candidate stable and uses only the shared scroll boundary', () => {
    const h = harness(360, 640);
    const parts = Array.from({ length: 50 }, (_, index) => part(`duplicate-${index}`, 'receiver'));
    h.present(snapshot({ parts, slots: [{ slot: 'receiver', label: 'Receiver', iconArtId: 'slot:receiver', candidates: parts }] }));
    expect(h.buttons.filter(button => !button.view.destroyed && button.key?.startsWith('gunsmith-part:'))).toHaveLength(50);
    h.press('gunsmith-part:duplicate-49');
    expect((h.commands as any).previewGunPart).toHaveBeenCalledWith('duplicate-49');
    expect(h.controls.beginScrollableRegion).toHaveBeenCalledTimes(1);
    expect(h.controls.endScrollableRegion).toHaveBeenCalledTimes(2); // initial render + local redraw
    expect(h.art.find(entry => entry.id === 'base:pistol')!.width).toBe(296);
  });
  it('preserves prefix during a local redraw and revokes old body callbacks', () => {
    const h = harness(); h.present();
    const old = h.buttons.find(button => button.key === 'gunsmith-part:receiver')!;
    const state = snapshot({ selectedSlot: 'barrel' });
    expect(h.surface.canUpdateBody(state, 100)).toBe(true);
    h.surface.updateBody(h.surface.root!, state, 100);
    old.action!(); expect((h.commands as any).previewGunPart).not.toHaveBeenCalled();
    expect(h.visibleCopy()).toContain('barrel Part');
    expect(h.visibleCopy()).not.toContain('receiver Part');
    expect(h.surface.canUpdateBody(state, 99)).toBe(false);
    h.surface.unmount();
    expect(h.surface.canUpdateBody(state, 100)).toBe(false);
  });
});

describe('Gunsmith assembly resource closure', () => {
  it('includes candidate exact tiers and Workshop input/output trait art', () => {
    const state = snapshot({ candidatePreview: { baseArtId: 'base:pistol', layers: [{ instanceId: 'receiver', slot: 'receiver', tier: 5, artId: 'layer:t5' }],
      traitCores: [{ instanceId: 'core', tier: 2, iconArtId: 'core:t2' }], traitEmblems: [{ trait: 'FIRE', iconArtId: 'trait:fire' }] } });
    expect(collectGunsmithArtIds(state)).toEqual(expect.arrayContaining(['layer:t5', 'core:t2', 'trait:fire']));
  });
  it('fits the actual tall Pistol union to the approved whole-weapon width', () => {
    const h = harness();
    const ids = ['gun-build-base:pistol', 'gun-build-part:receiver-heavy:t2'];
    renderAssembledWeapon(h.controls, h.parent as unknown as Phaser.GameObjects.Container,
      { baseArtId: ids[0], layers: [{ instanceId: 'heavy', slot: 'receiver', tier: 2, artId: ids[1] }], traitCores: [], traitEmblems: [] }, 200, 200, 326);
    const source = loadoutArtBounds(ids[0])!;
    const framing = ids.map(id => loadoutArtBounds(id)!);
    const unionWidth = Math.max(...framing.map(row => row.left + row.width)) - Math.min(...framing.map(row => row.left));
    const art = h.art[0];
    const placement = resolveLoadoutArtPlacement(source, framing, 200, 200, art.width, art.height)!;
    expect(unionWidth * placement.width / source.frameWidth).toBeCloseTo(326);
  });
  it('applies the same framing to every co-registered layer', () => {
    const h = harness();
    renderAssembledWeapon(h.controls, h.parent as unknown as Phaser.GameObjects.Container, { baseArtId: 'base:pistol',
      layers: [{ instanceId: 'receiver', slot: 'receiver', tier: 2, artId: 'layer:t2' }], traitCores: [], traitEmblems: [] }, 100, 100, 326);
    expect(h.art.map(entry => entry.framing)).toEqual([['base:pistol', 'layer:t2'], ['base:pistol', 'layer:t2']]);
  });
});
