import type Phaser from 'phaser';
import type { MainMenuSnapshot } from '../menus';
import { LoadoutPanelSurface } from './loadoutChrome';
import { type MenuScrollBookmark, type MenuScrollRectangle, type MenuSurfaceLayout, type EquipmentSurfaceCommands, type MenuSurfaceControls } from './surface';
import { edgeMargin } from '../layout';

export class EquipmentSurface extends LoadoutPanelSurface<EquipmentSurfaceCommands> {
  readonly panel = 'equipment' as const;
  private equipmentSetBrowserOpen = false;
  private selectionInvariant?: string;
  private detailTop = 0;
  private detailLayoutWidth = 0;
  private detailLayoutHeight = 0;
  private selectionGeneration = 0;
  private drawingSelection = false;
  private collectionTop = 0;
  /** View-only state. The controller remains the source of truth for the
   * selected item; this flag only chooses browse versus local inspection. */
  private detailViewOpen = false;
  private detailViewInitialized = false;
  private browseReturnFocusKey?: string;
  private browseReturnScrollOffset = 0;
  private browseReturnBookmark?: MenuScrollBookmark;
  private browseScope?: string;
  private renderedBlueprintId?: string;
  private renderedSlot?: string;
  private renderedWideInspector = false;
  /** Candidate cards remain mounted while browse selection replaces only the
   * fixed summary. They become replaceable when the same mount enters detail. */
  private browseCandidateObjects: Phaser.GameObjects.GameObject[] = [];
  private tailObjects: Phaser.GameObjects.GameObject[] = [];
  /** The retained browse header is a separate ownership slice from the
   * replaceable candidate/summary tail. Detail updates suppress this slice
   * explicitly; they never suppress the whole masked content container. */
  private browsePrefixObjects: Phaser.GameObjects.GameObject[] = [];

  get selectionObjects(): readonly Phaser.GameObjects.GameObject[] {
    return this.detailViewOpen ? [...this.browseCandidateObjects, ...this.tailObjects] : this.tailObjects;
  }

  handleBack(): boolean {
    if (!this.detailViewOpen) return false;
    this.detailViewOpen = false;
    // A later explicit inspection is a new local view. Do not reuse the
    // previous body's top after Back, especially when the restored browse
    // summary has a different measured height.
    this.detailTop = 0;
    this.detailLayoutWidth = 0;
    this.detailLayoutHeight = 0;
    this.environment.controls.focusNext(this.browseReturnFocusKey ?? `equipment-slot:${this.browseScope}`);
    this.environment.onSnapshot(this.commands.snapshot());
    if (this.browseReturnBookmark) this.environment.controls.restoreScrollBookmark(this.browseReturnBookmark);
    else this.environment.controls.restoreScrollOffset(this.browseReturnScrollOffset);
    return true;
  }

  canUpdateSelection(snapshot: MainMenuSnapshot, _scrap: number): boolean {
    const selectedSlot = snapshot.equipment.presentation.slots.find(slot => slot.slot === snapshot.equipment.selectedSlot);
    const selected = selectedSlot?.candidates.find(item => item.instanceId === snapshot.equipment.selectedInstanceId);
    const blueprint = snapshot.equipment.blueprints.find(piece => piece.equipmentId === snapshot.equipment.selectedBlueprintId);
    const wideInspector = this.layout.width >= 1040 && (!!selected || !!blueprint);
    return !!this.root && this.layout.width === this.environment.scene.scale.width
      && this.layout.height === this.environment.scene.scale.height && snapshot.panel === this.panel
      && this.renderedSlot === snapshot.equipment.selectedSlot
      && this.renderedBlueprintId === snapshot.equipment.selectedBlueprintId
      // Local selection updates replace the owned suffix in place. Detail
      // keeps the existing scroll/mask mount; only the explicitly owned
      // browse prefix is suppressed while the detail tail is drawn.
      && (this.detailViewOpen || this.renderedWideInspector === wideInspector)
      && this.selectionInvariant === this.prefixInvariant(snapshot, _scrap);
  }

  updateSelection(scrollRoot: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, scrap: number): void {
    this.selectionGeneration += 1;
    const old = this.selectionObjects;
    this.tailObjects = [];
    for (const object of old) object.destroy();
    const contentWidth = this.loadoutContentWidth();
    const left = this.layout.centerX - contentWidth / 2;
    if (this.detailViewOpen) {
      // The Scene owns the mask and scroll pass. Suppress only the retained
      // browse prefix that this surface explicitly tracked; do not hide or
      // destroy the whole masked container, which would orphan the detail
      // tail and its fixed controls.
      this.environment.controls.suppressScrollObjects?.(this.browsePrefixObjects);
      for (const object of this.browsePrefixObjects) {
        (object as Phaser.GameObjects.GameObject & { setVisible?(visible: boolean): unknown }).setVisible?.(false);
      }
      this.browsePrefixObjects = [];
      this.browseCandidateObjects = [];
      // Keyboard selection reaches local detail through the retained browse
      // mount. Reopen the shared region against the full content lane before
      // drawing the detail body; otherwise the old narrow inspector mask and
      // its blank prefix scroll range remain authoritative for this update.
      // A same-geometry mutation (including a save failure notice) must not
      // move the local reader's viewport underneath its focused action. A
      // resize or orientation change remounts this view and establishes a
      // fresh detailTop in draw(); retained updates keep the existing anchor.
      const sameDetailGeometry = this.detailLayoutWidth === this.layout.width
        && this.detailLayoutHeight === this.layout.height;
      this.detailTop = sameDetailGeometry && this.detailTop > 0 ? this.detailTop : this.layout.top + 26;
      this.detailLayoutWidth = this.layout.width;
      this.detailLayoutHeight = this.layout.height;
      this.collectionTop = this.detailTop;
      this.environment.controls.beginScrollableRegion(this.collectionRectangle(left, this.detailTop, contentWidth,
        this.detailScrollableBottom(snapshot)));
      this.drawSelection(scrollRoot, this.root!, snapshot, scrap);
      this.requestSelectionResources(snapshot);
      return;
    }
    const equipment = snapshot.equipment;
    const listWidth = this.layout.width >= 1040
      ? contentWidth - this.wideInspectorWidth(contentWidth) - 16 : contentWidth;
    const selectedSlot = equipment.presentation.slots.find(slot => slot.slot === equipment.selectedSlot)!;
    const selected = selectedSlot.candidates.find(item => item.instanceId === equipment.selectedInstanceId);
    const blueprints = equipment.blueprints.filter(piece => piece.slot === equipment.selectedSlot);
    const blueprint = blueprints.find(piece => piece.equipmentId === equipment.selectedBlueprintId);
    if (this.layout.width >= 1040 && (selected || blueprint)) {
      this.environment.controls.endScrollableRegion();
      this.drawWideInspector(this.root!, this.root!, snapshot, scrap, selected, blueprint,
        left + listWidth + 16, contentWidth - listWidth - 16);
    } else {
      const summary = this.prepareBrowseSummary(this.root!, snapshot);
      this.environment.controls.resizeScrollableRegion(this.collectionRectangle(left, this.collectionTop,
        listWidth, this.browseSummaryTop(summary.summary.height) - 8));
      this.drawBrowseSummary(scrollRoot, this.root!, summary, scrap);
    }
    this.requestSelectionResources(snapshot);
  }

