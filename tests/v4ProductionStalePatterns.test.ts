import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

/** Narrow production-only regression gate. Historical migrations and test
 * fixtures are intentionally outside this allow-list; new live wiring must
 * not smuggle RC1 shapes back into composition roots. */
describe('V4 production stale-pattern gate', () => {
  it('keeps retired content fields out of shipped Part and Equipment catalogs', () => {
    const parts = JSON.parse(source('src/data/gun-parts.json')) as Array<Record<string, unknown>>;
    const equipment = JSON.parse(source('src/data/equipment.json')) as Array<Record<string, unknown>>;
    for (const row of parts) {
      expect(row).not.toHaveProperty('tier');
      for (const effect of (row.effects ?? []) as Array<Record<string, unknown>>) expect(effect).not.toHaveProperty('sourceId');
    }
    for (const row of equipment) {
      expect(row).not.toHaveProperty('tier');
      expect(row).not.toHaveProperty('upgradeUnlocks');
      expect(row).not.toHaveProperty('setBonuses');
      for (const effect of (row.effects ?? []) as Array<Record<string, unknown>>) expect(effect).not.toHaveProperty('sourceId');
    }
  });

  it('keeps retired RC1 implementation patterns out of live roots', () => {
    const gunsmith = source('src/ui/gunsmithController.ts');
    const gunsmithRules = source('src/gameplay/gunsmith.ts');
    const equipmentRules = source('src/gameplay/equipment.ts');
    const boot = source('src/scenes/BootScene.ts');
    const menu = source('src/scenes/MenuScene.ts');
    expect(gunsmith).not.toMatch(/\[\s*'pistol'\s*,\s*'smg'\s*,\s*'shotgun'\s*\]/);
    expect(gunsmith).not.toMatch(/\.slice\(0,\s*MAX_TRAITS_PER_PART\)/);
    expect(gunsmith).not.toMatch(/:\$\{(?:attempt|suffix|index)\}/);
    expect(gunsmith).not.toMatch(/effect\.value\s*\*\s*tier/);
    expect(gunsmithRules).not.toMatch(/interface\s+PartDefinition\s*\{[^}]*\btier\b/s);
    expect(gunsmithRules).not.toMatch(/WEAPON_SLOT_COMPATIBILITY/);
    expect(gunsmithRules).not.toMatch(/effect\.value\s*\*\s*tier/);
    expect(gunsmithRules).not.toMatch(/\.slice\(0,\s*MAX_(?:EFFECTIVE_)?TRAITS?_PER_PART\)/);
    expect(equipmentRules).not.toMatch(/interface\s+EquipmentDefinition\s*\{[^}]*\btier\b/s);
    expect(boot).not.toMatch(/allBindings\(\).*forEach/);
    expect(menu).not.toMatch(/label:\s*'Arena'/);
    expect(menu).not.toMatch(/label:\s*'Stage'/);
    expect(menu).not.toMatch(/Career[^\n]*open\('stage'\)/);
    expect(source('src/engine/context.ts')).not.toMatch(/permanent-upgrade-level[^\n]*return true/);
  });
});
