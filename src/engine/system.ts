export interface System {
  update(dtMs: number): void;
  destroy(): void;
}

