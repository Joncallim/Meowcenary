import type { EquipmentSlot } from '../gameplay/equipment';

export const EQUIPMENT_GRADE_NAMES = ['Standard', 'Reinforced', 'Advanced', 'Masterwork'] as const;
export const EQUIPMENT_GRADE_CHEVRONS = ['›', '››', '›››', '››››'] as const;

export type EquipmentGrade = 1 | 2 | 3 | 4;
export type EquipmentSortKey = 'name' | 'grade' | 'set' | 'upgrade-cost';
export type EquipmentSortDirection = 'asc' | 'desc';
export type EquipmentOwnershipFilter = 'equipped' | 'stored' | 'blueprint';
export type EquipmentReadinessFilter = 'ready' | 'insufficient-scrap' | 'progression-lock' | 'maxed';
export type EquipmentFilterFacet = 'slot' | 'set' | 'grade' | 'ownership' | 'readiness';

export interface EquipmentBrowseFilters {
  readonly query: string;
  readonly slots: readonly EquipmentSlot[];
  readonly sets: readonly string[];
  readonly grades: readonly EquipmentGrade[];
  readonly ownership: readonly EquipmentOwnershipFilter[];
  readonly readiness: readonly EquipmentReadinessFilter[];
}

export interface EquipmentBrowseState {
  readonly filters: EquipmentBrowseFilters;
  readonly sort: EquipmentSortKey;
  readonly direction: EquipmentSortDirection;
}

export interface EquipmentCatalogEntry {
  readonly kind: 'owned' | 'blueprint';
  readonly id: string;
  readonly equipmentId: string;
  readonly name: string;
  readonly slot: EquipmentSlot;
  readonly setId: string;
  readonly setName: string;
  readonly setEmblemArtId: string;
  readonly grade: EquipmentGrade;
  readonly iconArtId: string;
  readonly state: 'EQUIPPED' | 'STORED' | 'FABRICABLE';
  readonly effectSummary: readonly string[];
  readonly searchText: string;
  readonly upgradeCost?: number;
  readonly readiness: EquipmentReadinessFilter | 'not-applicable';
  readonly upgradeLockReason?: string;
  readonly fabricationCost?: number;
  readonly affordable?: boolean;
}

export const DEFAULT_EQUIPMENT_BROWSE_STATE: EquipmentBrowseState = Object.freeze({
  // The equipped strip provides the current-slot context; the initial
  // catalogue remains All slots so the first browse frame shows inventory
  // rather than spending its phone viewport on a hidden facet transition.
  filters: Object.freeze({ query: '', slots: [] as readonly EquipmentSlot[], sets: [], grades: [], ownership: [], readiness: [] }),
  sort: 'name',
  direction: 'asc',
});

export function equipmentGrade(tier: number): {
  readonly number: EquipmentGrade;
  readonly name: typeof EQUIPMENT_GRADE_NAMES[number];
  readonly chevrons: typeof EQUIPMENT_GRADE_CHEVRONS[number];
  readonly accessibleLabel: string;
} {
  const number = Math.max(1, Math.min(4, Math.trunc(tier))) as EquipmentGrade;
  return {
    number,
    name: EQUIPMENT_GRADE_NAMES[number - 1]!,
    chevrons: EQUIPMENT_GRADE_CHEVRONS[number - 1]!,
    accessibleLabel: `Upgrade grade ${number} of 4`,
  };
}

export function equipmentGradeCopy(tier: number): string {
  const grade = equipmentGrade(tier);
  return `${grade.name} ${grade.chevrons}`;
}

export function equipmentGradeAccessibleCopy(tier: number): string {
  const grade = equipmentGrade(tier);
  return `${equipmentGradeCopy(tier)} • ${grade.accessibleLabel}`;
}

export function equipmentBrowseFilterCount(filters: EquipmentBrowseFilters): number {
  return [filters.query.trim(), filters.slots.length, filters.sets.length, filters.grades.length,
    filters.ownership.length, filters.readiness.length].filter((value) => value !== '' && value !== 0).length;
}

export function matchesEquipmentBrowse(entry: EquipmentCatalogEntry, state: EquipmentBrowseState): boolean {
  const filters = state.filters;
  const query = filters.query.trim().toLocaleLowerCase();
  if (query && !entry.searchText.toLocaleLowerCase().includes(query)) return false;
  if (filters.slots.length && !filters.slots.includes(entry.slot)) return false;
  if (filters.sets.length && !filters.sets.includes(entry.setId)) return false;
  if (filters.grades.length && !filters.grades.includes(entry.grade)) return false;
  const ownership = entry.kind === 'blueprint' ? 'blueprint' : entry.state.toLocaleLowerCase() as 'equipped' | 'stored';
  if (filters.ownership.length && !filters.ownership.includes(ownership)) return false;
  if (filters.readiness.length && (entry.readiness === 'not-applicable' || !filters.readiness.includes(entry.readiness))) return false;
  return true;
}

export function sortEquipmentCatalog(entries: readonly EquipmentCatalogEntry[], state: EquipmentBrowseState): readonly EquipmentCatalogEntry[] {
  const direction = state.direction === 'asc' ? 1 : -1;
  const sorted = [...entries].sort((left, right) => {
    const leftValue = state.sort === 'grade' ? left.grade
      : state.sort === 'set' ? left.setName.toLocaleLowerCase()
        : state.sort === 'upgrade-cost' ? left.upgradeCost ?? Number.POSITIVE_INFINITY
          : left.name.toLocaleLowerCase();
    const rightValue = state.sort === 'grade' ? right.grade
      : state.sort === 'set' ? right.setName.toLocaleLowerCase()
        : state.sort === 'upgrade-cost' ? right.upgradeCost ?? Number.POSITIVE_INFINITY
          : right.name.toLocaleLowerCase();
    if (leftValue < rightValue) return -1 * direction;
    if (leftValue > rightValue) return 1 * direction;
    return left.id.localeCompare(right.id);
  });
  return Object.freeze(sorted);
}

export function filterAndSortEquipmentCatalog(entries: readonly EquipmentCatalogEntry[], state: EquipmentBrowseState): readonly EquipmentCatalogEntry[] {
  return sortEquipmentCatalog(entries.filter((entry) => matchesEquipmentBrowse(entry, state)), state);
}

export function equipmentSortCopy(sort: EquipmentSortKey, direction: EquipmentSortDirection): string {
  const labels: Record<EquipmentSortKey, string> = {
    name: 'Name', grade: 'Grade', set: 'Set', 'upgrade-cost': 'Upgrade cost',
  };
  const arrows = sort === 'grade' ? direction === 'asc' ? '1→4' : '4→1'
    : sort === 'upgrade-cost' ? direction === 'asc' ? 'low→high' : 'high→low'
      : direction === 'asc' ? 'A→Z' : 'Z→A';
  return `${labels[sort]} ${arrows}`;
}