  private requestSelectionResources(snapshot: MainMenuSnapshot): void {
    const equipment = snapshot.equipment;
    const selected = equipment.presentation.slots
      .flatMap(slot => slot.candidates)
      .find(item => item.instanceId === equipment.selectedInstanceId);
    const blueprint = equipment.blueprints.find(piece => piece.equipmentId === equipment.selectedBlueprintId);
    const upgradeArt = selected
      ? equipment.owned.find(item => item.instanceId === selected.instanceId)?.upgradePreview?.after.slots
        .flatMap(slot => slot.candidates.filter(candidate => candidate.instanceId === selected.instanceId).map(candidate => candidate.iconArtId)) ?? []
      : [];
    this.environment.resources.equipment([
      ...(selected ? [selected.iconArtId] : []), ...(blueprint ? [blueprint.iconArtId, blueprint.setEmblemArtId] : []), ...upgradeArt,
    ]);
  }

  override unmount(): void {
    this.selectionGeneration += 1;
    this.selectionInvariant = undefined;
    this.tailObjects = [];
    this.browsePrefixObjects = [];
    this.browseCandidateObjects = [];
    this.renderedWideInspector = false;
    super.unmount();
  }

  override dispose(): void {
    this.selectionGeneration += 1;
    this.selectionInvariant = undefined;
    this.tailObjects = [];
    this.browsePrefixObjects = [];
    this.browseCandidateObjects = [];
    this.detailLayoutWidth = 0;
    this.detailLayoutHeight = 0;
    super.dispose();
  }

  protected override button(...args: Parameters<MenuSurfaceControls['addButton']>): Phaser.GameObjects.Text {
    const action = args[5];
    if (this.drawingSelection && action) {
      const generation = this.selectionGeneration;
      args[5] = () => { if (generation === this.selectionGeneration) action(); };
    }
    return super.button(...args);
  }

  /** Facts owned by the retained browse prefix. Selection identity and its
   * preview belong to the replaceable tail; every other fact that can change
   * candidate geometry, labels, art closure, notice or fixed chrome forces a
   * full rebuild before a selection tail is replaced in place. */
  private prefixInvariant(snapshot: MainMenuSnapshot, scrap: number): string {
    const equipment = snapshot.equipment;
    const prefixSlots = equipment.presentation.slots.map(slot => ({
      slot: slot.slot,
      label: slot.label,
      placeholderArtId: slot.placeholderArtId,
      equipped: slot.equipped,
      candidates: slot.candidates,
    }));
    return JSON.stringify([
      snapshot.notice,
      scrap,
      equipment.selectedSlot,
      this.equipmentSetBrowserOpen,
      prefixSlots,
      equipment.presentation.sets,
      equipment.presentation.runTruth,
      equipment.blueprints,
      equipment.acquisition,
      equipment.unavailable,
      snapshot.stage.stages.find(stage => stage.selected)?.menuBackdropArtId,
    ]);
  }

