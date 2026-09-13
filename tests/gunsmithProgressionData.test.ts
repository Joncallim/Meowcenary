import { describe, expect, it } from 'vitest';
import gunPartsJson from '../src/data/gun-parts.json';
import rewardProfilesJson from '../src/data/reward-profiles.json';
import type { PartDefinition } from '../src/gameplay/gunsmith';

const parts = new Map((gunPartsJson as unknown as PartDefinition[]).map((part) => [part.id, part] as const));
const rewards = rewardProfilesJson as unknown as Array<{ id: string; grants?: Array<{ type: string; partId?: string }> }>;

describe('Gunsmith first-pass progression cadence', () => {
  it('keeps the exact intended blueprint costs and gates', () => {
    expect(parts.get('part:receiver-compact')).toMatchObject({ fabricationCost: 60, unlock: { type: 'always' } });
    expect(parts.get('part:barrel-standard')).toMatchObject({ fabricationCost: 60, unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-01' } });
    expect(parts.get('part:barrel-long')).toMatchObject({ fabricationCost: 110, unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-01' } });
    expect(parts.get('part:optic-red-dot')).toMatchObject({ fabricationCost: 70, unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-02' } });
    expect(parts.get('part:stock-padded')).toMatchObject({ fabricationCost: 70, unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-02' } });
    expect(parts.get('part:magazine-extended')).toMatchObject({ fabricationCost: 80, unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-03' } });
    expect(parts.get('part:receiver-heavy')).toMatchObject({ fabricationCost: 120, unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-03' } });
    expect(parts.get('part:trigger-hair')).toMatchObject({ fabricationCost: 120, unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-04' } });
    expect(parts.get('part:trait-fire')).toMatchObject({ fabricationCost: 120, unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-05' } });
    expect(parts.get('part:barrel-piercing')).toMatchObject({ fabricationCost: 200, unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-05' } });
  });

  it('keeps special Forge and Warden parts reward-only', () => {
    expect(parts.get('part:underbarrel-grenade')?.fabricationCost).toBeUndefined();
    expect(parts.get('part:trait-fire-mastered')?.fabricationCost).toBeUndefined();
    const rewardIds = new Set(rewards.flatMap((reward) => reward.grants ?? []).map((grant) => grant.partId));
    expect(rewardIds.has('part:underbarrel-grenade')).toBe(true);
    expect(rewardIds.has('part:trait-fire-mastered')).toBe(true);
  });
});
