import { describe, expect, it } from 'vitest';
import { formatGunsmithEffect, GUNSMITH_SLOT_ORDER, gunsmithSlotLabel } from '../src/ui/gunsmithPresentation';

describe('Gunsmith player-facing presentation', () => {
  it('uses canonical slots rather than alphabetical implementation ordering', () => {
    expect(GUNSMITH_SLOT_ORDER).toEqual(['receiver', 'barrel', 'optic', 'stock', 'trigger', 'magazine', 'underbarrel', 'trait']);
    expect(gunsmithSlotLabel('trait')).toBe('Traits');
  });

  it('formats authoritative effects as player language', () => {
    expect(formatGunsmithEffect({ stat: 'attackSpeed', op: 'add', value: 0.08 }, 1)).toBe('+8% Fire Rate');
    expect(formatGunsmithEffect({ stat: 'attackSpeed', op: 'mult', value: 1.15 }, 1)).toBe('+15% Fire Rate');
    expect(formatGunsmithEffect({ stat: 'damage', op: 'mult', value: 1.12 }, 1)).toBe('+12% Damage');
    expect(formatGunsmithEffect({ stat: 'spreadDeg', op: 'add', value: -2 }, 1)).toBe('+2° Accuracy');
    expect(formatGunsmithEffect({ stat: 'projectileCount', op: 'add', value: 1 }, 1)).toBe('+1 Projectiles');
    expect(formatGunsmithEffect({ stat: 'pierce', op: 'add', value: 1 }, 1)).toBe('+1 Pierce');
  });

  it('uses percentage accuracy for multiplicative spread and shares Equipment vocabulary', () => {
    expect(formatGunsmithEffect({ stat: 'spreadDeg', op: 'mult', value: 0.85 }, 2)).toBe('+30% Accuracy');
    expect(formatGunsmithEffect({ stat: 'pickupRadius', op: 'add', value: 10 }, 2)).toBe('+20 Pickup Radius');
  });
});