  protected draw(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, layout: MenuSurfaceLayout, scrap: number): void {
    const { top, hitTarget } = layout;
    const equipment = snapshot.equipment;
    const scope = equipment.selectedSlot;
    if (this.browseScope !== scope) {
      this.browseScope = scope;
      this.browseReturnFocusKey = `equipment-slot:${scope}`;
      this.browseReturnBookmark = undefined;
      this.browseReturnScrollOffset = 0;
    }
    if (!this.detailViewInitialized) {
      // A selected controller identity is not proof that the user requested
      // inspection. Compact entry always starts in the collection; only the
      // local View details command opens the detail view.
      this.detailViewOpen = false;
      this.detailViewInitialized = true;
    }
    const contentWidth = this.loadoutContentWidth();
    const left = this.layout.centerX - contentWidth / 2;
    const selectedSetEmblem = equipment.blueprints.find((piece) => piece.equipmentId === equipment.selectedBlueprintId)?.setEmblemArtId;
    const activeSet = equipment.presentation.sets.find((set) => set.emblemArtId === selectedSetEmblem)
      ?? equipment.presentation.sets.find((set) => set.equippedCount > 0);
    const selectedSlot = equipment.presentation.slots.find((slot) => slot.slot === equipment.selectedSlot)!;
    const blueprints = equipment.blueprints.filter((piece) => piece.slot === equipment.selectedSlot);
    const selectedForInspector = selectedSlot.candidates.find(item => item.instanceId === equipment.selectedInstanceId);
    const blueprintForInspector = blueprints.find(piece => piece.equipmentId === equipment.selectedBlueprintId);
    const hasLegalSelection = !!selectedForInspector || !!blueprintForInspector;
    const wideInspector = this.layout.width >= 1040;
    // A stale controller identity can survive a content/slot repair. Never
    // leave an action-only detail view pointing at a missing item.
    if (this.detailViewOpen && !hasLegalSelection) this.detailViewOpen = false;
    // Local inspection owns the top chrome through Back to candidates. Do not
    // remount the browse header underneath that control when an equip/upgrade
    // causes a full scene render while detail remains open.
    if (!this.detailViewOpen) {
      this.loadoutHeader(root, left, 'EQUIPMENT', activeSet
        ? `${activeSet.name.toUpperCase()} SET • ${activeSet.equippedCount}/4 EQUIPPED` : '0/4 PIECES EQUIPPED');
    }
    let y = top + 26;
    this.selectionInvariant = this.prefixInvariant(snapshot, scrap);
    this.renderedSlot = equipment.selectedSlot;
    this.renderedBlueprintId = equipment.selectedBlueprintId;
    this.renderedWideInspector = wideInspector && hasLegalSelection;
    if (this.detailViewOpen) {
      // Detail is a local view: browse slots/cards are not mounted and the
      // single Scene-owned rectangle belongs only to this detail body.
      const sameDetailGeometry = this.detailLayoutWidth === this.layout.width
        && this.detailLayoutHeight === this.layout.height;
      this.detailTop = sameDetailGeometry && this.detailTop > 0 ? this.detailTop : y;
      this.detailLayoutWidth = this.layout.width;
      this.detailLayoutHeight = this.layout.height;
      this.collectionTop = this.detailTop;
      this.environment.controls.beginScrollableRegion(this.collectionRectangle(left, this.detailTop, contentWidth,
        this.detailScrollableBottom(snapshot)));
      this.drawSelection(root, root, snapshot, scrap);
      return;
    }
    this.loadoutSection(root, left, y, 'EQUIPPED SLOTS');
    y += 20;
    // The slot grid is part of the same clipped browse body as the candidate
    // cards. Starting the region before it keeps native slot art visible at
    // offset zero while leaving a valid viewport on short phones.
    const collectionViewportTop = y;
    const listWidth = wideInspector ? contentWidth - this.wideInspectorWidth(contentWidth) - 16 : contentWidth;
    // Reserve the wide inspector only after a legal item/blueprint has been
    // selected. The initial browse state owns the full four-slot width; using
    // the inspector's future column here clipped the fourth slot and made its
    // edge card lose pointer admission before any selection existed.
    const collectionWidth = wideInspector && (selectedForInspector || blueprintForInspector) ? listWidth : contentWidth;
    // A short landscape viewport has the same vertical budget as the
    // narrowest phone. Keep its slot navigation compact too; native slot art
    // would consume the entire collection viewport before the candidates can
    // be reached.
    const compactTabs = this.useCompactEquipmentTabs(collectionViewportTop, collectionWidth);
    const fixedSlotGrid = compactTabs || this.layout.height <= 480;
    this.collectionTop = collectionViewportTop;
    // Open the single collection region before slot rendering so authored
    // slot cards, candidate cards, copy, and art all enter the same Scene
    // owned mask. The fixed summary's measured bottom is applied below once
    // its wrapped text exists.
    if (!fixedSlotGrid) this.environment.controls.beginScrollableRegion(this.collectionRectangle(left, this.collectionTop, collectionWidth));
    // Equipment keeps the four slot tabs as a compact, always-reachable
    // header. The large art-led cards belong to the Loadout overview; they
    // would consume the candidate grid's viewport on phones and wide grids.
    // Keep the approved native slot framing where the viewport can contain it;
    // short phones and compact landscape use the compact tab treatment to
    // avoid making the collection band non-positive before it can scroll.
    // When a legal desktop selection opens the inspector, the slot grid shares
    // the narrowed collection mask. Lay it out against that same width so the
    // right-hand cards cannot sit outside their owner and disappear at the
    // mask edge.
    y = this.renderEquipmentSlots(root, snapshot, left, y, collectionWidth, hitTarget, false, compactTabs);
    if (fixedSlotGrid) {
      // Compact tabs and compact-landscape slot cards are fixed, reachable
      // headers. Only the body below them enters the shared scroll region.
      this.collectionTop = y;
      this.environment.controls.beginScrollableRegion(this.collectionRectangle(left, this.collectionTop, collectionWidth));
    }
    // Browse Sets is a fixed semantic section control. End the collection
    // pass around its construction so it never becomes an orphaned scroll
    // item below the fixed action band; reopen the same region for set/copy/
    // candidate content immediately after it.
    this.environment.controls.endScrollableRegion();
    const browse = this.button(root, left, y, this.equipmentSetBrowserOpen ? 'CLOSE SETS' : 'BROWSE SETS', hitTarget, () => {
      this.equipmentSetBrowserOpen = !this.equipmentSetBrowserOpen;
      this.environment.controls.focusNext('equipment:browse-sets');
      this.environment.onSnapshot(this.commands.snapshot());
      // The newly opened reading precedes the first candidate. A retained
      // candidate bookmark would skip all of it when expansion completes.
      if (this.equipmentSetBrowserOpen) this.environment.controls.restoreScrollOffset(0);
    }, 'ui:confirm', contentWidth, undefined, 0, 0, false, 'left', 'section');
    // Browse Sets is a semantic section control, but it is also the primary
    // entry point for the named chooser. Keep its label at the readable body
    // size on both the phone and foldable layouts.
    browse.setStyle({ fontSize: '14px' });
    this.rememberLoadoutFocus(browse, 'equipment:browse-sets');
    const compactCollection = this.layout.width < 600 || this.layout.height <= 480;
    y += browse.height + (compactCollection ? 6 : 4);
    // The narrow portrait slot header and Browse Sets are fixed, reachable
    // chrome. Its candidate body must begin below both; otherwise the initial
    // scroll offset can move the first helmet card underneath Browse Sets.
    // Compact landscape has a smaller vertical budget and retains its shared
    // region so the candidate viewport stays positive.
    if (fixedSlotGrid) this.collectionTop = y;
    this.environment.controls.beginScrollableRegion(this.collectionRectangle(left, this.collectionTop, collectionWidth));
    // The structured catalog supplies a named, masked Set chooser. The old
    // closed state painted only four small emblems, which made the chooser
    // look like decoration and pushed the remaining names below the viewport.
    // Keep Browse Sets as the single semantic action, but give every emblem a
    // readable name/count summary in the same scroll-owned region. Compact
    // phones use two columns; wider profiles use four and naturally expose a
    // scroll rail for the second row when the viewport cannot show it all.
    const setColumns = compactCollection ? Math.min(2, equipment.presentation.sets.length)
      : Math.min(4, equipment.presentation.sets.length);
    const setWidth = (collectionWidth - Math.max(0, setColumns - 1) * 8) / Math.max(1, setColumns);
    const setRowHeight = compactCollection ? 58 : 64;
    const setRows = Math.ceil(equipment.presentation.sets.length / Math.max(1, setColumns));
    equipment.presentation.sets.forEach((set, index) => {
      const column = index % setColumns;
      const row = Math.floor(index / setColumns);
      const tileX = left + column * (setWidth + 8);
      const tileY = y + row * setRowHeight;
      this.environment.controls.addCatalogIcon(root, tileX + 20, tileY + setRowHeight / 2,
        set.emblemArtId, compactCollection ? 32 : 36);
      const label = this.loadoutCopy(root, tileX + 44, tileY + (compactCollection ? 6 : 2),
        `${set.name}\n${set.equippedCount}/4 EQUIPPED`, setWidth - 52, '#f7f1d5');
      label.setStyle({ fontSize: '12px', fontStyle: '700', lineSpacing: 1 });
    });
    y += setRows * setRowHeight;
    const browsePrefixObjects = new Set([...root.list]);
    this.browsePrefixObjects = [...browsePrefixObjects];
    const put = (text: string, color?: string) => { const copy = this.loadoutCopy(root, left, y, text, collectionWidth, color); y += copy.height + 8; };
    const cardColumns = this.layout.width >= 1040 ? 3
      : this.layout.width >= 600 ? ((contentWidth - 24) / 3 >= 176 ? 3 : 2)
        : 2;
    const cardGap = cardColumns === 2 ? 12 : 8;
    const cardWidth = (collectionWidth - cardGap * (cardColumns - 1)) / cardColumns;
    const artExtent = this.layout.width < 600 ? 72 : this.layout.width >= 1040 ? 96 : 88;
    const cardTopReserve = artExtent + 16;
    this.detailTop = y;
    const fixedSummary = !wideInspector || (!selectedForInspector && !blueprintForInspector);
    const browseSummary = fixedSummary ? this.prepareBrowseSummary(root, snapshot) : undefined;
    // Keep the authored slot art in the same scene-owned collection rectangle.
    // The fixed summary is below it; the region begins before the slot grid so
    // short phones retain a positive viewport instead of pushing collection
    // content below the fixed action band.
      const collectionBottom = fixedSummary
        ? this.browseSummaryTop(browseSummary!.summary.height) - (fixedSlotGrid && this.layout.width >= 600 ? 0 : 8)
        : this.layout.scrollBottom;
      this.environment.controls.resizeScrollableRegion(this.collectionRectangle(left, this.collectionTop,
        collectionWidth, collectionBottom));
    if (this.equipmentSetBrowserOpen) {
      for (const set of equipment.presentation.sets) {
        const copy = this.loadoutCopy(root, left + 46, y, this.setProgressCopy(set), collectionWidth - 46);
        this.environment.controls.addCatalogIcon(root, left + 20, y + 22, set.emblemArtId, 36);
        y += copy.height + 12;
      }
    }
    put(`${selectedSlot.label.toUpperCase()} CANDIDATES • ${scrap} Scrap`);
    const renderCards = <T extends { readonly name: string; readonly iconArtId: string }>(
      cards: readonly T[], label: (card: T) => string, key: (card: T) => string,
      action: (card: T) => void, trailingReserve = 0,
      decorate?: (card: T, x: number, y: number, ownerIndex: number, rowHeight: number) => void,
    ) => {
      for (let index = 0; index < cards.length; index += cardColumns) {
        const rowCards = cards.slice(index, index + cardColumns);
        // The handoff budgets the whole compact card, not only the art box:
        // 72px art on phone is about 184px total and 96px art on desktop is
        // about 208px. Wrapping labels may still expand the measured row.
        let rowHeight = Math.max(hitTarget, artExtent + 112);
        const rows = rowCards.map((card, column) => {
          const x = left + column * (cardWidth + cardGap);
          const row = this.button(root, x, y, label(card), rowHeight, () => action(card),
            'ui:confirm', cardWidth, undefined, trailingReserve, 0, true, 'center', 'card', cardTopReserve);
          this.rememberLoadoutFocus(row, key(card));
          rowHeight = Math.max(rowHeight, row.height);
          return { card, row, x };
        });
        for (const { card, row, x } of rows) {
          row.setFixedSize(cardWidth, rowHeight);
          const ownerIndex = this.environment.controls.buttonIndex(row);
          this.environment.controls.addLoadoutArt(root, x + cardWidth / 2,
            y + 12 + artExtent / 2, card.iconArtId, artExtent, artExtent, ownerIndex);
          decorate?.(card, x, y, ownerIndex, rowHeight);
        }
        y += rowHeight + 8;
      }
    };
    renderCards(selectedSlot.candidates,
      item => `${item.name}\nT${item.tier} • ${item.state}`,
      item => `equipment-candidate:${item.instanceId}`,
      item => {
        this.browseReturnFocusKey = `equipment-candidate:${item.instanceId}`;
        this.browseReturnScrollOffset = this.environment.controls.currentScrollOffset();
        this.browseReturnBookmark = this.environment.controls.currentScrollBookmark();
        // Pointer selection is an explicit visual inspection gesture and can
        // stationary-summary contract: card selection never auto-opens local
        // detail. The explicit View details action owns that transition for
        // both pointer and keyboard/controller users.
        this.environment.controls.focusNext(`equipment-candidate:${item.instanceId}`);
        this.environment.onSnapshot(this.commands.selectEquipmentCandidate(item.instanceId), 'equipment-selection');
      });
    for (const route of equipment.acquisition.filter((row) => row.slot === equipment.selectedSlot && !row.available && !row.owned)) put(`${route.name}: ${route.summary}`);
    if (!selectedSlot.candidates.length) put(`No stored ${selectedSlot.label.toLowerCase()} pieces. Choose a blueprint to fabricate.`);
    if (blueprints.length) put('AVAILABLE BLUEPRINTS');
    renderCards(blueprints,
      blueprint => `${blueprint.name}\nFABRICABLE • NOT OWNED • ${blueprint.fabricationCost} Scrap`,
      blueprint => `equipment-blueprint:${blueprint.equipmentId}`,
      blueprint => {
        this.browseReturnFocusKey = `equipment-blueprint:${blueprint.equipmentId}`;
        this.browseReturnScrollOffset = this.environment.controls.currentScrollOffset();
        this.browseReturnBookmark = this.environment.controls.currentScrollBookmark();
        // Blueprint selection follows the same stationary-summary rule as
        // owned candidates; detail remains an explicit action.
        this.environment.controls.focusNext(`equipment-blueprint:${blueprint.equipmentId}`);
        this.environment.onSnapshot(this.commands.selectEquipmentBlueprint(blueprint.equipmentId), 'equipment-selection');
      }, 48, (blueprint, x, rowY, ownerIndex, rowHeight) => {
        this.environment.controls.addCatalogIcon(root, x + cardWidth - 24,
          rowY + rowHeight / 2, blueprint.setEmblemArtId, 34, ownerIndex);
      });
    this.browseCandidateObjects = [...new Set(root.list)].filter(object =>
      !this.browsePrefixObjects.includes(object) && object !== browseSummary?.summary);
    this.environment.resources.equipment([
      ...equipment.presentation.slots.map(slot => slot.placeholderArtId),
      ...equipment.presentation.slots.flatMap(slot => slot.equipped ? [slot.equipped.iconArtId] : []),
      ...selectedSlot.candidates.map(item => item.iconArtId),
      ...blueprints.flatMap(piece => [piece.iconArtId, piece.setEmblemArtId]),
      ...equipment.presentation.sets.map(set => set.emblemArtId),
      ...equipment.owned.flatMap(item => item.upgradePreview
        ? item.upgradePreview.after.slots.flatMap(slot => slot.candidates
          .filter(candidate => candidate.instanceId === item.instanceId)
          .map(candidate => candidate.iconArtId)) : []),
    ]);
    if (wideInspector && (selectedForInspector || blueprintForInspector)) {
      this.environment.controls.endScrollableRegion();
      this.drawWideInspector(root, root, snapshot, scrap, selectedForInspector, blueprintForInspector,
        left + listWidth + 16, contentWidth - listWidth - 16);
    } else {
      this.drawBrowseSummary(root, root, browseSummary!, scrap);
    }
    // Candidate cards, collection copy, and fixed browse controls form one
    // replaceable body. Browse/detail transitions rebuild the surface mount;
    // same-mode selection updates replace this owned suffix in place.
  }

