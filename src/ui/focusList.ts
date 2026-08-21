export type FocusDirection = 'up' | 'down' | 'left' | 'right';
export type FocusMode = 'linear' | 'grid';

function requireSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer`);
  }
}

export class FocusNavigator {
  private _count = 0;
  private _index = -1;
  private _mode: FocusMode;
  private _columns: number;

  constructor(mode: FocusMode = 'linear', columns = 1) {
    if (mode !== 'linear' && mode !== 'grid') {
      throw new RangeError('mode must be linear or grid');
    }
    requireSafeInteger(columns, 'columns');
    if (columns <= 0) {
      throw new RangeError('columns must be positive');
    }
    this._mode = mode;
    this._columns = columns;
  }

  get index(): number { return this._index; }
  get count(): number { return this._count; }
  get mode(): FocusMode { return this._mode; }
  get columns(): number { return this._columns; }

  setCount(count: number): void {
    requireSafeInteger(count, 'count');
    if (count < 0) throw new RangeError('count must be non-negative');
    this._count = count;
    if (count === 0) this._index = -1;
    else if (this._index < 0) this._index = 0;
    else if (this._index >= count) this._index = count - 1;
  }

  setColumns(columns: number): void {
    requireSafeInteger(columns, 'columns');
    if (columns <= 0) throw new RangeError('columns must be positive');
    this._columns = columns;
  }

  setIndex(index: number): boolean {
    requireSafeInteger(index, 'index');
    if (this._count === 0) return false;
    const next = Math.max(0, Math.min(index, this._count - 1));
    const changed = next !== this._index;
    this._index = next;
    return changed;
  }

  reset(): void { this._index = this._count === 0 ? -1 : 0; }

  move(direction: FocusDirection): boolean {
    if (this._count === 0) return false;
    const i = this._index;
    let next = i;
    if (this._mode === 'linear') {
      next = direction === 'up' || direction === 'left'
        ? (i - 1 + this._count) % this._count
        : (i + 1) % this._count;
    } else {
      const row = Math.floor(i / this._columns);
      const col = i % this._columns;
      switch (direction) {
        case 'left': next = col === 0 ? i : i - 1; break;
        case 'right': next = col === this._columns - 1 || i + 1 >= this._count ? i : i + 1; break;
        case 'up': next = row === 0 ? i : i - this._columns; break;
        case 'down': {
          const start = (row + 1) * this._columns;
          next = start >= this._count ? i : Math.min(start + col, this._count - 1);
          break;
        }
      }
    }
    const changed = next !== i;
    this._index = next;
    return changed;
  }
}
