import { describe, expect, it } from 'vitest';
import { maxEquipmentTier, canUpgradeEquipment, upgradeCost, resolvePieceModifiers, ownedEquipmentId } from '../src/gameplay/equipmentV4';
import { createConditionContext, type ConditionContext } from '../src/gameplay/conditionEvaluator';

const defaultFacts: ConditionContext = {
  progression: { scrap: 0, unlocks: [], permanentUpgrades: {} },
  stages: {},
  achievements: {},
  characters: {},
  bosses: {},
};

describe('Equipment V4', () => {
  describe('maxEquipmentTier', () => {
    it('returns 1 with no facts', () => {
      expect(maxEquipmentTier(defaultFacts)).toBe(1);
    });

    it('returns 2 when J3 cleared', () => {
      const facts = createConditionContext(
        { scrap: 0, unlocks: [], permanentUpgrades: {} },
        { stages: { 'stage:junkyard-03': { completed: true } } },
      );
      expect(maxEquipmentTier(facts)).toBe(2);
    });

    it('returns 3 when Crusher defeated', () => {
      const facts = createConditionContext(
        { scrap: 0, unlocks: [], permanentUpgrades: {} },
        { bosses: { 'boss-crusher': { defeated: true } } },
      );
      expect(maxEquipmentTier(facts)).toBe(3);
    });

    it('returns 4 when Forge defeated', () => {
      const facts = createConditionContext(
        { scrap: 0, unlocks: [], permanentUpgrades: {} },
        { bosses: { 'boss-forge': { defeated: true } } },
      );
      expect(maxEquipmentTier(facts)).toBe(4);
    });

    it('respects capability floors', () => {
      expect(maxEquipmentTier(defaultFacts, ['capability:equipment-tier-3'])).toBe(3);
    });
  });

  describe('canUpgradeEquipment', () => {
    it('allows upgrade when below max tier', () => {
      const facts = createConditionContext(
        { scrap: 0, unlocks: [], permanentUpgrades: {} },
        { bosses: { 'boss-forge': { defeated: true } } },
      );
      expect(canUpgradeEquipment(1, facts)).toBe(true);
      expect(canUpgradeEquipment(3, facts)).toBe(true);
    });

    it('blocks upgrade at max tier', () => {
      const facts = createConditionContext(
        { scrap: 0, unlocks: [], permanentUpgrades: {} },
        { bosses: { 'boss-forge': { defeated: true } } },
      );
      expect(canUpgradeEquipment(4, facts)).toBe(false);
    });
  });

  describe('upgradeCost', () => {
    it('returns correct costs', () => {
      expect(upgradeCost(1)).toBe(100);
      expect(upgradeCost(2)).toBe(150);
      expect(upgradeCost(3)).toBe(200);
    });
  });

  describe('resolvePieceModifiers', () => {
    it('scales additive modifiers by tier', () => {
      const result = resolvePieceModifiers(
        [{ stat: 'maxHealth', op: 'add', value: 10 }],
        2,
      );
      expect(result[0].value).toBe(20);
    });

    it('scales multiplicative modifiers correctly', () => {
      const result = resolvePieceModifiers(
        [{ stat: 'damage', op: 'mult', value: 1.05 }],
        2,
      );
      expect(result[0].value).toBeCloseTo(1.10);
    });
  });

  describe('ownedEquipmentId', () => {
    it('generates deterministic owned ID', () => {
      expect(ownedEquipmentId('equipment:commando-helmet')).toBe('owned:equipment:commando-helmet');
    });
  });
});
