import { describe, expect, it } from 'vitest';
import { isValidFamily, getAllFamilyIds, getWeaponFamily, isSlotCompatible, getFamilySlots, validateFamilySlots } from '../src/gameplay/weaponFamilies';

describe('Weapon Families', () => {
  it('has the three standard families', () => {
    const ids = getAllFamilyIds();
    expect(ids).toContain('pistol');
    expect(ids).toContain('smg');
    expect(ids).toContain('shotgun');
  });

  it('returns family definitions', () => {
    const pistol = getWeaponFamily('pistol');
    expect(pistol).toBeDefined();
    expect(pistol?.name).toBe('Pistol');
    expect(pistol?.gunsmithSlots).toContain('barrel');
  });

  it('validates family IDs', () => {
    expect(isValidFamily('pistol')).toBe(true);
    expect(isValidFamily('carbine')).toBe(false);
  });

  it('checks slot compatibility', () => {
    expect(isSlotCompatible('pistol', 'barrel')).toBe(true);
    expect(isSlotCompatible('pistol', 'stock')).toBe(false);
    // trait slot is universally compatible
    expect(isSlotCompatible('pistol', 'trait')).toBe(true);
  });

  it('returns family slots', () => {
    const slots = getFamilySlots('pistol');
    expect(slots).toContain('receiver');
    expect(slots).not.toContain('stock');
  });

  it('validates all slots in catalog', () => {
    const errors = validateFamilySlots();
    expect(errors).toEqual([]);
  });
});
