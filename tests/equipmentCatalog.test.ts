import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EQUIPMENT_BROWSE_STATE,
  equipmentGrade,
  equipmentGradeAccessibleCopy,
  equipmentGradeCopy,
  filterAndSortEquipmentCatalog,
  matchesEquipmentBrowse,
  sortEquipmentCatalog,
  type EquipmentBrowseState,
  type EquipmentCatalogEntry,
} from '../src/ui/equipmentCatalog';

function entry(overrides: Partial<EquipmentCatalogEntry> = {}): EquipmentCatalogEntry {
  return {
    kind: 'owned', id: 'owned:alpha', equipmentId: 'equipment:alpha', name: 'Alpha Helmet',
    slot: 'helmet', setId: 'commando', setName: 'Commando', setEmblemArtId: 'set:commando',
    grade: 1, iconArtId: 'equipment:alpha', state: 'STORED', effectSummary: ['+5% Fire Rate'],
    searchText: 'Alpha Helmet Commando helmet Standard +5% Fire Rate',
    readiness: 'ready', ...overrides,
  };
}

function state(filters: Partial<EquipmentBrowseState['filters']>, sort: EquipmentBrowseState['sort'] = 'name'): EquipmentBrowseState {
  return { ...DEFAULT_EQUIPMENT_BROWSE_STATE, filters: { ...DEFAULT_EQUIPMENT_BROWSE_STATE.filters, ...filters }, sort };
}

describe('equipment catalog presentation state', () => {
  it('uses named grades, ordinal cues, and four chevron levels', () => {
    expect(equipmentGrade(1)).toMatchObject({ number: 1, name: 'Standard', chevrons: '›' });
    expect(equipmentGrade(4)).toMatchObject({ number: 4, name: 'Masterwork', chevrons: '››››' });
    expect(equipmentGrade(99).number).toBe(4);
    expect(equipmentGradeCopy(2)).toBe('Reinforced ››');
    expect(equipmentGradeAccessibleCopy(3)).toContain('Upgrade grade 3 of 4');
  });

  it('applies OR within a facet and AND across facets, including effect-label search', () => {
    const catalog = [
      entry(),
      entry({ id: 'owned:bravo', name: 'Bravo Boots', slot: 'boots', searchText: 'Bravo Boots Commando boots Standard +5% Fire Rate' }),
      entry({ id: 'owned:charlie', name: 'Charlie Helmet', setId: 'recon', setName: 'Recon', searchText: 'Charlie Helmet Recon helmet Standard +10% Range' }),
    ];
    const result = filterAndSortEquipmentCatalog(catalog, state({ slots: ['helmet', 'boots'], sets: ['commando'], query: 'fire rate' }));
    expect(result.map((item) => item.id)).toEqual(['owned:alpha', 'owned:bravo']);
    expect(matchesEquipmentBrowse(catalog[2]!, state({ slots: ['helmet', 'boots'], sets: ['commando'] }))).toBe(false);
    expect(filterAndSortEquipmentCatalog(catalog, state({ query: 'range' })).map((item) => item.id)).toEqual(['owned:charlie']);
  });

  it('sorts in both meaningful directions with a stable instance-id tie-break', () => {
    const catalog = [
      entry({ id: 'owned:zulu', name: 'Same Name', grade: 2 }),
      entry({ id: 'owned:alpha', name: 'Same Name', grade: 2 }),
      entry({ id: 'owned:bravo', name: 'Bravo', grade: 4 }),
    ];
    expect(sortEquipmentCatalog(catalog, state({}, 'name')).map((item) => item.id)).toEqual(['owned:bravo', 'owned:alpha', 'owned:zulu']);
    expect(sortEquipmentCatalog(catalog, { ...state({}, 'grade'), direction: 'desc' }).map((item) => item.id)).toEqual(['owned:bravo', 'owned:alpha', 'owned:zulu']);
  });

  it('keeps readiness filters scoped to upgradeable owned rows, excluding blueprints', () => {
    const catalog = [
      entry({ id: 'owned:ready', readiness: 'ready' }),
      entry({ id: 'owned:poor', readiness: 'insufficient-scrap' }),
      entry({ id: 'blueprint:alpha', kind: 'blueprint', state: 'FABRICABLE', readiness: 'not-applicable' }),
    ];
    expect(filterAndSortEquipmentCatalog(catalog, state({ readiness: ['ready'] })).map((item) => item.id)).toEqual(['owned:ready']);
    expect(filterAndSortEquipmentCatalog(catalog, state({ ownership: ['blueprint'] })).map((item) => item.id)).toEqual(['blueprint:alpha']);
  });
});
