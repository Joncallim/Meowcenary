// Single source of truth for stat keys. The runtime list lets data validation
// reject unknown effect stats; the StatKey type is derived so the two cannot drift.
export const STAT_KEYS = [
  'moveSpeed',
  'maxHealth',
  'armor',
  'damage',
  'attackSpeed',
  'projectileSpeed',
  'projectileCount',
  'range',
  'critChance',
  'pickupRadius',
  'xpGain',
  'currencyGain',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export interface Modifier {
  stat: StatKey;
  op: 'add' | 'mult';
  value: number;
  sourceId: string;
}

export class ModifierStack {
  private readonly modifiers: Modifier[] = [];

  add(modifier: Modifier): void {
    if (!Number.isFinite(modifier.value)) {
      throw new Error('Modifier value must be finite');
    }

    this.modifiers.push({ ...modifier });
  }

  remove(sourceId: string): void {
    let writeIndex = 0;
    for (const modifier of this.modifiers) {
      if (modifier.sourceId !== sourceId) {
        this.modifiers[writeIndex] = modifier;
        writeIndex += 1;
      }
    }
    this.modifiers.length = writeIndex;
  }

  countBySource(sourceId: string): number {
    return this.modifiers.filter((modifier) => modifier.sourceId === sourceId).length;
  }

  resolve(stat: StatKey, baseValue: number): number {
    if (!Number.isFinite(baseValue)) {
      throw new Error(`Base value for "${stat}" must be finite`);
    }

    let value = baseValue;

    for (const modifier of this.modifiers) {
      if (modifier.stat === stat && modifier.op === 'add') {
        value += modifier.value;
      }
    }

    for (const modifier of this.modifiers) {
      if (modifier.stat === stat && modifier.op === 'mult') {
        value *= modifier.value;
      }
    }

    if (!Number.isFinite(value)) {
      throw new Error(`Resolved value for "${stat}" must be finite`);
    }

    return value;
  }
}
