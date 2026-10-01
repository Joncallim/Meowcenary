import type { GameContext } from '../engine/context';
import { createEquipmentVisualRegistry } from '../presentation/equipmentVisuals';
import { DataEquipmentRegistry } from '../systems/equipment';
import { equipEquipment, unequipEquipment, maxEquipmentTier, upgradeCost, type EquipmentSlot, type OwnedEquipment } from '../gameplay/equipment';
import { createConditionContext, evaluateCondition } from '../gameplay/conditionEvaluator';
import { presentLoadoutModifier, type LoadoutEffectPresentation } from './loadoutPresentation';
import { describeProgressionCondition } from './progressionPresentation';
import { resolveEquipmentComparison, resolveEquipmentLoadoutPresentation, type EquipmentComparison, type EquipmentLoadoutPresentation, type EquipmentPreviewCommand } from './equipmentPresentation';
export interface EquipmentSnapshot {
    readonly presentation: EquipmentLoadoutPresentation;
    readonly selectedSlot: EquipmentSlot;
    readonly selectedInstanceId?: string;
    readonly selectedBlueprintId?: string;
    readonly comparison?: EquipmentComparison;
    readonly equipped: Readonly<Record<string, string | undefined>>;
    readonly owned: readonly {
        readonly instanceId: string;
        readonly equipmentId: string;
        readonly name: string;
        readonly setName: string;
        readonly setEmblemArtId: string;
        readonly setPieces: number;
        readonly slot: string;
        readonly tier: number;
        readonly iconArtId: string;
        readonly effectSummary: readonly string[];
        readonly comparisonSummary?: string;
        readonly upgradeCost?: number;
        readonly upgradeLocked?: boolean;
        readonly upgradePreview?: EquipmentComparison;
        readonly upgradeLockReason?: string;
    }[];
    readonly blueprints: readonly {
        readonly equipmentId: string;
        readonly name: string;
        readonly setName: string;
        readonly setEmblemArtId: string;
        readonly slot: string;
        readonly iconArtId: string;
        readonly fabricationCost: number;
        readonly effectSummary: readonly string[];
        readonly effects: readonly LoadoutEffectPresentation[];
    }[];
    readonly activeSets: readonly {
        readonly name: string;
        readonly emblemArtId: string;
        readonly pieces: number;
        readonly activeThresholds: readonly (2 | 4)[];
        readonly bonusSummary: readonly string[];
    }[];
    readonly unavailable: readonly {
        readonly instanceId: string;
        readonly equipmentId: string;
    }[];
}
export class EquipmentController {
    private readonly registry: DataEquipmentRegistry;
    private selectedSlot: EquipmentSlot = 'helmet';
    private selectedInstanceId?: string;
    private selectedBlueprintId?: string;
    constructor(private readonly context: GameContext) { this.registry = new DataEquipmentRegistry({ equipment: context.data.equipment ?? [], equipmentSets: context.data.equipmentSets ?? [], equipmentRules: context.data.equipmentRules ?? { unlocks: { 2: { type: 'always' }, 3: { type: 'always' }, 4: { type: 'always' } } } }); }
    private facts() { const s = this.context.saveData; return createConditionContext(s.progression, { stages: s.stages, achievements: s.achievements, characters: s.characters, bosses: s.bosses }); }
    snapshot(): EquipmentSnapshot {
        const state = this.context.saveData;
        const equipped = Object.freeze({ ...(state.equipmentLoadout ?? {}) });
        const facts = this.facts();
        const maxTier = maxEquipmentTier(facts, this.registry.rules, state.progression.unlocks);
        const ownedDefinitionIds = new Set(Object.values(state.equipment).map((item) => item.equipmentId));
        const presentation = resolveEquipmentLoadoutPresentation(state, this.context.data);
        const selected = this.selectedInstanceId === undefined ? undefined : state.equipment[this.selectedInstanceId];
        const selectedDefinition = selected && this.registry.equipmentById(selected.equipmentId);
        const selectedInstanceId = selectedDefinition?.slot === this.selectedSlot ? this.selectedInstanceId : undefined;
        const selectedBlueprintId = this.selectedBlueprintId !== undefined
            && this.registry.equipmentById(this.selectedBlueprintId)?.slot === this.selectedSlot
            && !ownedDefinitionIds.has(this.selectedBlueprintId) ? this.selectedBlueprintId : undefined;
        const owned = presentation.slots.flatMap((slot) => slot.candidates.map((item) => {
            const set = presentation.sets.find((row) => row.setId === item.setId)!;
            const cost = item.tier < maxTier ? upgradeCost(item.tier) : undefined;
            const upgradeLockReason = item.tier < 4 && item.tier >= maxTier
                ? describeProgressionCondition(this.registry.rules.unlocks[(item.tier + 1) as 2 | 3 | 4], this.context.data)
                : undefined;
            return Object.freeze({ ...item, setName: set.name, setEmblemArtId: set.emblemArtId,
                setPieces: set.equippedCount,
                effectSummary: Object.freeze(item.effects.map((effect) => effect.kind === 'modifier' ? effect.text : effect.label)),
                upgradePreview: item.instanceId === selectedInstanceId && item.tier < 4
                    ? this.preview({ kind: 'upgrade', instanceId: item.instanceId }) : undefined,
                upgradeLockReason,
                ...(cost === undefined ? { upgradeLocked: item.tier < 4 } : { upgradeCost: cost }),
            });
        }));
        const visuals = createEquipmentVisualRegistry(this.context.data);
        const blueprints = this.registry.all().flatMap((piece) => {
            const set = this.registry.setById(piece.setId)!;
            if (!evaluateCondition(set.unlock, facts) || ownedDefinitionIds.has(piece.id)) return [];
            const effects = Object.freeze(piece.effects.map((effect) => presentLoadoutModifier(effect)));
            return [Object.freeze({ equipmentId: piece.id, name: piece.name, setName: set.name,
                setEmblemArtId: set.emblem, slot: piece.slot, iconArtId: visuals?.resolveEquipmentVisual(piece.id, 1)?.iconArtId ?? piece.icon,
                fabricationCost: set.pieceFabricationCost, effects,
                effectSummary: Object.freeze(effects.map((effect) => effect.text)),
            })];
        });
        const activeSets = presentation.sets.filter((set) => set.equippedCount > 0).map((set) => {
            const thresholds = set.thresholds.filter((threshold) => threshold.active);
            return Object.freeze({ name: set.name, emblemArtId: set.emblemArtId, pieces: set.equippedCount,
                activeThresholds: Object.freeze(thresholds.map((threshold) => threshold.count)),
                bonusSummary: Object.freeze(thresholds.map((threshold) =>
                    `${threshold.count}-piece: ${threshold.effects.map((effect) => effect.kind === 'modifier' ? effect.text : effect.label).join(', ')}`)),
            });
        });
        const unavailable = Object.entries(state.equipment).flatMap(([instanceId, item]) =>
            this.registry.equipmentById(item.equipmentId) ? [] : [Object.freeze({ instanceId, equipmentId: item.equipmentId })]);
        return Object.freeze({ presentation, selectedSlot: this.selectedSlot, selectedInstanceId, selectedBlueprintId,
            comparison: selectedInstanceId === undefined ? undefined : this.preview({ kind: 'equip', instanceId: selectedInstanceId }),
            equipped, owned: Object.freeze(owned), blueprints: Object.freeze(blueprints),
            activeSets: Object.freeze(activeSets), unavailable: Object.freeze(unavailable),
        });
    }
    selectSlot(slot: EquipmentSlot): boolean {
        if (!['helmet', 'armour', 'gloves', 'boots'].includes(slot))
            return false;
        this.selectedSlot = slot;
        this.selectedInstanceId = this.context.saveData.equipmentLoadout?.[slot];
        this.selectedBlueprintId = undefined;
        return true;
    }
    selectCandidate(instanceId: string): boolean {
        const item = this.context.saveData.equipment[instanceId];
        const definition = item && this.registry.equipmentById(item.equipmentId);
        if (!definition || definition.slot !== this.selectedSlot)
            return false;
        this.selectedInstanceId = instanceId;
        this.selectedBlueprintId = undefined;
        return true;
    }
    selectBlueprint(equipmentId: string): boolean {
        if (!this.snapshot().blueprints.some((piece) => piece.equipmentId === equipmentId && piece.slot === this.selectedSlot))
            return false;
        this.selectedBlueprintId = equipmentId;
        this.selectedInstanceId = undefined;
        return true;
    }
    preview(command: EquipmentPreviewCommand): EquipmentComparison | undefined {
        return resolveEquipmentComparison(this.context.saveData, this.context.data, command);
    }
    equip(instanceId: string): boolean {
        return this.context.updateEquipment(({ equipment, loadout }) => {
            const owned = new Map<string, OwnedEquipment>(Object.entries(equipment).map(([id, item]) => [id, { instanceId: id, ...item }]));
            const item = owned.get(instanceId);
            const definition = item && this.registry.equipmentById(item.equipmentId);
            if (!definition || loadout[definition.slot] === instanceId)
                return undefined;
            const result = equipEquipment({ equipped: loadout }, instanceId, this.registry.asMap(), owned);
            return result.ok ? { equipment, loadout: result.loadout.equipped } : undefined;
        }).persisted;
    }
    unequip(slot: EquipmentSlot): boolean {
        return this.context.updateEquipment(({ equipment, loadout }) => {
            const result = unequipEquipment({ equipped: loadout }, slot);
            return result.ok ? { equipment, loadout: result.loadout.equipped } : undefined;
        }).persisted;
    }
    upgrade(instanceId: string, expectedTier?: number): boolean {
        const save = this.context.saveData;
        const item = save.equipment[instanceId];
        if (!item || (expectedTier !== undefined && item.tier !== expectedTier)
            || item.tier >= maxEquipmentTier(this.facts(), this.registry.rules, save.progression.unlocks)
            || save.progression.scrap < upgradeCost(item.tier)) return false;
        return this.context.commitEquipmentUpgrade(instanceId, item.tier, item.tier + 1, upgradeCost(item.tier));
    }
    fabricable(): readonly string[] { return this.snapshot().blueprints.map((blueprint) => blueprint.equipmentId); }
    fabricate(equipmentId: string): boolean {
        const persisted = this.context.fabricateEquipment(equipmentId);
        if (persisted && this.selectedBlueprintId === equipmentId) {
            this.selectedInstanceId = Object.entries(this.context.saveData.equipment).find(([, item]) => item.equipmentId === equipmentId)?.[0];
            this.selectedBlueprintId = undefined;
        }
        return persisted;
    }
}
