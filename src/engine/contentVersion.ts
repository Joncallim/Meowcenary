/** Deterministic fixtures are tied to a catalog, not a Save V3 schema. */
export interface ContentVersionStamp { readonly contentVersion: string }

export function stampContentVersion(contentVersion: string): ContentVersionStamp {
  return Object.freeze({ contentVersion });
}

/** Refuse a replay whose authored catalog differs from the loaded catalog. */
export function assertContentVersion(expected: ContentVersionStamp, actual: string): void {
  if (expected.contentVersion !== actual) {
    throw new Error(`Content version mismatch: replay ${expected.contentVersion}, catalog ${actual}`);
  }
}
