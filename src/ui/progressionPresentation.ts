/** Pure player-facing presentation for the shared progression vocabularies.
 * Catalog consumers use this module rather than maintaining partial switches
 * that silently omit a newly authored condition or grant kind. */
import type { ProgressionCondition } from '../gameplay/conditionEvaluator';
import type { ProgressionGrant } from '../gameplay/grantProcessor';
import type { GameData } from '../systems/types';

export function describeProgressionCondition(condition: ProgressionCondition, data: GameData): string {
  switch (condition.type) {
    case 'always': return 'Available';
    case 'stage-cleared': return `Clear ${catalogName(data.stages, condition.stageId, 'Contract')}`;
    case 'boss-defeated': return `Defeat ${catalogName(data.enemies, condition.bossId, 'boss')}`;
    case 'achievement-completed': return `Complete ${catalogName(data.achievements, condition.achievementId, 'achievement')}`;
    case 'mastery-reached': return `Reach ${characterName(data, condition.subjectId)} mastery tier ${condition.tier}`;
    case 'owns-content': return `Own ${contentName(data, condition.contentId)}`;
    case 'scrap-total': return `Hold ${condition.threshold} Scrap`;
    case 'permanent-level': return `Reach ${catalogName(data.metaUpgrades, condition.upgradeId, 'upgrade')} level ${condition.minLevel}`;
    case 'unlock-count': return `Unlock ${condition.minCount} persistent rewards`;
    case 'all': return `Meet all requirements: ${condition.conditions.map((child) => describeProgressionCondition(child, data)).join('; ')}`;
    case 'any': return `Meet any requirement: ${condition.conditions.map((child) => describeProgressionCondition(child, data)).join('; ')}`;
    case 'not': return `Do not meet: ${describeProgressionCondition(condition.condition, data)}`;
  }
}

export function describeProgressionGrant(
  grant: ProgressionGrant,
  data: GameData,
  style: 'headline' | 'sentence' = 'headline',
): string {
  const prefix = (verb: string, value: string) => style === 'sentence' ? `${verb}s ${value}` : `${verb} ${value}`;
  switch (grant.type) {
    case 'grant-scrap': return style === 'sentence' ? `+${grant.amount} scrap` : `${grant.amount} Scrap`;
    case 'unlock-stage': return prefix('Unlock', catalogName(data.stages, grant.stageId, 'Contract'));
    case 'unlock-character': return prefix('Unlock', characterName(data, grant.characterId));
    case 'unlock-equipment': return prefix('Unlock', catalogName(data.equipment, grant.equipmentId, 'Equipment'));
    case 'unlock-part': return prefix('Unlock', catalogName(data.gunParts, grant.partId, 'Part'));
    case 'unlock-trait': return prefix('Unlock', humanizeId(grant.traitId));
    case 'grant-part-instance': return style === 'sentence'
      ? `Earns ${catalogName(data.gunParts, grant.partId, 'Part')}`
      : catalogName(data.gunParts, grant.partId, 'Part');
    case 'grant-equipment-instance': return style === 'sentence'
      ? `Earns ${catalogName(data.equipment, grant.equipmentId, 'Equipment')}`
      : catalogName(data.equipment, grant.equipmentId, 'Equipment');
    case 'grant-item': {
      const quantity = grant.amount ?? 1;
      const item = humanizeId(grant.itemId);
      return style === 'sentence' ? `Earns ${item}${quantity === 1 ? '' : ` ×${quantity}`}` : `${item}${quantity === 1 ? '' : ` ×${quantity}`}`;
    }
    case 'achievement-completed': return style === 'sentence'
      ? `Completes ${catalogName(data.achievements, grant.achievementId, 'achievement')}`
      : catalogName(data.achievements, grant.achievementId, 'Achievement');
    case 'permanent-upgrade-level': {
      const upgrade = catalogName(data.metaUpgrades, grant.upgradeId, 'upgrade');
      return style === 'sentence' ? `Improves ${upgrade} by ${grant.levels}` : `${upgrade} +${grant.levels}`;
    }
  }
}

function contentName(data: GameData, id: string): string {
  return catalogCharacterName(data, id) ??
    catalogName(data.stages, id,
      catalogName(data.equipment, id,
        catalogName(data.gunParts, id, humanizeId(id))));
}

/** Character definitions predate the canonical persistent unlock namespace,
 * so presentation accepts either form without leaking that storage adapter
 * into catalog data. */
function characterName(data: GameData, id: string): string {
  return catalogCharacterName(data, id) ?? humanizeId(id);
}

function catalogCharacterName(data: GameData, id: string): string | undefined {
  const catalogId = id.startsWith('character:') ? id.slice('character:'.length) : id;
  return data.characters.find((character) => character.id === catalogId)?.name;
}

/** Collect objectives own an authored item/drop identity. The same identity
 * is the logical art binding, while its stable slug supplies generic copy for
 * N+1 collectables without a scene branch. */
export function describeCollectible(itemId: string): { readonly name: string; readonly artId: string } {
  return Object.freeze({ name: humanizeId(itemId), artId: itemId });
}

function catalogName(rows: readonly { readonly id: string; readonly name: string }[] | undefined, id: string, fallback: string): string {
  return rows?.find((row) => row.id === id)?.name ?? fallback;
}

function humanizeId(id: string): string {
  const slug = id.split(':').at(-1) ?? id;
  return slug.split('-').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
