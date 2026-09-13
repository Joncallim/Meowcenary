import { describe, expect, it } from 'vitest';
import { formatGunsmithEffect, GUNSMITH_SLOT_ORDER, gunsmithSlotLabel } from '../src/ui/gunsmithPresentation';

describe('Gunsmith player-facing presentation', () => {
  it('uses canonical slots rather than alphabetical implementation ordering', () => {
    expect(GUNSMITH_SLOT_ORDER).toEqual(['receiver', 'barrel', 'optic', 'stock', 'trigger', 'magazine', 'underbarrel', 'trait']);
    expect(gunsmithSlotLabel('trait')).toBe('Traits');
  });

  it('formats authoritative effects as player language', () => {
    expect(formatGunsmithEffect({ stat: 'attackSpeed', op: 'add', value: 0.08 }, 1)).toBe('Fire rate +8%');
    expect(formatGunsmithEffect({ stat: 'attackSpeed', op: 'mult', value: 1.15 }, 1)).toBe('Fire rate +15%');
    expect(formatGunsmithEffect({ stat: 'damage', op: 'mult', value: 1.12 }, 1)).toBe('Damage +12%');
    expect(formatGunsmithEffect({ stat: 'spreadDeg', op: 'add', value: -2 }, 1)).toBe('Accuracy +2°');
    expect(formatGunsmithEffect({ stat: 'projectileCount', op: 'add', value: 1 }, 1)).toBe('+1 projectile');
    expect(formatGunsmithEffect({ stat: 'pierce', op: 'add', value: 1 }, 1)).toBe('+1 pierce');
  });
});
