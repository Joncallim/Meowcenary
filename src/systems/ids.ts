const CONTENT_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const UNLOCK_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isContentId(value: string): boolean {
  return CONTENT_ID.test(value);
}

export function isUnlockId(value: string): boolean {
  return UNLOCK_ID.test(value);
}

/** Source-owned durable receipt, deliberately separate from content IDs. */
export function isGrantTransactionId(value: string): boolean {
  return /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$/.test(value);
}

/** Opaque durable ownership key.  It deliberately is neither a definition
 * nor an unlock identifier: two instances may have the same definition. */
export function isInstanceId(value: string): boolean {
  return /^(?:[a-z][a-z0-9-]*:)?[a-z][a-z0-9-]{0,63}(?::[a-z0-9-]{1,64})?$/.test(value);
}

/** Canonical identity for a newly granted owned copy. Definition IDs are not
 * ownership IDs; legacy-save sanitisation alone may use isInstanceId. */
export function isOwnedInstanceId(value: string): boolean {
  return /^(?:owned|reward):[a-z][a-z0-9-]{0,63}(?::[a-z0-9-]{1,64})?$/.test(value);
}