  /** Compact browse state keeps the selected identity visible without
   * appending a long inspector. Details are an explicit local view. */
  private drawBrowseSummary(root: Phaser.GameObjects.Container, fixedRoot: Phaser.GameObjects.Container,
    prepared: ReturnType<EquipmentSurface['prepareBrowseSummary']>, scrap: number): void {
    const { summary, selected, blueprint, selectedKey, contentWidth, left, horizontalBand, summaryWidth } = prepared;
    const before = new Set([...root.list, ...fixedRoot.list].filter(object => object !== summary));
    // Summary and action controls are fixed beneath the collection. End the
    // shared scroll region before creating them so they stay outside its
    // mask and never become a second scroll surface.
    this.environment.controls.endScrollableRegion();
    const summaryTop = this.browseSummaryTop(summary.height);
    summary.setPosition(left, summaryTop);
    let y = summaryTop;
    y += summary.height + 8;
    const details = this.button(fixedRoot, horizontalBand ? left + summaryWidth + 12 : left,
      horizontalBand ? summaryTop : y, selected || blueprint ? 'View details' : 'Choose a candidate', this.layout.hitTarget,
      () => {
        if (!selected && !blueprint) return;
        this.detailViewOpen = true;
        this.browseReturnFocusKey = selected ? `equipment-candidate:${selected.instanceId}` : `equipment-blueprint:${blueprint!.equipmentId}`;
        this.browseReturnScrollOffset = this.environment.controls.currentScrollOffset();
        this.browseReturnBookmark = this.environment.controls.currentScrollBookmark();
        this.environment.controls.focusNext(selected ? `equipment-detail:${selected.instanceId}` : `equipment-blueprint-detail:${blueprint!.equipmentId}`, true);
        this.environment.onSnapshot(this.commands.snapshot());
      }, 'ui:confirm', horizontalBand ? contentWidth - summaryWidth - 12 : contentWidth);
    this.rememberLoadoutFocus(details, `equipment-summary:${selectedKey}`);
    y += details.height + 8;
    this.loadoutFooter(fixedRoot, left, contentWidth, this.layout.hitTarget,
      this.fabricationActionLabel(blueprint, scrap), () => undefined, true);
    this.addOuterBack(fixedRoot, left, contentWidth);
    this.captureTailObjects(root, fixedRoot, before);
  }

