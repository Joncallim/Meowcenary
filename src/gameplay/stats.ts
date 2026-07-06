export type StatKey =
  | 'moveSpeed'
  | 'maxHealth'
  | 'armor'
  | 'damage'
  | 'fireRate'
  | 'attackSpeed'
  | 'projectileSpeed'
  | 'projectileCount'
  | 'range'
  | 'critChance'
  | 'pickupRadius'
  | 'xpGain'
  | 'currencyGain';

export interface Modifier {
  stat: StatKey;
  op: 'add' | 'mult';
  value: number;
  sourceId: string;
}

export class ModifierStack {
  private readonly modifiers: Modifier[] = [];

  add(modifier: Modifier): void {
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

    return value;
  }
}
