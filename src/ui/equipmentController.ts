import type { GameContext } from '../engine/context';
import { createEquipmentVisualRegistry } from '../presentation/equipmentVisuals';
import { DataEquipmentRegistry } from '../systems/equipment';
import { equipEquipment, unequipEquipment, maxEquipmentTier, upgradeCost, type EquipmentSlot, type OwnedEquipment } from '../gameplay/equipment';
import { createConditionContext, evaluateCondition } from '../gameplay/conditionEvaluator';
import { presentLoadoutModifier, type LoadoutEffectPresentation } from './loadoutPresentation';
import { describeProgressionCondition } from './progressionPresentation';
import { resolveEquipmentComparison, resolveEquipmentLoadoutPresentation, type EquipmentComparison, type EquipmentLoadoutPresentation, type EquipmentPreviewCommand } from './equipmentPresentation';
import {
    DEFAULT_EQUIPMENT_BROWSE_STATE,
    equipmentGrade,
    filterAndSortEquipmentCatalog,
    type EquipmentBrowseState,
    type EquipmentCatalogEntry,
    type EquipmentFilterFacet,
    type EquipmentGrade,
    type EquipmentOwnershipFilter,
    type EquipmentReadinessFilter,
} from './equipmentCatalog';
import type { EquipmentSetDefinition } from '../gameplay/equipment';
export interface EquipmentSnapshot {
    readonly progression: {
        readonly characterName: string;
        readonly masteryTier: number;
        readonly equipmentGradeCap: EquipmentGrade;
        readonly nextGradeRequirement?: string;
    };
    readonly presentation: EquipmentLoadoutPresentation;
    readonly acquisition: readonly {
        readonly equipmentId: string;
        readonly setId: string;
        readonly name: string;
        readonly slot: string;
        readonly owned: boolean;
        readonly available: boolean;
        readonly summary: string;
    }[];
    readonly selectedSlot: EquipmentSlot;
    readonly selectedInstanceId?: string;
    readonly selectedBlueprintId?: string;
    readonly comparison?: EquipmentComparison;
    readonly browse: EquipmentBrowseState;
    readonly catalog: readonly EquipmentCatalogEntry[];
    readonly filteredCatalog: readonly EquipmentCatalogEntry[];
    readonly setCatalog: readonly {
        readonly setId: string;
        readonly name: string;
        readonly description: string;
        readonly emblemArtId: string;
        readonly pieces: number;
        readonly available: boolean;
        readonly unlockReason: string;
        readonly thresholds: EquipmentLoadoutPresentation['sets'][number]['thresholds'];
    }[];
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
        readonly gradeName: string;
        readonly gradeChevrons: string;
        readonly gradeAccessibleLabel: string;
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
        readonly gradeName: string;
        readonly gradeChevrons: string;
        readonly gradeAccessibleLabel: string;
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
    private browse: EquipmentBrowseState = DEFAULT_EQUIPMENT_BROWSE_STATE;
    constructor(private readonly context: GameContext) { this.registry = new DataEquipmentRegistry({ equipment: context.data.equipment ?? [], equipmentSets: context.data.equipmentSets ?? [], equipmentRules: context.data.equipmentRules ?? { unlocks: { 2: { type: 'always' }, 3: { type: 'always' }, 4: { type: 'always' } } } }); }
    private facts() { const s = this.context.saveData; return createConditionContext(s.progression, { stages: s.stages, achievements: s.achievements, characters: s.characters, bosses: s.bosses }); }
    snapshot(): EquipmentSnapshot {
        const state = this.context.saveData;
        const equipped = Object.freeze({ ...(state.equipmentLoadout ?? {}) });
        const facts = this.facts();
        const maxTier = maxEquipmentTier(facts, this.registry.rules, state.progression.unlocks);
        const selectedCharacter = this.context.characters.characterById(this.context.selectedCharacterId);
        const nextGradeRequirement = maxTier < 4
            ? describeProgressionCondition(this.registry.rules.unlocks[(maxTier + 1) as 2 | 3 | 4], this.context.data)
            : undefined;
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
            const grade = equipmentGrade(item.tier);
            return Object.freeze({ ...item, setName: set.name, setEmblemArtId: set.emblemArtId,
                setPieces: set.equippedCount,
                gradeName: grade.name, gradeChevrons: grade.chevrons, gradeAccessibleLabel: grade.accessibleLabel,
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
            const grade = equipmentGrade(1);
            return [Object.freeze({ equipmentId: piece.id, name: piece.name, setName: set.name,
                setEmblemArtId: set.emblem, slot: piece.slot, iconArtId: visuals?.resolveEquipmentVisual(piece.id, 1)?.iconArtId ?? piece.icon,
                gradeName: grade.name, gradeChevrons: grade.chevrons, gradeAccessibleLabel: grade.accessibleLabel,
                fabricationCost: set.pieceFabricationCost, effects,
                effectSummary: Object.freeze(effects.map((effect) => effect.text)),
            })];
        });
        const acquisition = this.registry.all().map((piece) => {
            const set = this.registry.setById(piece.setId)!;
            const available = evaluateCondition(set.unlock, facts);
            const owned = ownedDefinitionIds.has(piece.id);
            const requirement = set.unlock.type === 'always' ? '' : `${describeProgressionCondition(set.unlock, this.context.data)}. `;
            const rewards = (this.context.data.stages ?? []).flatMap((stage) => {
                const reward = this.context.data.rewardProfiles?.find((row) => row.id === stage.rewardProfileId);
                return reward?.grants?.some((grant) => grant.type === 'grant-equipment-instance' && grant.equipmentId === piece.id)
                    ? [`Owned piece on first clear: ${stage.name}.`] : [];
            });
            return Object.freeze({ equipmentId: piece.id, setId: set.id, name: piece.name, slot: piece.slot, owned, available,
                summary: `${owned ? `Owned. Blueprint cost: ${set.pieceFabricationCost} Scrap. No additional copy can be fabricated.` : `${available ? 'Blueprint available; not owned' : 'Blueprint locked'}. ${requirement}Fabricate for ${set.pieceFabricationCost} Scrap.`}${rewards.length ? ' ' + rewards.join(' ') : ''}` });
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
        const catalog = Object.freeze([
            ...owned.map((item) => {
                const upgradeCostValue = 'upgradeCost' in item ? item.upgradeCost : undefined;
                const readiness: EquipmentCatalogEntry['readiness'] = item.tier >= 4 ? 'maxed'
                    : item.upgradeLockReason ? 'progression-lock'
                        : upgradeCostValue !== undefined && state.progression.scrap < upgradeCostValue ? 'insufficient-scrap' : 'ready';
                return Object.freeze({ kind: 'owned' as const, id: item.instanceId, equipmentId: item.equipmentId,
                    name: item.name, slot: item.slot as EquipmentSlot, setId: item.setId, setName: item.setName,
                    setEmblemArtId: item.setEmblemArtId, grade: equipmentGrade(item.tier).number,
                    iconArtId: item.iconArtId, state: item.state, effectSummary: item.effectSummary,
                    searchText: [item.name, item.setName, item.slot, item.gradeName, ...item.effectSummary].join(' '),
                    upgradeCost: upgradeCostValue, readiness,
                    upgradeLockReason: item.upgradeLockReason });
            }),
            ...blueprints.map((piece) => Object.freeze({ kind: 'blueprint' as const, id: piece.equipmentId,
                equipmentId: piece.equipmentId, name: piece.name, slot: piece.slot as EquipmentSlot,
                setId: this.registry.equipmentById(piece.equipmentId)!.setId, setName: piece.setName,
                setEmblemArtId: piece.setEmblemArtId, grade: 1 as const, iconArtId: piece.iconArtId,
                state: 'FABRICABLE' as const, effectSummary: piece.effectSummary,
                searchText: [piece.name, piece.setName, piece.slot, 'Standard', ...piece.effectSummary].join(' '),
                readiness: 'not-applicable' as const, fabricationCost: piece.fabricationCost,
                affordable: state.progression.scrap >= piece.fabricationCost })),
        ] as readonly EquipmentCatalogEntry[]);
        const filteredCatalog = filterAndSortEquipmentCatalog(catalog, this.browse);
        const setCatalog = Object.freeze(this.registry.allSets().map((set: EquipmentSetDefinition) => {
            const presentationSet = presentation.sets.find((row) => row.setId === set.id)!;
            const available = evaluateCondition(set.unlock, facts);
            return Object.freeze({ setId: set.id, name: set.name, description: set.description,
                emblemArtId: set.emblem, pieces: presentationSet.equippedCount, available,
                unlockReason: available ? 'Available' : describeProgressionCondition(set.unlock, this.context.data),
                thresholds: presentationSet.thresholds });
        }));
        return Object.freeze({ progression: Object.freeze({
                characterName: selectedCharacter?.name ?? 'Mercenary',
                masteryTier: state.characters[this.context.selectedCharacterId]?.tier ?? 0,
                equipmentGradeCap: equipmentGrade(maxTier).number,
                ...(nextGradeRequirement ? { nextGradeRequirement } : {}),
            }),
            presentation, selectedSlot: this.selectedSlot, selectedInstanceId, selectedBlueprintId,
            comparison: selectedInstanceId === undefined ? undefined : this.preview({ kind: 'equip', instanceId: selectedInstanceId }),
            acquisition: Object.freeze(acquisition),
            browse: this.browse, catalog, filteredCatalog, setCatalog,
            equipped, owned: Object.freeze(owned), blueprints: Object.freeze(blueprints),
            activeSets: Object.freeze(activeSets), unavailable: Object.freeze(unavailable),
        });
    }
    selectSlot(slot: EquipmentSlot): boolean {
        if (!['helmet', 'armour', 'gloves', 'boots'].includes(slot))
            return false;
        this.selectedSlot = slot;
        this.browse = Object.freeze({ ...this.browse, filters: Object.freeze({ ...this.browse.filters, slots: [slot] }) });
        this.selectedInstanceId = this.context.saveData.equipmentLoadout?.[slot];
        this.selectedBlueprintId = undefined;
        this.repairHiddenSelection();
        return true;
    }
    selectCandidate(instanceId: string): boolean {
        const item = this.context.saveData.equipment[instanceId];
        const definition = item && this.registry.equipmentById(item.equipmentId);
        if (!definition || (this.browse.filters.slots.length > 0 && !this.browse.filters.slots.includes(definition.slot)))
            return false;
        if (!this.snapshot().filteredCatalog.some((entry) => entry.kind === 'owned' && entry.id === instanceId))
            return false;
        this.selectedSlot = definition.slot;
        this.selectedInstanceId = instanceId;
        this.selectedBlueprintId = undefined;
        return true;
    }
    selectBlueprint(equipmentId: string): boolean {
        const piece = this.registry.equipmentById(equipmentId);
        if (!piece || !this.snapshot().blueprints.some((row) => row.equipmentId === equipmentId)
            || !this.snapshot().filteredCatalog.some((entry) => entry.kind === 'blueprint' && entry.id === equipmentId))
            return false;
        this.selectedSlot = piece.slot;
        this.selectedBlueprintId = equipmentId;
        this.selectedInstanceId = undefined;
        return true;
    }
    setBrowseSearch(query: string): boolean {
        const next = query.slice(0, 48);
        if (next === this.browse.filters.query) return false;
        this.browse = Object.freeze({ ...this.browse, filters: Object.freeze({ ...this.browse.filters, query: next }) });
        return this.repairHiddenSelection();
    }
    toggleBrowseFilter(facet: EquipmentFilterFacet, value: string): boolean {
        const filters = this.browse.filters;
        const toggle = <T extends string | number>(values: readonly T[], next: T): readonly T[] =>
            values.includes(next) ? values.filter((entry) => entry !== next) : [...values, next];
        if (facet === 'slot') {
            const slots = value === 'all' ? [] : toggle(filters.slots, value as EquipmentSlot);
            this.browse = Object.freeze({ ...this.browse, filters: Object.freeze({ ...filters, slots }) });
        } else if (facet === 'set') {
            const sets = value === 'all' ? [] : toggle(filters.sets, value);
            this.browse = Object.freeze({ ...this.browse, filters: Object.freeze({ ...filters, sets }) });
        } else if (facet === 'grade') {
            const grades = value === 'all' ? [] : toggle(filters.grades, Number(value) as EquipmentGrade);
            this.browse = Object.freeze({ ...this.browse, filters: Object.freeze({ ...filters, grades }) });
        } else if (facet === 'ownership') {
            const ownership = value === 'all' ? [] : toggle(filters.ownership, value as EquipmentOwnershipFilter);
            this.browse = Object.freeze({ ...this.browse, filters: Object.freeze({ ...filters, ownership }) });
        } else {
            const readiness = value === 'all' ? [] : toggle(filters.readiness, value as EquipmentReadinessFilter);
            this.browse = Object.freeze({ ...this.browse, filters: Object.freeze({ ...filters, readiness }) });
        }
        return this.repairHiddenSelection();
    }
    clearBrowseFilters(): boolean {
        const hadSelection = this.selectedInstanceId !== undefined || this.selectedBlueprintId !== undefined;
        this.browse = Object.freeze({ ...this.browse, filters: Object.freeze({ ...this.browse.filters,
            query: '', slots: [], sets: [], grades: [], ownership: [], readiness: [] }) });
        return hadSelection && this.repairHiddenSelection();
    }
    cycleBrowseSort(): boolean {
        const keys = ['name', 'grade', 'set', 'upgrade-cost'] as const;
        const index = keys.indexOf(this.browse.sort);
        const direction = this.browse.direction === 'asc' ? 'desc' : 'asc';
        const next = this.browse.direction === 'desc' ? keys[(index + 1) % keys.length]! : this.browse.sort;
        this.browse = Object.freeze({ ...this.browse, sort: next, direction: next === this.browse.sort ? direction : 'asc' });
        return false;
    }
    private repairHiddenSelection(): boolean {
        const visible = this.snapshot().filteredCatalog;
        const hidden = (this.selectedInstanceId !== undefined
            && !visible.some((entry) => entry.kind === 'owned' && entry.id === this.selectedInstanceId))
            || (this.selectedBlueprintId !== undefined
                && !visible.some((entry) => entry.kind === 'blueprint' && entry.id === this.selectedBlueprintId));
        if (hidden) {
            this.selectedInstanceId = undefined;
            this.selectedBlueprintId = undefined;
        }
        return hidden;
    }
    preview(command: EquipmentPreviewCommand): EquipmentComparison | undefined {
        return resolveEquipmentComparison(this.context.saveData, this.context.data, command);
    }
    equip(instanceId: string): boolean {
        const persisted = this.context.updateEquipment(({ equipment, loadout }) => {
            const owned = new Map<string, OwnedEquipment>(Object.entries(equipment).map(([id, item]) => [id, { instanceId: id, ...item }]));
            const item = owned.get(instanceId);
            const definition = item && this.registry.equipmentById(item.equipmentId);
            if (!definition || loadout[definition.slot] === instanceId)
                return undefined;
            const result = equipEquipment({ equipped: loadout }, instanceId, this.registry.asMap(), owned);
            return result.ok ? { equipment, loadout: result.loadout.equipped } : undefined;
        }).persisted;
        if (persisted) this.repairHiddenSelection();
        return persisted;
    }
    unequip(slot: EquipmentSlot): boolean {
        const persisted = this.context.updateEquipment(({ equipment, loadout }) => {
            const result = unequipEquipment({ equipped: loadout }, slot);
            return result.ok ? { equipment, loadout: result.loadout.equipped } : undefined;
        }).persisted;
        if (persisted) this.repairHiddenSelection();
        return persisted;
    }
    upgrade(instanceId: string, expectedTier?: number): boolean {
        const save = this.context.saveData;
        const item = save.equipment[instanceId];
        if (!item || (expectedTier !== undefined && item.tier !== expectedTier)
            || item.tier >= maxEquipmentTier(this.facts(), this.registry.rules, save.progression.unlocks)
            || save.progression.scrap < upgradeCost(item.tier)) return false;
        const persisted = this.context.commitEquipmentUpgrade(instanceId, item.tier, item.tier + 1, upgradeCost(item.tier));
        if (persisted) this.repairHiddenSelection();
        return persisted;
    }
    fabricable(): readonly string[] { return this.snapshot().blueprints.map((blueprint) => blueprint.equipmentId); }
    fabricate(equipmentId: string): boolean {
        const persisted = this.context.fabricateEquipment(equipmentId);
        if (persisted && this.selectedBlueprintId === equipmentId) {
            this.selectedInstanceId = Object.entries(this.context.saveData.equipment).find(([, item]) => item.equipmentId === equipmentId)?.[0];
            this.selectedBlueprintId = undefined;
        }
        if (persisted) this.repairHiddenSelection();
        return persisted;
    }
}