  private prepareBrowseSummary(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot) {
    const equipment = snapshot.equipment;
    const contentWidth = this.loadoutContentWidth();
    const left = this.layout.centerX - contentWidth / 2;
    const selectedSlot = equipment.presentation.slots.find(slot => slot.slot === equipment.selectedSlot)!;
    const selected = selectedSlot.candidates.find(item => item.instanceId === equipment.selectedInstanceId);
    const blueprint = equipment.blueprints.find(piece => piece.equipmentId === equipment.selectedBlueprintId);
    const selectedKey = selected ? `equipment-candidate:${selected.instanceId}` : blueprint ? `equipment-blueprint:${blueprint.equipmentId}` : `equipment-slot:${selectedSlot.slot}`;
    const label = selected ? `${selected.name} • T${selected.tier} • ${selected.state}`
      : blueprint ? `${blueprint.name} • FABRICABLE • ${blueprint.fabricationCost} Scrap` : `Select a ${selectedSlot.label.toLowerCase()} candidate`;
    const horizontalBand = this.layout.height <= 480 && this.layout.width >= 600;
    const actionWidth = Math.min(240, Math.max(180, Math.floor(contentWidth * 0.28)));
    const summaryWidth = horizontalBand ? contentWidth - actionWidth - 12 : contentWidth;
    let summary = this.loadoutCopy(root, left, this.footerTop(),
      horizontalBand ? `SELECTED • ${label}` : `SELECTED\n${label}`, summaryWidth, '#f7f1d5', false);
    const collectionBottom = () => this.browseSummaryTop(summary.height) - 8;
    const hasUsableCollection = () => collectionBottom() - this.collectionTop >= 32;
    if (!hasUsableCollection()) {
      // Long identity belongs to the candidate and local detail view. Keep a
      // measured, bounded summary so supported viewports retain a collection
      // region instead of collapsing into an invalid rectangle.
      summary.destroy();
      summary = this.loadoutCopy(root, left, this.footerTop(),
        `SELECTED • ${selected?.state ?? 'BLUEPRINT'}`, summaryWidth, '#f7f1d5', false);
    }
    if (!hasUsableCollection()) {
      summary.destroy();
      summary = this.loadoutCopy(root, left, this.footerTop(), 'SELECTED', summaryWidth, '#f7f1d5', false);
    }
    return { summary, selected, blueprint, selectedKey, contentWidth, left, horizontalBand, summaryWidth };
  }

  private addOuterBack(root: Phaser.GameObjects.Container, left: number, contentWidth: number): void {
    this.button(root, left + contentWidth - 72, edgeMargin(this.layout.viewport, 'top') - 12 + 7, 'Back', this.layout.hitTarget,
      () => this.environment.onSnapshot(this.commands.open('loadout')), 'ui:back', 72);
  }

  private captureTailObjects(root: Phaser.GameObjects.Container, fixedRoot: Phaser.GameObjects.Container,
    retained: ReadonlySet<Phaser.GameObjects.GameObject>): void {
    this.tailObjects = [...new Set([...root.list, ...fixedRoot.list])].filter(object => !retained.has(object));
  }

  private footerTop(): number {
    return this.layout.height - edgeMargin(this.layout.viewport, 'bottom', 16) - this.layout.hitTarget - this.loadoutFooterPadding();
  }

  /** Decide whether the authored slot header fits above the fixed Browse Sets
   * control using the viewport's real vertical budget. The old height cutoff
   * left the 390px phone's 641–677px band with a native two-row grid whose
   * Browse Sets row overlapped the footer. */
  private useCompactEquipmentTabs(collectionTop: number, contentWidth: number): boolean {
    if (this.layout.width <= 375 || this.layout.height <= 480) return true;
    const columns = this.layout.width >= 1040 ? 4 : 2;
    const gap = columns === 4 ? 8 : 12;
    const slotWidth = (contentWidth - gap * (columns - 1)) / columns;
    const media = Math.min(this.equipmentMediaExtent(), Math.max(0, slotWidth - 24));
    const rowHeight = Math.max(this.layout.hitTarget, media + 72);
    const rows = Math.ceil(4 / columns);
    const nativeGridHeight = rows * rowHeight + Math.max(0, rows - 1) * gap + 6;
    const browseHeight = this.layout.hitTarget + (this.layout.width < 600 ? 6 : 4);
    const available = this.footerTop() - collectionTop;
    return nativeGridHeight + browseHeight > available;
  }

  private browseSummaryTop(summaryHeight = 0): number {
    const bandHeight = this.layout.height <= 480 && this.layout.width >= 600
      ? Math.max(this.layout.hitTarget, summaryHeight) + 8
      : this.layout.height <= 480
        ? summaryHeight + this.layout.hitTarget + 8
        : Math.max(112, summaryHeight + this.layout.hitTarget + 16);
    return this.footerTop() - bandHeight;
  }

  private wideInspectorWidth(contentWidth: number): number {
    return Math.min(320, Math.max(288, Math.floor(contentWidth * 0.3)));
  }

