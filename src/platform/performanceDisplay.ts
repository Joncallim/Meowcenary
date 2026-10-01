/** Diagnostic-only identity walk. Do not retain the returned set after an
 * action; neither telemetry nor durable state holds references to live nodes. */
export interface DisplayNode {
  readonly list?: readonly DisplayNode[];
}
export function collectDisplayObjects(roots: readonly DisplayNode[]): Set<DisplayNode> {
  const objects = new Set<DisplayNode>();
  const pending = [...roots];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (objects.has(node)) continue;
    objects.add(node);
    if (node.list) pending.push(...node.list);
  }
  return objects;
}
export function displayObjectChange(before: ReadonlySet<DisplayNode>, after: ReadonlySet<DisplayNode>) {
  let created = 0;
  let destroyed = 0;
  for (const node of after) if (!before.has(node)) created += 1;
  for (const node of before) if (!after.has(node)) destroyed += 1;
  return { created, destroyed, stableObjects: after.size };
}
