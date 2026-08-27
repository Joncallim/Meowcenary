/**
 * Shared deep-freeze utility for immutable game data.
 *
 * Recursively deep-freezes any object value using Object.freeze. Used by all
 * data registries to enforce runtime immutability of validated game data.
 * Exported from a single module to eliminate copy-paste duplication across
 * the codebase (see P1-2 of issue #94 closeout audit).
 *
 * NOTE: This is a shallow structural freeze — it does not freeze Maps, Sets,
 * or non-plain objects (those are handled by the caller). For plain objects
 * and arrays it recursively freezes every enumerable own property.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
