import { describe, expect, it } from 'vitest';
import {
  JunctionSliceModel, JUNCTION_SAVE_KEY, JUNCTION_COVER,
  decodeJunctionSlice, createJunctionSliceState, serializeJunctionSlice,
  hasJunctionLineOfSight, isJunctionWalkable,
} from '../src/gameplay/junctionSlice';
import { IntegratedFixtureCombat, HOSTILE_FIXTURE_GUN } from '../src/gameplay/integratedFixture';

function fixture() {
  let bytes: string | null = null;
  let fail = false;
  const writer = (value: string) => { if (fail) throw new Error('denied'); bytes = value; };
  const loaded = JunctionSliceModel.load(bytes, writer);
  if (loaded.state === 'invalid') throw new Error('fixture invalid');
  return { model: loaded.model, bytes: () => bytes, deny: (value: boolean) => { fail = value; }, writer };
}
function enter(model: JunctionSliceModel) {
  expect(model.interact().applied).toBe(true);
  expect(model.move(1, 0, 1).applied).toBe(true);
  expect(model.move(1, 0, 1).applied).toBe(true);
  expect(model.snapshot().phase).toBe('fighting');
}
function clear(model: JunctionSliceModel) {
  for (let i = 0; i < 20 && model.snapshot().phase === 'fighting'; i++) model.advance(.25);
  expect(model.snapshot().phase).toBe('return');
}

