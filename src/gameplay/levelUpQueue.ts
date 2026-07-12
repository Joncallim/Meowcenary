export class PendingLevelUps {
  private readonly levels: number[] = [];

  enqueue(level: number): boolean {
    if (!Number.isSafeInteger(level) || level <= 0) {
      throw new Error('Level-up queue requires a positive integer level');
    }

    this.levels.push(level);
    return this.levels.length === 1;
  }

  current(): number | undefined {
    return this.levels[0];
  }

  completeCurrent(): number | undefined {
    this.levels.shift();
    return this.current();
  }

  get pendingCount(): number {
    return this.levels.length;
  }

  clear(): void {
    this.levels.length = 0;
  }
}
