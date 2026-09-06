import { describe, expect, it } from 'vitest';
import {
  CompendiumRegistry,
  updateCompendiumDiscovery,
  buildCompendiumReadEntry,
  getAllCompendiumEntries,
  type CompendiumEntry,
} from '../src/systems/compendium';
import { createDefaultSaveV4, freezeSaveV4, type SaveDataV4 } from '../src/systems/save';

const mockEditorial: CompendiumEntry[] = [
  {
    enemyId: 'dust-mite',
    fieldNote: 'A common junkyard pest.',
    behaviour: 'Zigzag movement, swarms.',
    tells: 'Kicks up dust before charging.',
    counterplay: 'Stay mobile; area damage clears swarms.',
  },
  {
    enemyId: 'junk-rusher',
    fieldNote: 'A heavy charger.',
    behaviour: 'Charges in straight lines.',
    tells: 'Pauses and glows before charging.',
    counterplay: 'Dodge perpendicular to the charge line.',
  },
];

describe('Compendium', () => {
  it('registers editorial entries', () => {
    const registry = new CompendiumRegistry(mockEditorial);
    expect(registry.get('dust-mite')).toBeDefined();
    expect(registry.get('dust-mite')?.fieldNote).toBe('A common junkyard pest.');
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('updates discovery from undefined to encountered', () => {
    const save = createDefaultSaveV4();
    const updated = updateCompendiumDiscovery(save, 'dust-mite', 'encountered');
    expect(updated.compendium['dust-mite']).toBe('encountered');
  });

  it('upgrades from encountered to defeated', () => {
    const save = freezeSaveV4({
      ...createDefaultSaveV4(),
      compendium: Object.freeze({ 'dust-mite': 'encountered' as const }),
    });
    const updated = updateCompendiumDiscovery(save, 'dust-mite', 'defeated');
    expect(updated.compendium['dust-mite']).toBe('defeated');
  });

  it('does not downgrade from defeated to encountered', () => {
    const save = freezeSaveV4({
      ...createDefaultSaveV4(),
      compendium: Object.freeze({ 'dust-mite': 'defeated' as const }),
    });
    const updated = updateCompendiumDiscovery(save, 'dust-mite', 'encountered');
    expect(updated.compendium['dust-mite']).toBe('defeated');
  });

  it('builds a read entry with editorial data', () => {
    const entry = buildCompendiumReadEntry(
      'dust-mite',
      'defeated',
      mockEditorial[0],
      'Dust Mite',
      ['stage:junkyard-01', 'stage:junkyard-02'],
    );
    expect(entry.name).toBe('Dust Mite');
    expect(entry.discoveryStatus).toBe('defeated');
    expect(entry.fieldNote).toBe('A common junkyard pest.');
    expect(entry.foundIn).toContain('stage:junkyard-01');
  });

  it('builds a read entry for unknown enemies', () => {
    const entry = buildCompendiumReadEntry(
      'unknown-beast',
      undefined,
      undefined,
      'Unknown Beast',
      [],
    );
    expect(entry.discoveryStatus).toBeUndefined();
    expect(entry.fieldNote).toBe('Unknown.');
    expect(entry.counterplay).toBe('Unknown.');
  });

  it('gets all compendium entries sorted', () => {
    const registry = new CompendiumRegistry(mockEditorial);
    const save = freezeSaveV4({
      ...createDefaultSaveV4(),
      compendium: Object.freeze({ 'dust-mite': 'defeated' as const }),
    });
    const names = new Map([['dust-mite', 'Dust Mite'], ['junk-rusher', 'Junk Rusher']]);
    const stageMembership = new Map([
      ['dust-mite', ['stage:junkyard-01']],
      ['junk-rusher', ['stage:junkyard-02']],
    ]);
    const entries = getAllCompendiumEntries(save, registry, names, stageMembership);
    expect(entries.length).toBe(2);
    expect(entries[0].enemyId).toBe('dust-mite');
    expect(entries[1].enemyId).toBe('junk-rusher');
  });
});