describe('isolated Junction Vale first-outing rules', () => {
  it('starts usable with two guns each and one active, without a shopping prerequisite', () => {
    const { model } = fixture(); const s = model.snapshot();
    expect(JUNCTION_SAVE_KEY).toBe('meowcenary:junction-slice:v1');
    expect(s.phase).toBe('offer'); expect(s.workshop.wallet.credits).toBe(3000);
    expect(s.provenance).toMatch(/technical seed/);
    for (const id of ['tabby', 'hound']) {
      const actor = s.combat.actors.find(a => a.id === id)!;
      expect(actor.health).toBe(100); expect(actor.weapons).toHaveLength(2); expect(actor.activeGunIndex).toBe(0);
    }
    expect(model.shopComparison()).toMatchObject({ selected: { supply: 18, refillSeconds: 2.7, price: 1650 }, equipped: { supply: 12, refillSeconds: 1.5 }, placeholderEconomy: true });
  });

  it('completes a real finite fight and explicit safe contact return without inventing rewards', () => {
    const f = fixture(); enter(f.model); clear(f.model);
    expect(f.model.snapshot().combat.actors.filter(a => a.id.startsWith('junction-')).every(a => a.health === 0)).toBe(true);
    expect(f.model.interact()).toMatchObject({ applied: false, reason: 'return-to-contact' });
    f.model.move(-1, 0, 1); f.model.move(-1, 0, 1);
    expect(f.model.atContact()).toBe(true);
    expect(f.model.interact().applied).toBe(true);
    expect(f.model.snapshot()).toMatchObject({ phase: 'complete', completionId: 'junction-first-clear-v1' });
    expect(f.model.snapshot().workshop.wallet.credits).toBe(3000);
    const bytes = f.bytes();
    expect(f.model.interact()).toMatchObject({ applied: false, reason: 'already-complete' });
    expect(f.bytes()).toBe(bytes);
    const reloaded = JunctionSliceModel.load(bytes, f.writer);
    expect(reloaded.state).toBe('valid');
    if (reloaded.state === 'invalid') throw new Error('invalid');
    expect(reloaded.model.snapshot().completionId).toBe('junction-first-clear-v1');
    expect(reloaded.model.interact().applied).toBe(false);
  });

  it('never fires into or from the public frontage and gates yard entry on acceptance', () => {
    const f = fixture(); f.model.move(1, 0, 1); f.model.move(1, 0, 1);
    expect(f.model.snapshot().combat.actors.find(a => a.id === 'tabby')!.position.x).toBeLessThan(26);
    expect(f.model.snapshot().phase).toBe('offer');
    expect(hasJunctionLineOfSight({ x: 25, z: 11 }, { x: 35, z: 14 })).toBe(false);
    expect(hasJunctionLineOfSight({ x: 35, z: 14 }, { x: 25, z: 11 })).toBe(false);
    const g = fixture(); enter(g.model); g.model.move(-1, 0, 1); g.model.move(-1, 0, 1);
    const before = g.model.snapshot().combat.actors.filter(a => a.id === 'tabby' || a.id === 'hound').map(a => a.health);
    for (let i = 0; i < 10; i++) g.model.advance(.5);
    expect(g.model.snapshot().combat.actors.filter(a => a.id === 'tabby' || a.id === 'hound').map(a => a.health)).toEqual(before);
  });

  it('uses one honest cover island for body clearance, sweep and shot blocking', () => {
    expect(JUNCTION_COVER).toHaveLength(1);
    expect(isJunctionWalkable({ x: 34, z: 19 })).toBe(false);
    expect(isJunctionWalkable({ x: 33.7, z: 19 })).toBe(false);
    expect(hasJunctionLineOfSight({ x: 31, z: 19 }, { x: 40, z: 19 })).toBe(false);
    expect(hasJunctionLineOfSight({ x: 31, z: 15 }, { x: 40, z: 15 })).toBe(true);
    const { model } = fixture(); enter(model);
    model.move(0, 1, .6); model.move(1, 0, 1);
    expect(isJunctionWalkable(model.snapshot().combat.actors.find(a => a.id === 'tabby')!.position)).toBe(true);
    expect(model.snapshot().combat.actors.find(a => a.id === 'tabby')!.position.x).toBeLessThan(34);
  });

  it('checkpoints exact combat health, positions, active slots, supply, timing and retention across reload', () => {
    const f = fixture(); enter(f.model); f.model.advance(.5); f.model.swapGun(); f.model.advance(.2);
    const before = f.model.snapshot(); const loaded = JunctionSliceModel.load(f.bytes(), f.writer);
    expect(loaded.state).toBe('valid'); if (loaded.state === 'invalid') throw new Error('invalid');
    expect(loaded.model.snapshot()).toEqual(before);
    f.model.advance(.15); loaded.model.advance(.15);
    expect(loaded.model.snapshot().combat).toEqual(f.model.snapshot().combat);
  });

  it('advances only the active gun and never refreshes stores by swapping', () => {
    const f = fixture(); enter(f.model); f.model.advance(.4);
    const a = f.model.snapshot().combat.actors.find(actor => actor.id === 'tabby')!;
    expect(a.weapons[0]!.supply).toBeLessThan(12); expect(a.weapons[1]!.supply).toBe(12);
    f.model.swapGun(); f.model.advance(.4);
    const b = f.model.snapshot().combat.actors.find(actor => actor.id === 'tabby')!;
    expect(b.activeGunIndex).toBe(1); expect(b.weapons[0]).toEqual(a.weapons[0]);
    f.model.swapGun();
    expect(f.model.snapshot().combat.actors.find(actor => actor.id === 'tabby')!.weapons[0]!.supply).toBe(a.weapons[0]!.supply);
  });

  it('pauses without advancing or writing and resumes unpaused after reload', () => {
    const f = fixture(); enter(f.model); const bytes = f.bytes();
    f.model.setPaused(true);
    expect(f.model.advance(.5).applied).toBe(false); expect(f.model.move(1, 0, .5).applied).toBe(false);
    expect(f.bytes()).toBe(bytes);
    const loaded = JunctionSliceModel.load(bytes, f.writer);
    expect(loaded.state).toBe('valid'); if (loaded.state === 'invalid') throw new Error('invalid');
    expect(loaded.model.snapshot().paused).toBe(false);
    expect(serializeJunctionSlice(f.model.snapshot())).not.toContain('paused');
  });

  it('requires exact shop consent, preserves failed writes and separates buying from fitting', () => {
    const f = fixture(); f.model.setPaused(true);
    const cancelled = f.model.previewShop('buy-f2')!; f.model.cancelShop();
    const replacement = f.model.previewShop('buy-f2')!;
    expect(f.model.confirmShop(cancelled)).toMatchObject({ applied: false, reason: 'stale-preview' });
    f.deny(true); expect(f.model.confirmShop(replacement)).toMatchObject({ applied: false, reason: 'storage-failed' });
    expect(f.model.snapshot().workshop.wallet.credits).toBe(3000); expect(f.bytes()).toBeNull();
    f.deny(false); expect(f.model.confirmShop(replacement).applied).toBe(true);
    expect(f.model.snapshot().workshop.wallet.credits).toBe(1350);
    expect(f.model.shopComparison()).toMatchObject({ owned: true, equipped: { supply: 12, refillSeconds: 1.5 } });
    const once = f.bytes(); expect(f.model.confirmShop(replacement).applied).toBe(false); expect(f.bytes()).toBe(once);
    const fit = f.model.previewShop('fit-f2-a')!; expect(f.model.confirmShop(fit).applied).toBe(true);
    expect(f.model.shopComparison().equipped).toMatchObject({ supply: 18, refillSeconds: 2.7 });
    expect(f.model.snapshot().combat.actors.find(a => a.id === 'tabby')!.weapons[0]!.supply).toBe(12);
    expect(decodeJunctionSlice(f.bytes()).state).toBe('valid');
  });

  it('publishes no movement, encounter activation or completion when storage fails', () => {
    const f = fixture(); const initial = f.model.snapshot(); f.deny(true);
    expect(f.model.interact()).toMatchObject({ applied: false, reason: 'storage-failed' });
    expect(f.model.snapshot()).toEqual(initial);
    f.deny(false); enter(f.model); clear(f.model); f.model.move(-1, 0, 1); f.model.move(-1, 0, 1);
    const before = f.model.snapshot(); f.deny(true);
    expect(f.model.interact()).toMatchObject({ applied: false, reason: 'storage-failed' });
    expect(f.model.snapshot()).toEqual(before);
    f.deny(false); expect(f.model.interact().applied).toBe(true);
  });

  it('requires explicit surviving-companion takeover and keeps it blocked by modal pause', () => {
    const f = fixture(); enter(f.model);
    const raw = JSON.parse(serializeJunctionSlice(f.model.snapshot()));
    raw.combat.actors.find((a: any) => a.id === 'tabby').health = 0;
    const loaded = JunctionSliceModel.load(JSON.stringify(raw), f.writer);
    expect(loaded.state).toBe('valid'); if (loaded.state === 'invalid') throw new Error('invalid');
    const model = loaded.model;
    expect(model.move(1, 0, .1)).toMatchObject({ applied: false, reason: 'takeover-required' });
    model.setPaused(true); expect(model.confirmTakeover().applied).toBe(false);
    model.setPaused(false); expect(model.confirmTakeover().applied).toBe(true);
    expect(model.snapshot().controlledActor).toBe('hound');
    expect(model.snapshot().combat.actors.find(a => a.id === 'tabby')!.health).toBe(0);
    expect(model.confirmTakeover().applied).toBe(false);
    expect(decodeJunctionSlice(f.bytes()).state).toBe('valid');
  });

  it('persists a real squad defeat and only an explicit retry restores the isolated attempt', () => {
    const f = fixture(); enter(f.model);
    const raw = JSON.parse(serializeJunctionSlice(f.model.snapshot()));
    for (const actor of raw.combat.actors.filter((a: any) => a.id === 'tabby' || a.id === 'hound')) {
      actor.health = 1;
      for (const gun of actor.weapons) { gun.supply = 0; gun.refillRemaining = 1.5; }
    }
    const loaded = JunctionSliceModel.load(JSON.stringify(raw), f.writer);
    expect(loaded.state).toBe('valid'); if (loaded.state === 'invalid') throw new Error('invalid');
    loaded.model.advance(1);
    expect(loaded.model.snapshot().phase).toBe('lost');
    const reload = JunctionSliceModel.load(f.bytes(), f.writer);
    expect(reload.state).toBe('valid'); if (reload.state === 'invalid') throw new Error('invalid');
    expect(reload.model.snapshot().combat.actors.filter(a => a.id === 'tabby' || a.id === 'hound').every(a => a.health === 0)).toBe(true);
    expect(reload.model.retry().applied).toBe(true);
    expect(reload.model.snapshot()).toMatchObject({ phase: 'accepted', attempt: 2 });
    expect(reload.model.snapshot().workshop.wallet.credits).toBe(3000);
    expect(reload.model.retry().applied).toBe(false);
  });

  it.each(['{', '{}', 'null', JSON.stringify({ ...createJunctionSliceState(), revision: -1 }), JSON.stringify({ ...createJunctionSliceState(), paused: true })].map((bytes, label) => ({ bytes, label })))('rejects corrupt/foreign save $label without invoking a writer', ({ bytes }) => {
    let writes = 0;
    expect(JunctionSliceModel.load(bytes, () => { writes++; }).state).toBe('invalid'); expect(writes).toBe(0);
  });

  it('rejects forged completion, invalid combat roster, impossible supplies and public hostiles', () => {
    for (const corrupt of [
      (s: any) => { s.phase = 'complete'; s.completionId = 'junction-first-clear-v1'; },
      (s: any) => { s.combat.actors[0].id = 'unknown'; },
      (s: any) => { s.combat.actors[0].weapons[0].supply = 999; },
      (s: any) => { s.combat.actors[2].position = { x: 10, z: 11 }; },
    ]) {
      const raw = JSON.parse(serializeJunctionSlice(createJunctionSliceState())); corrupt(raw);
      expect(decodeJunctionSlice(JSON.stringify(raw)).state).toBe('invalid');
    }
  });

  it('retains legacy job-specific restore validation after adding generic encounter setup', () => {
    const c = new IntegratedFixtureCombat();
    c.beginEncounter([{ id: 'new-technical-actor', position: { x: 30, z: 10 }, health: 90, radius: .4, weapon: HOSTILE_FIXTURE_GUN }]);
    expect(c.restore(c.snapshot('tabby'), 'MC-OPT-R01-01', false)).toBe(false);
    expect(c.restoreEncounter(c.snapshot('tabby', true))).toBe(true);
    expect(() => c.beginEncounter([{ id: 'tabby', position: { x: 30, z: 10 }, health: 90, radius: .4, weapon: HOSTILE_FIXTURE_GUN }])).toThrow();
    expect(() => c.beginEncounter([{ id: 'bad', position: { x: NaN, z: 10 }, health: 90, radius: .4, weapon: HOSTILE_FIXTURE_GUN }])).toThrow();
  });
});
