import { describe, expect, it } from 'vitest';
import './__mocks__/phaser';
import { LoadoutPanelSurface } from '../src/ui/menuSurfaces/loadoutChrome';
import { presentLoadoutRunTruthComparison, type LoadoutModifierDelta, type LoadoutRunTruth } from '../src/ui/loadoutPresentation';
import type { EquipmentComparison } from '../src/ui/equipmentPresentation';

class FormatterProbe extends LoadoutPanelSurface<any> {
  readonly panel = 'equipment' as const;
  protected draw(): void { /* formatter-only probe */ }
  format(sign: '+' | '−', delta: LoadoutModifierDelta, comparison: EquipmentComparison): string {
    return this.modifierDeltaCopy(sign, delta, comparison);
  }
}

describe('loadout chrome modifier formatter', () => {
  it('uses the before contribution for changed losses and after for gains while retaining source attribution', () => {
    const before: LoadoutRunTruth = {
      modifiers: [{ stat: 'damage', op: 'add', value: 2, sourceId: 'part:old' }],
      families: [],
    };
    const after: LoadoutRunTruth = {
      modifiers: [{ stat: 'damage', op: 'add', value: 4, sourceId: 'part:old' }],
      families: [],
    };
    const delta = presentLoadoutRunTruthComparison(before, after).modifiers[0]!;
    const item = { instanceId: 'part:old', name: 'Old Helmet' };
    const beforePresentation = { slots: [{ slot: 'helmet', label: 'Helmet', equipped: item, candidates: [item] }], sets: [], runTruth: before };
    const afterPresentation = { slots: [{ slot: 'helmet', label: 'Helmet', equipped: item, candidates: [item] }], sets: [], runTruth: after };
    const comparison = {
      command: { kind: 'equip', instanceId: 'part:old' }, candidate: {}, before: beforePresentation, after: afterPresentation, setChanges: [],
    } as unknown as EquipmentComparison;
    const probe = Object.create(FormatterProbe.prototype) as FormatterProbe;

    expect(probe.format('−', delta, comparison)).toBe('− 2 Damage [All Weapons] • Source: Old Helmet');
    expect(probe.format('+', delta, comparison)).toBe('+ 4 Damage [All Weapons] • Source: Old Helmet');
  });
});
