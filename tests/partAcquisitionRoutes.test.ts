import { describe, expect, it } from 'vitest';
import gunPartsJson from '../src/data/gun-parts.json';
import rewardProfilesJson from '../src/data/reward-profiles.json';
import { assertPartAcquisitionRoutes } from '../src/systems/validation/parts';
import type { PartDefinition } from '../src/gameplay/gunsmith';
import type { RewardProfile } from '../src/systems/types';

describe('shipping part acquisition routes', () => {
  it('covers the exact active catalog, not merely its current count', () => {
    const parts = gunPartsJson as unknown as PartDefinition[];
    const rewards = rewardProfilesJson as unknown as RewardProfile[];
    expect(() => assertPartAcquisitionRoutes(parts, rewards)).not.toThrow();

    const routed = new Set<string>([
      ...parts.filter((part) => part.fabricationCost !== undefined).map((part) => part.id),
      ...rewards.flatMap((reward) => (reward.grants ?? [])
        .filter((grant) => grant.type === 'grant-part-instance' || grant.type === 'unlock-part')
        .map((grant) => grant.partId)),
    ]);
    expect(routed).toEqual(new Set(parts.map((part) => part.id)));
  });

  it('rejects a newly added live definition without a deliberate route', () => {
    expect(() => assertPartAcquisitionRoutes(
      [{ id: 'part:orphan' }], [],
    )).toThrow('part:orphan');
  });
});