  private collectionRectangle(left: number, top: number, width: number, bottom = this.layout.scrollBottom): MenuScrollRectangle {
    const height = bottom - top;
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new RangeError('Equipment collection requires a positive viewport');
    }
    return { x: left, y: top, width, height };
  }

  /** Detail commit actions are fixed chrome, so reserve their stack above the
   * fixed Fabricate/footer action before measuring the reader body. This keeps
   * Equip/Upgrade reachable without asking pointer users to scroll an action
   * under the fixed footer, while preserving one body-owned scroll region. */
  private detailActionCount(snapshot: MainMenuSnapshot): number {
    const equipment = snapshot.equipment;
    const selectedSlot = equipment.presentation.slots.find(slot => slot.slot === equipment.selectedSlot);
    const selected = selectedSlot?.candidates.find(item => item.instanceId === equipment.selectedInstanceId);
    if (!selected) return 0;
    const upgrade = equipment.owned.find(item => item.instanceId === selected.instanceId);
    return 1 + (upgrade?.upgradePreview?.cost !== undefined ? 1 : 0);
  }

  private detailScrollableBottom(snapshot: MainMenuSnapshot): number {
    const count = this.detailActionCount(snapshot);
    if (count === 0) return this.layout.scrollBottom;
    const actionGap = 8;
    const fixedActionsTop = this.footerTop() - count * (this.layout.hitTarget + actionGap);
    return Math.min(this.layout.scrollBottom, fixedActionsTop - actionGap);
  }

  private detailFixedActionTop(snapshot: MainMenuSnapshot): number {
    return this.footerTop() - this.detailActionCount(snapshot) * (this.layout.hitTarget + 8);
  }

  private fabricationActionLabel(
    blueprint: MainMenuSnapshot['equipment']['blueprints'][number] | undefined,
    scrap: number,
  ): string {
    if (!blueprint) return 'Fabricate unavailable';
    const missing = blueprint.fabricationCost - scrap;
    return missing > 0 ? `Fabricate locked • Need ${missing} Scrap` : `Fabricate for ${blueprint.fabricationCost} Scrap`;
  }

  private fabricationReason(
    blueprint: MainMenuSnapshot['equipment']['blueprints'][number] | undefined,
    scrap: number,
  ): string {
    if (!blueprint) return 'FABRICATE UNAVAILABLE • Select a blueprint from candidates to fabricate equipment.';
    const missing = blueprint.fabricationCost - scrap;
    return missing > 0
      ? `FABRICATE LOCKED • Need ${missing} more Scrap (balance ${scrap}).`
      : `FABRICATE • Creates a stored T1 item for ${blueprint.fabricationCost} Scrap.`;
  }

  /** Fixed wide-layout inspector. The candidate collection is closed before
   * this is drawn, so inspector art/actions never inherit collection scroll. */
  private drawWideInspector(root: Phaser.GameObjects.Container, fixedRoot: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot, scrap: number,
    selected: MainMenuSnapshot['equipment']['presentation']['slots'][number]['candidates'][number] | undefined,
    blueprint: MainMenuSnapshot['equipment']['blueprints'][number] | undefined,
    left: number, width: number): void {
    const before = new Set([...root.list, ...fixedRoot.list]);
    const equipment = snapshot.equipment;
    const selectedSlot = equipment.presentation.slots.find(slot => slot.slot === equipment.selectedSlot)!;
    const upgrade = selected ? equipment.owned.find(item => item.instanceId === selected.instanceId) : undefined;
    const hasUpgrade = !!upgrade?.upgradePreview;
    const actionGap = 8;
    const actionHeight = this.layout.hitTarget;
    const fullActionCount = 1 + (selected ? 1 : 0) + (hasUpgrade ? 1 : 0);
    const actionTopFor = (count: number): number => this.footerTop() - actionHeight - actionGap
      - Math.max(0, count - 1) * (actionHeight + actionGap);
    let actionCount = fullActionCount;
    let actionTop = actionTopFor(actionCount);
    const contentBottom = (): number => actionTop - actionGap;
    const contentTop = this.layout.top + 18;
    const title = selected ? `${selected.name} • T${selected.tier}` : blueprint!.name;
    const subtitle = selected ? `${selectedSlot.label} • ${selected.state}` : `${blueprint!.setName} Set • ${selectedSlot.label}`;
    const heading = this.loadoutCopy(root, left, contentTop, `INSPECTOR\n${title}\n${subtitle}`, width, '#f7f1d5');
    const comparison = selected
      ? selected.state === 'EQUIPPED'
        ? this.commands.equipmentPreview({ kind: 'unequip', slot: selectedSlot.slot })
        : equipment.comparison
      : undefined;
    const selectedEffects = selected ? this.loadoutEffectCopy(selected.effects) || 'None' : undefined;
    const removedEffects = selected
      ? this.loadoutEffectCopy(comparison?.displaced?.effects
        ?? (selected.state === 'EQUIPPED' ? selected.effects : [])) || 'None'
      : undefined;
    const setChangeCopy = comparison?.setChanges.flatMap((change) => {
      const set = comparison.after.sets.find((row) => row.setId === change.setId);
      if (!set) return [];
      const lines = [`${set.name} ${change.before}/4 → ${change.after}/4`];
      for (const count of change.lost) lines.push(`LOSE ${count}-piece: ${this.loadoutEffectCopy(
        comparison.before.sets.find((row) => row.setId === change.setId)?.thresholds.find((threshold) => threshold.count === count)?.effects ?? [],
      ) || 'None'}`);
      for (const count of change.gained) lines.push(`GAIN ${count}-piece: ${this.loadoutEffectCopy(
        set.thresholds.find((threshold) => threshold.count === count)?.effects ?? [],
      ) || 'None'}`);
      return lines;
    }) ?? [];
    const upgradeAfter = selected && upgrade?.upgradePreview
      ? upgrade.upgradePreview.after.slots.find((slot) => slot.slot === selected.slot)
        ?.candidates.find((item) => item.instanceId === selected.instanceId)
      : undefined;
    const summaryText = selected
      ? [
        `${selected.state} • ${selected.state === 'EQUIPPED' ? 'Unequips current item' : comparison?.displaced ? `Replaces ${comparison.displaced.name}` : 'Fills empty slot'}`,
        `EFFECTS: ${selectedEffects}`,
        ...(comparison?.displaced && selected.state !== 'EQUIPPED' ? [`REMOVES: ${removedEffects}`] : []),
        `SET CHANGES: ${setChangeCopy.length ? setChangeCopy.join(' • ') : 'None'}`,
        upgradeAfter
          ? `UPGRADE T${selected.tier} → T${upgradeAfter.tier} • ITEM NOW: ${selectedEffects} • ITEM AFTER UPGRADE: ${this.loadoutEffectCopy(upgradeAfter.effects) || 'None'}`
          : 'UPGRADE: No preview',
      ].join('\n')
      : [
        `${blueprint!.effects.length} blueprint effect${blueprint!.effects.length === 1 ? '' : 's'}`,
        'EFFECTS', this.loadoutEffectCopy(blueprint!.effects) || 'None',
        'Creates a stored T1 item; equip it separately.',
        this.fabricationReason(blueprint, scrap),
      ].join('\n');
    const fallbackSummaryText = 'View details for full consequences';
    const summary = this.loadoutCopy(root, left, contentTop + heading.height + 12, summaryText, width);
    const fitsContent = (): boolean => heading.y + heading.height <= contentBottom()
      && summary.y + summary.height <= contentBottom();
    if (!fitsContent()) {
      actionCount = 1;
      actionTop = actionTopFor(actionCount);
    }
    if (heading.y + heading.height > contentBottom()) {
      heading.setText(`INSPECTOR\n${selected?.state ?? 'BLUEPRINT'}`);
    }
    summary.setPosition(left, heading.y + heading.height + 12);
    if (summary.y + summary.height > contentBottom()) {
      summary.setText(fallbackSummaryText);
      summary.setPosition(left, heading.y + heading.height + 12);
    }
    if (summary.y + summary.height > contentBottom()) {
      summary.setText('View details');
      summary.setPosition(left, heading.y + heading.height + 12);
    }
    // A short viewport uses the explicit detail view as the overflow escape:
    // keep identity/summary and View details visible, then move commit actions
    // into the bounded detail body instead of placing them under clipped copy.
    const showCommitActions = actionCount === fullActionCount;
    const artId = selected?.iconArtId ?? blueprint!.iconArtId;
    const extent = Math.min(80, width - 24);
    const artTop = heading.y + heading.height + 12;
    const artBottom = artTop + extent + 36;
    if (showCommitActions && artBottom + summary.height <= contentBottom()) {
      this.loadoutMaterial(root, left, artTop, width, extent + 24);
      this.environment.controls.addLoadoutArt(root, left + width / 2, artTop + 12 + extent / 2,
        artId, extent, extent);
      summary.setPosition(left, artBottom);
    } else {
      summary.setPosition(left, artTop);
    }
    let y = summary.y + summary.height + 8;
    if (selected && showCommitActions && upgrade?.upgradePreview) {
      const after = upgrade.upgradePreview.after.slots.find(slot => slot.slot === selected.slot)
        ?.candidates.find(item => item.instanceId === selected.instanceId);
      const pairWidth = (width - 16) / 2;
      const pairExtent = Math.min(56, pairWidth - 24);
      if (after && y + pairExtent + 56 <= actionTop) {
        const framing = [selected.iconArtId, after.iconArtId];
        this.loadoutMaterial(root, left, y, pairWidth, pairExtent + 56);
        this.loadoutMaterial(root, left + pairWidth + 16, y, pairWidth, pairExtent + 56);
        this.environment.controls.addLoadoutArt(root, left + pairWidth / 2, y + 12 + pairExtent / 2,
          selected.iconArtId, pairExtent, pairExtent, undefined, framing);
        this.environment.controls.addLoadoutArt(root, left + pairWidth + 16 + pairWidth / 2, y + 12 + pairExtent / 2,
          after.iconArtId, pairExtent, pairExtent, undefined, framing);
        y += pairExtent + 56;
      }
    }
    let nextActionY = actionTop;
    const details = this.button(fixedRoot, left, nextActionY, 'View details', actionHeight, () => {
      this.detailViewOpen = true;
      this.browseReturnFocusKey = selected ? `equipment-candidate:${selected.instanceId}` : `equipment-blueprint:${blueprint!.equipmentId}`;
      this.browseReturnScrollOffset = this.environment.controls.currentScrollOffset();
      this.browseReturnBookmark = this.environment.controls.currentScrollBookmark();
      this.environment.controls.focusNext(selected ? `equipment-detail:${selected.instanceId}` : `equipment-blueprint-detail:${blueprint!.equipmentId}`, true);
      this.environment.onSnapshot(this.commands.snapshot());
    }, 'ui:confirm', width);
    // The fixed inspector action and the detail reader are separate semantic
    // targets. Sharing the reader key made Up/Down on this button enter the
    // paged-reader shortcut before the reader existed, so the collection
    // appeared stuck instead of opening the local view.
    this.rememberLoadoutFocus(details, selected ? `equipment-inspector:${selected.instanceId}` : `equipment-blueprint-inspector:${blueprint!.equipmentId}`);
    nextActionY += details.height + actionGap;
    if (selected && showCommitActions) {
      const action = this.button(fixedRoot, left, nextActionY,
        selected.state === 'EQUIPPED' ? 'Unequip current item' : 'Equip selected item',
        actionHeight, () => this.environment.onSnapshot(selected.state === 'EQUIPPED'
          ? this.commands.unequipEquipment(selectedSlot.slot)
          : this.commands.equipEquipment(selected.instanceId)), 'ui:confirm', width);
      this.rememberLoadoutFocus(action, `equipment-equip:${selected.instanceId}`);
      nextActionY += action.height + actionGap;
      if (upgrade?.upgradePreview) {
        const cost = upgrade.upgradePreview.cost;
        const upgradeAction = this.button(fixedRoot, left, nextActionY,
          upgrade.upgradeLockReason ? 'Upgrade locked' : cost === undefined ? 'Upgrade unavailable' : `Upgrade for ${cost} Scrap`,
          actionHeight, () => this.environment.onSnapshot(this.commands.upgradeEquipment(selected.instanceId, selected.tier)), 'ui:confirm', width);
        this.rememberLoadoutFocus(upgradeAction, `equipment-upgrade:${selected.instanceId}`);
        if (upgrade.upgradeLocked || upgrade.upgradeLockReason || cost === undefined || scrap < cost) this.environment.controls.disableButton(upgradeAction);
      }
    }
    this.loadoutFooter(fixedRoot, left, width, this.layout.hitTarget,
      this.fabricationActionLabel(blueprint, scrap), () => {
        if (blueprint) this.environment.onSnapshot(this.commands.fabricateEquipment(blueprint.equipmentId));
      }, !blueprint || scrap < blueprint.fabricationCost);
    this.addOuterBack(fixedRoot, left + width - 72, 72);
    this.environment.resources.equipment([
      ...(selected ? [selected.iconArtId] : []), ...(blueprint ? [blueprint.iconArtId, blueprint.setEmblemArtId] : []),
    ]);
    this.captureTailObjects(root, fixedRoot, before);
  }

  private drawSelection(root: Phaser.GameObjects.Container, fixedRoot: Phaser.GameObjects.Container,
    snapshot: MainMenuSnapshot, scrap: number): void {
    const equipment = snapshot.equipment;
    const { hitTarget } = this.layout;
    const contentWidth = this.loadoutContentWidth();
    const left = this.layout.centerX - contentWidth / 2;
    let y = this.detailTop;
    const selectedSlot = equipment.presentation.slots.find(slot => slot.slot === equipment.selectedSlot)!;
    const blueprints = equipment.blueprints.filter(piece => piece.slot === equipment.selectedSlot);
    const put = (text: string, color?: string) => { const copy = this.loadoutCopy(root, left, y, text, contentWidth, color); y += copy.height + 8; };
    const before = new Set([...root.list, ...fixedRoot.list]);
    this.drawingSelection = true;
    try {
    const selected = selectedSlot.candidates.find((item) => item.instanceId === equipment.selectedInstanceId);
    const selectedBlueprint = blueprints.find((piece) => piece.equipmentId === equipment.selectedBlueprintId);
    const fixedDetailActions: Array<{ label: string; action: () => void; key: string; disabled?: boolean }> = [];
    const queueFixedDetailAction = (label: string, action: () => void, key: string, disabled = false): void => {
      fixedDetailActions.push({ label, action, key, disabled });
    };
    if (selected) {
      const source = equipment.acquisition.find((row) => row.equipmentId === selected.equipmentId)?.summary ?? '';
      const set = equipment.presentation.sets.find((row) => row.setId === selected.setId)!;
      const equipped = selected.state === 'EQUIPPED';
      const comparison = equipped ? this.commands.equipmentPreview({ kind: 'unequip', slot: selectedSlot.slot }) : equipment.comparison;
      const selectedEffects = this.loadoutEffectCopy(selected.effects) || 'None';
      const desktopDecisionCopy = this.layout.width >= 600
        ? [
          `EFFECT: ${selectedEffects}`,
          comparison?.displaced ? `REPLACES: ${comparison.displaced.name}` : `SLOT: ${selectedSlot.label}`,
          comparison?.setChanges.length ? `SET TRADE-OFFS: ${comparison.setChanges.length} threshold change${comparison.setChanges.length === 1 ? '' : 's'}` : 'SET TRADE-OFFS: None',
        ] : [];
      const detail = this.equipmentInspection(root, left, y, contentWidth,
        [`${selected.name} • T${selected.tier}`, `${selectedSlot.label} • ${set.name} Set • ${selected.state}`, source, ...desktopDecisionCopy]
          .filter(Boolean).join('\n'), selected.iconArtId);
      this.rememberLoadoutFocus(detail, `equipment-detail:${selected.instanceId}`);
      y += detail.height + 16;
      y = this.renderScopedLoadoutEffects(root, selected.effects, left, y, contentWidth, 22);
      put(equipped ? 'IF UNEQUIPPED' : comparison?.displaced ? `Replaces ${comparison.displaced.name}` : `Fills empty ${selectedSlot.label.toLowerCase()} slot`);
      if (!equipped && comparison?.displaced) {
        put(`REMOVES: ${this.loadoutEffectCopy(comparison.displaced.effects) || 'None'}`, '#fbbf24');
      }
      if (comparison) y = this.renderEquipmentComparison(root, comparison, left, y, contentWidth, new Map(snapshot.gunsmith.families.map((family) => [family.id, family.name])));
      queueFixedDetailAction(equipped ? `Unequip ${selected.name}` : `Equip ${selected.name}`, () => this.environment.onSnapshot(equipped
        ? this.commands.unequipEquipment(selectedSlot.slot)
        : this.commands.equipEquipment(selected.instanceId)), `equipment-equip:${selected.instanceId}`);
      const upgrade = equipment.owned.find((item) => item.instanceId === selected.instanceId)!;
      if (upgrade.upgradePreview) {
        const cost = upgrade.upgradePreview.cost;
        put(`UPGRADE • T${selected.tier} → T${selected.tier + 1} • ${cost} Scrap\n${equipped ? 'EQUIPPED: improved values apply immediately after upgrade.' : 'STORED: no active Loadout value changes until equipped.'}`);
        if (cost !== undefined) put(upgrade.upgradeLockReason ? `No Scrap spent • balance remains ${scrap}`
          : scrap < cost ? `Need ${cost - scrap} more Scrap • balance remains ${scrap}`
            : `Balance after: ${scrap - cost} Scrap`);
        const afterItem = upgrade.upgradePreview.after.slots.find((slot) => slot.slot === selected.slot)!.candidates.find((item) => item.instanceId === selected.instanceId)!;
        const pairWidth = (contentWidth - 16) / 2;
        const extent = Math.min(this.equipmentInspectionExtent(pairWidth), pairWidth - 24);
        const framing = [selected.iconArtId, afterItem.iconArtId];
        this.loadoutMaterial(root, left, y, pairWidth, extent + 56);
        this.loadoutMaterial(root, left + pairWidth + 16, y, pairWidth, extent + 56);
        this.environment.controls.addLoadoutArt(root, left + pairWidth / 2, y + 12 + extent / 2,
          selected.iconArtId, extent, extent, undefined, framing);
        this.environment.controls.addLoadoutArt(root, left + pairWidth + 16 + pairWidth / 2, y + 12 + extent / 2,
          afterItem.iconArtId, extent, extent, undefined, framing);
        this.loadoutCopy(root, left + 12, y + extent + 24, `TIER ${selected.tier}`, pairWidth - 24, '#24cec7');
        this.loadoutCopy(root, left + pairWidth + 28, y + extent + 24, `TIER ${afterItem.tier}`, pairWidth - 24, '#24cec7');
        y += extent + 72;
        put(`ITEM NOW\n${this.loadoutEffectCopy(selected.effects)}\nITEM AFTER UPGRADE\n${this.loadoutEffectCopy(afterItem.effects)}`);
        if (cost !== undefined) {
          queueFixedDetailAction(upgrade.upgradeLockReason ? `LOCKED • ${upgrade.upgradeLockReason}` : `Upgrade for ${cost} Scrap`,
            () => this.environment.onSnapshot(this.commands.upgradeEquipment(selected.instanceId, selected.tier)),
            `equipment-upgrade:${selected.instanceId}`, upgrade.upgradeLocked || scrap < cost);
        }
      }
      if (upgrade.upgradeLockReason) put(`LOCKED • ${upgrade.upgradeLockReason}`, '#fbbf24');
      else if (selected.tier >= 4) put('Maximum Equipment tier');
    } else if (selectedBlueprint) {
      const source = equipment.acquisition.find((row) => row.equipmentId === selectedBlueprint.equipmentId)?.summary ?? '';
      const detail = this.equipmentInspection(root, left, y, contentWidth,
        `${selectedBlueprint.name}\n${selectedBlueprint.setName} Set • ${selectedSlot.label}\n${source}`, selectedBlueprint.iconArtId);
      this.rememberLoadoutFocus(detail, `equipment-blueprint-detail:${selectedBlueprint.equipmentId}`);
      y += detail.height + 16;
      y = this.renderScopedLoadoutEffects(root, selectedBlueprint.effects, left, y, contentWidth, 22);
      put('Creates a stored T1 item. Equip it separately to change your Loadout.');
    }
    put(this.fabricationReason(selectedBlueprint, scrap), selectedBlueprint && scrap >= selectedBlueprint.fabricationCost ? '#d6f7ff' : '#fbbf24');
    put('ACTIVE SETS');
    const activeSets = equipment.presentation.sets.filter((set) => set.equippedCount > 0);
    if (!activeSets.length) put('No Set pieces equipped');
    for (const set of activeSets) {
      const copy = this.loadoutCopy(root, left + 38, y, this.setProgressCopy(set), contentWidth - 38);
      this.environment.controls.addCatalogIcon(root, left + 17, y + 20, set.emblemArtId, 30);
      y += copy.height + 10;
    }
    if (equipment.unavailable.length) put('A legacy Equipment item is unavailable in this version.', '#fbbf24');
    this.environment.controls.endScrollableRegion();
    let fixedActionY = this.detailFixedActionTop(snapshot);
    for (const detailAction of fixedDetailActions) {
      const action = this.button(fixedRoot, left, fixedActionY, detailAction.label, hitTarget, detailAction.action,
        'ui:confirm', contentWidth);
      this.rememberLoadoutFocus(action, detailAction.key);
      if (detailAction.disabled) this.environment.controls.disableButton(action);
      fixedActionY += hitTarget + 8;
    }
    const fabricate = this.loadoutFooter(fixedRoot, left, contentWidth, hitTarget,
      this.fabricationActionLabel(selectedBlueprint, scrap), () => {
        if (!selectedBlueprint) return;
        const next = this.commands.fabricateEquipment(selectedBlueprint.equipmentId);
        if (next.equipment.selectedInstanceId) {
          // The successful fabrication removes its blueprint card. Return to
          // the new stored item rather than restoring that missing identity.
          this.browseReturnFocusKey = `equipment-candidate:${next.equipment.selectedInstanceId}`;
          this.browseReturnBookmark = { anchorKey: this.browseReturnFocusKey, intraRowOffset: 0 };
        }
        this.environment.controls.focusNext(next.equipment.selectedInstanceId ? `equipment-detail:${next.equipment.selectedInstanceId}` : `equipment-blueprint-detail:${selectedBlueprint.equipmentId}`, true);
        this.environment.onSnapshot(next);
      }, !selectedBlueprint || scrap < selectedBlueprint.fabricationCost);
    if (selected || selectedBlueprint) {
      const localBack = this.button(fixedRoot, left, edgeMargin(this.layout.viewport, 'top') - 12 + 7, 'Back to candidates', hitTarget,
        () => { this.handleBack(); }, 'ui:back', 160);
      this.rememberLoadoutFocus(localBack, selected ? `equipment-detail-back:${selected.instanceId}` : 'equipment-detail-back');
    }
    // Create the bounded fixed Back control last: slots remain the first four
    // semantic focus entries for the shared grid navigator.
    this.addOuterBack(fixedRoot, left, contentWidth);
    if (selectedBlueprint) this.rememberLoadoutFocus(fabricate, `equipment-fabricate:${selectedBlueprint.equipmentId}`);
    this.environment.resources.equipment([
      ...equipment.presentation.slots.map((slot) => slot.placeholderArtId),
      ...equipment.presentation.slots.flatMap((slot) => slot.equipped ? [slot.equipped.iconArtId] : []),
      ...selectedSlot.candidates.map((item) => item.iconArtId),
      ...blueprints.flatMap((piece) => [piece.iconArtId, piece.setEmblemArtId]),
      ...equipment.presentation.sets.map((set) => set.emblemArtId),
      ...equipment.owned.flatMap((item) => item.instanceId === equipment.selectedInstanceId && item.upgradePreview
        ? item.upgradePreview.after.slots.flatMap((slot) => slot.candidates.filter((candidate) => candidate.instanceId === item.instanceId).map((candidate) => candidate.iconArtId)) : []),
    ]);
    this.environment.resources.panel('equipment', ['nav-icon:mercenary', 'nav-icon:gunsmith']);
    } finally {
      this.drawingSelection = false;
      this.tailObjects = [...new Set([...root.list, ...fixedRoot.list])].filter(object => !before.has(object));
    }
  }
}
