import type Phaser from 'phaser';
import type { MainMenuSnapshot } from '../menus';
import { LoadoutPanelSurface } from './loadoutChrome';
import { type MenuScrollBookmark, type MenuScrollRectangle, type MenuSurfaceLayout, type EquipmentSurfaceCommands, type MenuSurfaceControls, type MenuSurfaceEnvironment } from './surface';
import { edgeMargin } from '../layout';
import type { EquipmentComparison } from '../equipmentPresentation';
import {
  equipmentBrowseFilterCount,
  equipmentGradeAccessibleCopy,
  equipmentGradeCopy,
  equipmentSortCopy,
  type EquipmentCatalogEntry,
  type EquipmentFilterFacet,
} from '../equipmentCatalog';

interface UpgradeReviewState {
  readonly instanceId: string;
  readonly expectedTier: number;
  readonly expectedState: 'EQUIPPED' | 'STORED';
}

interface UpgradeReviewLine {
  readonly text: string;
  readonly color: string;
  readonly heading?: boolean;
  readonly fontSize?: number;
  readonly lineSpacing?: number;
}

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
  private revealSetBrowserOnNextDraw = false;
  private setBrowserRevealOffset = 0;
  private renderedBlueprintId?: string;
  private renderedSlot?: string;
  private renderedWideInspector = false;
  private filtersOpen = false;
  private searchMode = false;
  private searchInput?: HTMLInputElement;
  private searchInputComposing = false;
  private upgradeReview?: UpgradeReviewState;
  private readonly searchKeyListener: (event: KeyboardEvent) => void;
  /** Candidate cards remain mounted while browse selection replaces only the
   * fixed summary. They become replaceable when the same mount enters detail. */
  private browseCandidateObjects: Phaser.GameObjects.GameObject[] = [];
  private tailObjects: Phaser.GameObjects.GameObject[] = [];
  private catalogCardVisuals = new Map<string, {
    marker: Phaser.GameObjects.Rectangle;
    outline: Phaser.GameObjects.Rectangle;
    state: EquipmentCatalogEntry['state'];
  }>();
  /** The retained browse header is a separate ownership slice from the
   * replaceable candidate/summary tail. Detail updates suppress this slice
   * explicitly; they never suppress the whole masked content container. */
  private browsePrefixObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(environment: MenuSurfaceEnvironment, commands: EquipmentSurfaceCommands) {
    super(environment, commands);
    this.searchKeyListener = (event: KeyboardEvent) => this.handleSearchKey(event);
    environment.scene.input?.keyboard?.on('keydown', this.searchKeyListener, this);
  }

  get selectionObjects(): readonly Phaser.GameObjects.GameObject[] {
    return this.detailViewOpen ? [...this.browseCandidateObjects, ...this.tailObjects] : this.tailObjects;
  }

  handleBack(): boolean {
    if (!this.detailViewOpen) return false;
    this.upgradeReview = undefined;
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
        this.detailScrollableBottom(snapshot, scrap)));
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
    // Wide retained browse cards stay mounted while the inspector changes;
    // refresh their marker/outline state in that branch as well.
    this.updateCatalogCardVisuals(snapshot);
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
    // Search input owns the browser's editing session. Keep it mounted while
    // a query repaint replaces the Phaser surface; explicit close/leave and
    // dispose paths remove it.
    if (!this.searchMode) this.removeSearchInput();
    this.selectionGeneration += 1;
    this.selectionInvariant = undefined;
    this.tailObjects = [];
    this.browsePrefixObjects = [];
    this.browseCandidateObjects = [];
    this.catalogCardVisuals.clear();
    this.renderedWideInspector = false;
    super.unmount();
  }

  override dispose(): void {
    this.removeSearchInput();
    this.searchMode = false;
    this.environment.scene.input?.keyboard?.off('keydown', this.searchKeyListener, this);
    this.selectionGeneration += 1;
    this.upgradeReview = undefined;
    this.selectionInvariant = undefined;
    this.tailObjects = [];
    this.browsePrefixObjects = [];
    this.browseCandidateObjects = [];
    this.catalogCardVisuals.clear();
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
      equipment.progression,
      equipment.selectedSlot,
      this.equipmentSetBrowserOpen,
      this.filtersOpen,
      this.searchMode,
      prefixSlots,
      equipment.presentation.sets,
      equipment.presentation.runTruth,
      equipment.blueprints,
      equipment.acquisition,
      equipment.unavailable,
      equipment.browse,
      equipment.filteredCatalog,
      equipment.setCatalog,
      snapshot.stage.stages.find(stage => stage.selected)?.menuBackdropArtId,
    ]);
  }

  private handleSearchKey(event: KeyboardEvent): void {
    // The real DOM input owns text editing when the browser exposes one. The
    // Phaser fallback remains for headless/unit surfaces without a document.
    if (this.searchInput) return;
    if (!this.searchMode) return;
    if (this.searchInputComposing) return;
    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault();
      this.searchMode = false;
      if (event.key === 'Escape' && this.environment.scene.input?.keyboard) {
        this.environment.onSnapshot(this.commands.setEquipmentSearch(''));
      } else {
        this.environment.onSnapshot(this.commands.snapshot());
      }
      return;
    }
    const current = this.cachedSearchQuery;
    if (event.key === 'Backspace') {
      event.preventDefault();
      this.environment.onSnapshot(this.commands.setEquipmentSearch(current.slice(0, -1)));
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.environment.onSnapshot(this.commands.setEquipmentSearch(`${current}${event.key}`));
    }
  }

  private handleSearchInputKey(event: KeyboardEvent): void {
    // Keep composition commits inside the IME. Enter must finish the
    // composition first; closing the search field here would drop the final
    // grapheme before compositionend publishes the query.
    event.stopPropagation();
    if (this.searchInputComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.closeSearchInput();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSearchInput(true);
    }
  }

  private cachedSearchQuery = '';

  private removeSearchInput(): void {
    const input = this.searchInput;
    this.searchInput = undefined;
    this.searchInputComposing = false;
    // Clear ownership before detaching: removeChild can synchronously blur
    // the input, and its blur handler must not recursively detach the same
    // node during the outer removal.
    if (input?.parentNode) input.parentNode.removeChild(input);
  }

  private closeSearchInput(clear = false): void {
    const input = this.searchInput;
    this.searchMode = false;
    this.removeSearchInput();
    if (clear) this.environment.onSnapshot(this.commands.setEquipmentSearch(''));
    if (!clear && input) this.environment.onSnapshot(this.commands.snapshot());
    this.environment.controls.focusNext('equipment-search');
  }

  private ensureSearchInput(button: Phaser.GameObjects.Text): void {
    if (!this.searchMode || typeof document === 'undefined' || !document.body) return;
    if (!this.searchInput) {
      const input = document.createElement('input');
      input.type = 'search';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-label', 'Search equipment names, sets, or effects');
      input.placeholder = 'Search names, sets, or effects';
      Object.assign(input.style, {
        position: 'fixed',
        zIndex: '30',
        boxSizing: 'border-box',
        padding: '0 14px',
        border: '1px solid #f78003',
        borderRadius: '2px',
        background: '#101b22',
        color: '#d6f7ff',
        fontFamily: 'Nunito, sans-serif',
        fontSize: '14px',
        outline: '2px solid transparent',
      });
      input.addEventListener('compositionstart', () => { this.searchInputComposing = true; });
      input.addEventListener('compositionend', () => {
        this.searchInputComposing = false;
        this.environment.onSnapshot(this.commands.setEquipmentSearch(input.value));
      });
      input.addEventListener('input', () => {
        if (!this.searchInputComposing) this.environment.onSnapshot(this.commands.setEquipmentSearch(input.value));
      });
      input.addEventListener('keydown', (event) => this.handleSearchInputKey(event));
      input.addEventListener('blur', () => {
        if (this.searchInput === input) this.closeSearchInput();
      });
      document.body.appendChild(input);
      this.searchInput = input;
      queueMicrotask(() => { if (this.searchInput === input) input.focus(); });
    }
    const canvas = (this.environment.scene.game as Phaser.Game | undefined)?.canvas;
    const canvasBounds = canvas?.getBoundingClientRect();
    const bounds = button.getBounds();
    if (!canvasBounds || !canvas) return;
    const scaleX = canvasBounds.width / this.layout.width;
    const scaleY = canvasBounds.height / this.layout.height;
    Object.assign(this.searchInput.style, {
      left: `${canvasBounds.left + bounds.left * scaleX}px`,
      top: `${canvasBounds.top + bounds.top * scaleY}px`,
      width: `${bounds.width * scaleX}px`,
      height: `${bounds.height * scaleY}px`,
    });
    if (this.searchInput.value !== this.cachedSearchQuery) this.searchInput.value = this.cachedSearchQuery;
  }

  protected draw(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot, layout: MenuSurfaceLayout, scrap: number): void {
    const { top, hitTarget } = layout;
    this.catalogCardVisuals.clear();
    const equipment = snapshot.equipment;
    this.cachedSearchQuery = equipment.browse.filters.query;
    this.renderedSelectionId = equipment.selectedInstanceId;
    this.renderedBlueprintSelectionId = equipment.selectedBlueprintId;
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
        this.detailScrollableBottom(snapshot, scrap)));
      this.drawSelection(root, root, snapshot, scrap);
      return;
    }
    // Desktop keeps the complete collection header in the same scroll-owned
    // lane as its slots, set control, and candidate cards. Otherwise the
    // section label and Browse Sets control stay screen-anchored while the
    // candidate grid moves underneath them.
    const desktopCollectionScroll = this.layout.width >= 1040;
    const sectionTop = y;
    const collectionViewportTop = sectionTop + 20;
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
    // Equipment browsing needs the catalogue to be the primary surface. The
    // art-led four-card treatment belongs to the Loadout overview; keeping
    // the Equipment context strip compact at every browse width preserves
    // usable inventory rows without reducing readable type.
    const compactTabs = true;
    const fixedSlotGrid = compactTabs || this.layout.height <= 480;
    this.collectionTop = desktopCollectionScroll ? sectionTop : collectionViewportTop;
    // Open the single collection region before slot rendering so authored
    // slot cards, candidate cards, copy, and art all enter the same Scene
    // owned mask. The fixed summary's measured bottom is applied below once
    // its wrapped text exists.
    if (!fixedSlotGrid || desktopCollectionScroll) {
      this.environment.controls.beginScrollableRegion(this.collectionRectangle(left, this.collectionTop, collectionWidth));
    }
    this.loadoutSection(root, left, sectionTop, 'EQUIPPED SLOTS');
    y = collectionViewportTop;
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
    if (fixedSlotGrid && !desktopCollectionScroll) {
      // Compact tabs and compact-landscape slot cards are fixed, reachable
      // headers. Only the body below them enters the shared scroll region.
      this.collectionTop = y;
      this.environment.controls.beginScrollableRegion(this.collectionRectangle(left, this.collectionTop, collectionWidth));
    }
    // On desktop this control belongs to the same collection lane as the
    // candidate grid. Narrow layouts keep it fixed above their shorter body.
    if (!desktopCollectionScroll) this.environment.controls.endScrollableRegion();
    const browse = this.button(root, left, y, this.equipmentSetBrowserOpen ? 'CLOSE SETS' : 'BROWSE SETS', hitTarget, () => {
      this.equipmentSetBrowserOpen = !this.equipmentSetBrowserOpen;
      this.environment.controls.focusNext('equipment:browse-sets');
      if (this.equipmentSetBrowserOpen) this.revealSetBrowserOnNextDraw = true;
      this.environment.onSnapshot(this.commands.snapshot());
      if (this.equipmentSetBrowserOpen) this.environment.controls.restoreScrollOffset(this.setBrowserRevealOffset);
    }, 'ui:confirm', contentWidth, 'ui-chrome:figma-arrow', 44, 0, false, 'left', 'card');
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
    // All narrow layouts keep the authored slot/header band fixed. Only the
    // inventory/search body should move, including when the slot cards use
    // their larger art-led treatment at 390px portrait.
    if (!desktopCollectionScroll) this.collectionTop = y;
    if (!desktopCollectionScroll) {
      this.environment.controls.beginScrollableRegion(this.collectionRectangle(left, this.collectionTop, collectionWidth));
    }
    // The structured catalog supplies a named, masked Set chooser. The old
    // closed state painted only four small emblems, which made the chooser
    // look like decoration and pushed the remaining names below the viewport.
    // Keep Browse Sets as the single semantic action, but give every emblem a
    // readable name/count summary in the same scroll-owned region. Compact
    // phones use two columns; wider profiles use four and naturally expose a
    // scroll rail for the second row when the viewport cannot show it all.
    // The full set catalog is intentionally behind Browse Sets. The always-
    // visible shell keeps only the selected-set context in the header, which
    // returns browsing height to the inventory on phones and foldables.
    const browsePrefixObjects = new Set([...root.list]);
    this.browsePrefixObjects = [...browsePrefixObjects];
    const put = (text: string, color?: string) => { const copy = this.loadoutCopy(root, left, y, text, collectionWidth, color); y += copy.height + 8; };
    const cardColumns = this.layout.width >= 1040 ? 3
      : this.layout.width >= 600 ? ((contentWidth - 24) / 3 >= 176 ? 3 : 2)
        : 2;
    const cardGap = cardColumns === 2 ? 12 : 8;
    const cardWidth = (collectionWidth - cardGap * (cardColumns - 1)) / cardColumns;
    const artExtent = this.layout.width < 600 ? 72 : this.layout.width >= 1040 ? 96 : 88;
    // Cards have three fixed visual bands: grade, art/set identity, then the
    // selectable name/state. Keeping those bands separate prevents the set
    // emblem and grade badge from sitting on top of the item label.
    const cardTopReserve = artExtent + 44;
    this.detailTop = y;
    const fixedSummary = !wideInspector || (!selectedForInspector && !blueprintForInspector);
    const browseSummary = fixedSummary ? this.prepareBrowseSummary(root, snapshot) : undefined;
    // Keep the authored slot art in the same scene-owned collection rectangle.
    // The fixed summary is below it; the region begins before the slot grid so
    // short phones retain a positive viewport instead of pushing collection
    // content below the fixed action band.
      const hasBrowseSelection = !!selectedForInspector || !!blueprintForInspector;
      const collectionBottom = fixedSummary
        // Unselected browsing has no action band. Give the inventory the full
        // available scroll lane instead of reserving a blank "Choose a
        // candidate" area and a disabled fabrication footer.
        ? hasBrowseSelection
          ? this.browseSummaryTop(browseSummary!.summary.height) - (this.layout.width >= 600 ? 8 : 16)
          : this.layout.width < 600
            ? this.layout.height - edgeMargin(this.layout.viewport, 'bottom', 12)
            : this.layout.scrollBottom
        : this.layout.scrollBottom;
      this.environment.controls.resizeScrollableRegion(this.collectionRectangle(left, this.collectionTop,
        collectionWidth, collectionBottom));
    const setReadingTop = y;
    if (this.equipmentSetBrowserOpen) {
      for (const set of equipment.setCatalog) {
        const availability = set.available ? `${set.pieces}/4 equipped` : `LOCKED • ${set.unlockReason}`;
        const thresholds = set.thresholds.map((threshold) => `${threshold.count}-piece ${threshold.active ? 'ACTIVE' : 'INACTIVE'}: ${this.loadoutEffectCopy(threshold.effects)}`).join('\n');
        const copy = this.loadoutCopy(root, left + 46, y, `${set.name}  ${availability}\n${set.description}\n${thresholds}`, collectionWidth - 46);
        this.environment.controls.addCatalogIcon(root, left + 20, y + 22, set.emblemArtId, 36);
        y += copy.height + 12;
      }
      const unavailable = equipment.acquisition.filter((row) => row.slot === equipment.selectedSlot && !row.available && !row.owned);
      if (unavailable.length) {
        put('UNAVAILABLE FABRICATION');
        for (const route of unavailable) put(`${route.name}: ${route.summary}`, '#fbbf24');
      }
    }
    y = this.renderBrowseControls(root, snapshot, left, y, collectionWidth, hitTarget);
    put(`INVENTORY • ${equipment.filteredCatalog.length} OF ${equipment.catalog.length} RESULTS • ${scrap} Scrap`);
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
            y + 32 + artExtent / 2, card.iconArtId, artExtent, artExtent, ownerIndex);
          decorate?.(card, x, y, ownerIndex, rowHeight);
        }
        y += rowHeight + 8;
      }
    };
    const ownedEntries = equipment.filteredCatalog.filter((entry) => entry.kind === 'owned');
    const blueprintEntries = equipment.filteredCatalog.filter((entry) => entry.kind === 'blueprint');
    if (!equipment.filteredCatalog.length) {
      put(equipment.catalog.length === 0
        ? `No stored ${selectedSlot.label.toLowerCase()} pieces. Choose a blueprint to fabricate.`
        : 'No equipment matches the current search and filters.');
    } else if (!ownedEntries.length) {
      put(`No stored ${selectedSlot.label.toLowerCase()} pieces. Choose a blueprint to fabricate.`);
    }
    renderCards(ownedEntries,
      item => `${item.name}\n${equipmentGradeCopy(item.grade)} • ${item.state}`,
      item => `equipment-candidate:${item.id}`,
      item => {
        // Selecting a result commits the browse choice; end the transient DOM
        // editing session so the result summary and filter chip remain fully
        // interactive instead of leaving the search overlay above them.
        if (this.searchMode) {
          this.searchMode = false;
          this.removeSearchInput();
        }
        this.browseReturnFocusKey = `equipment-candidate:${item.id}`;
        this.browseReturnScrollOffset = this.environment.controls.currentScrollOffset();
        this.browseReturnBookmark = this.environment.controls.currentScrollBookmark();
        // Pointer selection is an explicit visual inspection gesture and can
        // stationary-summary contract: card selection never auto-opens local
        // detail. The explicit View details action owns that transition for
        // both pointer and keyboard/controller users.
        this.environment.controls.focusNext(`equipment-candidate:${item.id}`);
        this.environment.onSnapshot(this.commands.selectEquipmentCandidate(item.id), 'equipment-selection');
      }, 0, (item, x, rowY, ownerIndex, rowHeight) => this.decorateCatalogCard(root, item, x, rowY, cardWidth, rowHeight, ownerIndex));
    if (blueprintEntries.length) put('AVAILABLE BLUEPRINTS');
    renderCards(blueprintEntries,
      blueprint => `${blueprint.name}\n${equipmentGradeCopy(blueprint.grade)} • FABRICABLE • ${blueprint.fabricationCost} Scrap`,
      blueprint => `equipment-blueprint:${blueprint.id}`,
      blueprint => {
        if (this.searchMode) {
          this.searchMode = false;
          this.removeSearchInput();
        }
        this.browseReturnFocusKey = `equipment-blueprint:${blueprint.id}`;
        this.browseReturnScrollOffset = this.environment.controls.currentScrollOffset();
        this.browseReturnBookmark = this.environment.controls.currentScrollBookmark();
        // Blueprint selection follows the same stationary-summary rule as
        // owned candidates; detail remains an explicit action.
        this.environment.controls.focusNext(`equipment-blueprint:${blueprint.id}`);
        this.environment.onSnapshot(this.commands.selectEquipmentBlueprint(blueprint.id), 'equipment-selection');
      }, 48, (blueprint, x, rowY, ownerIndex, rowHeight) => this.decorateCatalogCard(root, blueprint, x, rowY, cardWidth, rowHeight, ownerIndex));
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
    if (this.revealSetBrowserOnNextDraw) {
      // Opening the chooser should reveal its first useful reading, rather
      // than leave the player at the large slot header with only the toggle
      // label changed. The full body has been registered by this point, so
      // the shared region clamps this offset against the actual content end.
      this.revealSetBrowserOnNextDraw = false;
      this.setBrowserRevealOffset = Math.max(0, setReadingTop - this.collectionTop - 8);
    }
    // Candidate cards, collection copy, and fixed browse controls form one
    // replaceable body. Browse/detail transitions rebuild the surface mount;
    // same-mode selection updates replace this owned suffix in place.
  }

  private renderBrowseControls(root: Phaser.GameObjects.Container, snapshot: MainMenuSnapshot,
    left: number, top: number, width: number, hitTarget: number): number {
    const equipment = snapshot.equipment;
    const filters = equipment.browse.filters;
    const activeCount = equipmentBrowseFilterCount(filters);
    const gap = 8;
    // Search remains a full-width input row; Sort and Filters share the next
    // row on phones so the catalogue reaches the first complete card row.
    const columns = 2;
    const columnWidth = (width - gap * (columns - 1)) / columns;
    let y = top;
    const addControl = (label: string, key: string, action: () => void, x = left, controlWidth = width): Phaser.GameObjects.Text => {
      const button = this.button(root, x, y, label, hitTarget, action, 'ui:confirm', controlWidth, undefined, 0, 0, false, 'left', 'card');
      button.setStyle({ fontSize: '14px' });
      this.rememberLoadoutFocus(button, key);
      return button;
    };
    const searchLabel = this.searchMode
      ? `SEARCHING • ${filters.query || 'type a name, set, or effect'} • ENTER DONE • ESC CLEAR`
      : filters.query ? `SEARCH • ${filters.query}` : 'SEARCH NAMES, SETS, OR EFFECTS';
    const search = addControl(searchLabel, 'equipment-search', () => {
      if (this.searchMode) this.closeSearchInput();
      else {
        this.searchMode = true;
        this.environment.controls.focusNext('equipment-search');
        this.environment.onSnapshot(this.commands.snapshot());
      }
    });
    this.ensureSearchInput(search);
    y += search.height + gap;
    const sort = addControl(`SORT • ${equipmentSortCopy(equipment.browse.sort, equipment.browse.direction)}`,
      'equipment-sort', () => this.environment.onSnapshot(this.commands.cycleEquipmentSort()), left, columnWidth);
    const filter = addControl(`FILTERS • ${activeCount} ACTIVE`,
      'equipment-filters', () => { this.filtersOpen = !this.filtersOpen; this.environment.onSnapshot(this.commands.snapshot()); },
      left + columnWidth + gap, columnWidth);
    y += Math.max(sort.height, filter.height) + gap;
    const addFilterChip = (label: string, facet: EquipmentFilterFacet, value: string): void => {
      const chip = this.button(root, left, y, `× ${label}`, hitTarget - 4, () => {
        this.environment.onSnapshot(this.commands.toggleEquipmentFilter(facet, value));
      }, 'ui:confirm', width, undefined, 0, 0, false, 'left', 'card');
      this.rememberLoadoutFocus(chip, `equipment-filter-chip:${facet}:${value}`);
      y += chip.height + 4;
    };
    if (filters.query) {
      const chip = this.button(root, left, y, `× Search “${filters.query}”`, hitTarget - 4,
        () => this.environment.onSnapshot(this.commands.setEquipmentSearch('')), 'ui:confirm', width, undefined, 0, 0, false, 'left', 'card');
      this.rememberLoadoutFocus(chip, 'equipment-filter-chip:search');
      y += chip.height + 4;
    }
    filters.slots.forEach((slot) => addFilterChip(`Slot: ${slot}`, 'slot', slot));
    filters.sets.forEach((setId) => addFilterChip(`Set: ${equipment.setCatalog.find((set) => set.setId === setId)?.name ?? setId}`, 'set', setId));
    filters.grades.forEach((grade) => addFilterChip(`Grade: ${equipmentGradeCopy(grade)}`, 'grade', String(grade)));
    filters.ownership.forEach((ownership) => addFilterChip(`State: ${ownership}`, 'ownership', ownership));
    filters.readiness.forEach((readiness) => addFilterChip(`Upgrade: ${readiness}`, 'readiness', readiness));
    if (activeCount) {
      const clear = this.button(root, left, y, 'CLEAR FILTERS', hitTarget - 4,
        () => this.environment.onSnapshot(this.commands.clearEquipmentFilters()), 'ui:back', width, undefined, 0, 0, false, 'left', 'section');
      this.rememberLoadoutFocus(clear, 'equipment-clear-filters');
      y += clear.height + gap;
    }
    if (!this.filtersOpen) return y;
    const addFacet = (title: string, facet: EquipmentFilterFacet, options: readonly { value: string; label: string }[]): void => {
      const heading = this.loadoutCopy(root, left, y, title, width, '#f78003');
      heading.setStyle({ fontSize: '13px', fontStyle: '700' });
      y += heading.height + 4;
      const facetColumns = width >= 600 ? 3 : 2;
      const facetGap = 6;
      const facetWidth = (width - facetGap * (facetColumns - 1)) / facetColumns;
      let rowHeight = 0;
      options.forEach((option, index) => {
        if (index > 0 && index % facetColumns === 0) { y += rowHeight + facetGap; rowHeight = 0; }
        const x = left + (index % facetColumns) * (facetWidth + facetGap);
        const active = facet === 'slot' ? filters.slots.includes(option.value as never)
          : facet === 'set' ? filters.sets.includes(option.value)
            : facet === 'grade' ? filters.grades.includes(Number(option.value) as never)
              : facet === 'ownership' ? filters.ownership.includes(option.value as never)
                : filters.readiness.includes(option.value as never);
        const button = this.button(root, x, y, `${active ? '✓ ' : ''}${option.label}`, hitTarget - 8,
          () => this.environment.onSnapshot(this.commands.toggleEquipmentFilter(facet, option.value)),
          'ui:confirm', facetWidth, undefined, 0, 0, true, 'left', 'card');
        this.rememberLoadoutFocus(button, `equipment-filter:${facet}:${option.value}`);
        rowHeight = Math.max(rowHeight, button.height);
      });
      y += rowHeight + facetGap;
    };
    addFacet('SLOT • OR WITHIN THIS FACET', 'slot', [
      { value: 'all', label: filters.slots.length ? 'All slots' : 'All slots ✓' },
      { value: 'helmet', label: 'Helmet' }, { value: 'armour', label: 'Armour' },
      { value: 'gloves', label: 'Gloves' }, { value: 'boots', label: 'Boots' },
    ]);
    addFacet('SET • OR WITHIN THIS FACET', 'set', [
      { value: 'all', label: filters.sets.length ? 'All sets' : 'All sets ✓' },
      ...equipment.setCatalog.map((set) => ({ value: set.setId, label: set.name })),
    ]);
    addFacet('GRADE • OR WITHIN THIS FACET', 'grade', [
      { value: 'all', label: filters.grades.length ? 'All grades' : 'All grades ✓' },
      ...([1, 2, 3, 4] as const).map((grade) => ({ value: String(grade), label: equipmentGradeAccessibleCopy(grade) })),
    ]);
    addFacet('OWNERSHIP • OR WITHIN THIS FACET', 'ownership', [
      { value: 'all', label: filters.ownership.length ? 'All states' : 'All states ✓' },
      { value: 'equipped', label: 'Equipped' }, { value: 'stored', label: 'Stored' }, { value: 'blueprint', label: 'Blueprint' },
    ]);
    addFacet('UPGRADE READINESS • OR WITHIN THIS FACET', 'readiness', [
      { value: 'all', label: filters.readiness.length ? 'All statuses' : 'All statuses ✓' },
      { value: 'ready', label: 'Ready' }, { value: 'insufficient-scrap', label: 'Insufficient Scrap' },
      { value: 'progression-lock', label: 'Progression locked' }, { value: 'maxed', label: 'Maxed' },
    ]);
    return y;
  }

  private decorateCatalogCard(root: Phaser.GameObjects.Container, entry: EquipmentCatalogEntry,
    x: number, y: number, width: number, rowHeight: number, ownerIndex: number): void {
    const selected = entry.kind === 'owned'
      ? entry.id === this.currentSnapshotSelectionId
      : entry.id === this.currentSnapshotBlueprintId;
    const marker = this.own(root, this.environment.scene.add.rectangle(x + 4, y + rowHeight / 2, 4, 24,
      selected ? 0x2dd4bf : entry.state === 'EQUIPPED' ? 0xfbbf24 : 0x526273));
    marker.setScrollFactor(0);
    this.environment.controls.registerScrollObject(marker, ownerIndex);
    const outline = this.own(root, this.environment.scene.add.rectangle(x + width / 2, y + rowHeight / 2,
      Math.max(0, width - 2), Math.max(0, rowHeight - 2), 0x2dd4bf, 0));
    outline.setStrokeStyle(2, selected ? 0x2dd4bf : 0x214756, selected ? 1 : 0.65);
    outline.setScrollFactor(0);
    this.environment.controls.registerScrollObject(outline, ownerIndex);
    const artCenter = this.layout.width < 600 ? 36 : this.layout.width >= 1040 ? 48 : 44;
    this.environment.controls.addCatalogIcon(root, x + width - 24, y + 32 + artCenter, entry.setEmblemArtId, 24, ownerIndex);
    // Keep the semantic card label stable for keyboard/screen-reader routes,
    // but give visual scanning an explicit ordinal badge instead of relying
    // on a tiny chevron glyph alone.
    const gradeBadge = this.loadoutCopy(root, x + 10, y + 8,
      `GRADE ${entry.grade} • ${equipmentGradeCopy(entry.grade).split(' ')[0]}`,
      Math.min(width - 28, 150), '#24cec7', false).setStyle({ fontSize: '11px', fontStyle: '700' });
    this.environment.controls.registerScrollObject(gradeBadge, ownerIndex);
    this.catalogCardVisuals.set(entry.id, { marker, outline, state: entry.state });
  }

  private updateCatalogCardVisuals(snapshot: MainMenuSnapshot): void {
    const selectedId = snapshot.equipment.selectedInstanceId ?? snapshot.equipment.selectedBlueprintId;
    for (const [id, visual] of this.catalogCardVisuals) {
      const selected = id === selectedId;
      visual.marker.setFillStyle?.(selected ? 0x2dd4b6 : visual.state === 'EQUIPPED' ? 0xfbbf24 : 0x526273, selected ? 1 : 1);
      visual.outline.setStrokeStyle?.(2, selected ? 0x2dd4b6 : 0x214756, selected ? 1 : 0.65);
    }
  }

  private get currentSnapshotSelectionId(): string | undefined { return this.renderedSelectionId; }
  private get currentSnapshotBlueprintId(): string | undefined { return this.renderedBlueprintSelectionId; }
  private renderedSelectionId?: string;
  private renderedBlueprintSelectionId?: string;

  /** Compact browse state keeps the selected identity visible without
   * appending a long inspector. Details are an explicit local view. */
  private drawBrowseSummary(root: Phaser.GameObjects.Container, fixedRoot: Phaser.GameObjects.Container,
    prepared: ReturnType<EquipmentSurface['prepareBrowseSummary']>, scrap: number): void {
    const { summary, selected, blueprint, selectedKey, contentWidth, left, horizontalBand, summaryWidth } = prepared;
    const before = new Set([...root.list, ...fixedRoot.list].filter(object => object !== summary));
    if (!selected && !blueprint) {
      // Browse is the decision surface until a candidate is selected. Do not
      // reserve a large empty summary/action band beneath an unselected list.
      summary.destroy();
      // The collection body has finished registering its scroll-owned rows;
      // Back is fixed chrome and must not inherit the body admission gate.
      this.environment.controls.endScrollableRegion();
      this.addOuterBack(fixedRoot, left, contentWidth);
      this.captureTailObjects(root, fixedRoot, before);
      return;
    }
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
    if (blueprint) {
      this.loadoutFooter(fixedRoot, left, contentWidth, this.layout.hitTarget,
        this.fabricationActionLabel(blueprint, scrap), () => undefined, true);
    }
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
    const label = selected ? `${selected.name} • ${equipmentGradeAccessibleCopy(selected.tier)} • ${selected.state}`
      : blueprint ? `${blueprint.name} • ${equipmentGradeAccessibleCopy(1)} • FABRICABLE • ${blueprint.fabricationCost} Scrap` : `Select a ${selectedSlot.label.toLowerCase()} candidate`;
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
      () => {
        this.searchMode = false;
        this.removeSearchInput();
        this.upgradeReview = undefined;
        this.environment.onSnapshot(this.commands.open('loadout'));
      }, 'ui:back', 72);
  }

  private captureTailObjects(root: Phaser.GameObjects.Container, fixedRoot: Phaser.GameObjects.Container,
    retained: ReadonlySet<Phaser.GameObjects.GameObject>): void {
    this.tailObjects = [...new Set([...root.list, ...fixedRoot.list])].filter(object => !retained.has(object));
  }

  private footerTop(): number {
    return this.layout.height - edgeMargin(this.layout.viewport, 'bottom', 16) - this.layout.hitTarget - this.loadoutFooterPadding();
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
  private upgradeAfterItem(
    selected: MainMenuSnapshot['equipment']['presentation']['slots'][number]['candidates'][number],
    upgrade: MainMenuSnapshot['equipment']['owned'][number] | undefined,
  ): MainMenuSnapshot['equipment']['presentation']['slots'][number]['candidates'][number] | undefined {
    return upgrade?.upgradePreview?.after.slots.find((slot) => slot.slot === selected.slot)
      ?.candidates.find((item) => item.instanceId === selected.instanceId);
  }

  private upgradeReviewMatches(
    selected: MainMenuSnapshot['equipment']['presentation']['slots'][number]['candidates'][number],
    upgrade: MainMenuSnapshot['equipment']['owned'][number] | undefined,
  ): boolean {
    const review = this.upgradeReview;
    const matches = !!review && review.instanceId === selected.instanceId
      && review.expectedTier === selected.tier && review.expectedState === selected.state && !!upgrade?.upgradePreview;
    if (review && !matches) this.upgradeReview = undefined;
    return matches;
  }

  private beginUpgradeReview(instanceId: string, expectedTier: number, expectedState: 'EQUIPPED' | 'STORED'): void {
    if (this.upgradeReview?.instanceId === instanceId && this.upgradeReview.expectedTier === expectedTier
      && this.upgradeReview.expectedState === expectedState) return;
    this.upgradeReview = { instanceId, expectedTier, expectedState };
    this.environment.onSnapshot(this.commands.snapshot());
  }

  private cancelUpgradeReview(): void {
    if (!this.upgradeReview) return;
    this.upgradeReview = undefined;
    this.environment.onSnapshot(this.commands.snapshot());
  }

  private confirmUpgradeReview(instanceId: string, expectedTier: number, expectedState: 'EQUIPPED' | 'STORED'): void {
    // Clear the gate before invoking the authoritative command. A repeated
    // pointerup against the old button therefore cannot spend twice while the
    // Scene is repainting the after-state.
    const review = this.upgradeReview;
    if (!review || review.instanceId !== instanceId || review.expectedTier !== expectedTier
      || review.expectedState !== expectedState) return;
    this.upgradeReview = undefined;
    const next = this.commands.upgradeEquipment(instanceId, expectedTier);
    this.environment.onSnapshot(next);
  }

  private upgradeReviewBlocker(
    upgrade: MainMenuSnapshot['equipment']['owned'][number],
    scrap: number,
  ): string {
    const cost = upgrade.upgradePreview?.cost;
    if (upgrade.upgradeLockReason) return upgrade.upgradeLockReason;
    if (cost === undefined) return 'Upgrade unavailable';
    if (scrap < cost) return `Need ${cost - scrap} more Scrap`;
    return 'None';
  }

  private upgradeReviewLines(
    selected: MainMenuSnapshot['equipment']['presentation']['slots'][number]['candidates'][number],
    upgrade: MainMenuSnapshot['equipment']['owned'][number],
    afterItem: MainMenuSnapshot['equipment']['presentation']['slots'][number]['candidates'][number],
    scrap: number,
  ): readonly UpgradeReviewLine[] {
    const cost = upgrade.upgradePreview?.cost;
    const blocker = this.upgradeReviewBlocker(upgrade, scrap);
    const currentEffects = this.loadoutEffectCopy(selected.effects) || 'None';
    const nextEffects = this.loadoutEffectCopy(afterItem.effects) || 'None';
    const consequence = selected.state === 'EQUIPPED'
      ? `EFFECT: ACTIVE Loadout uses ${nextEffects} immediately`
      : `EFFECT: STORED output becomes ${nextEffects}; Loadout unchanged until equip`;
    return [
      { text: `UPGRADE REVIEW • ${selected.name}`, color: '#f78003', heading: true },
      { text: `GRADE: ${equipmentGradeCopy(selected.tier)} → ${equipmentGradeCopy(afterItem.tier)}`, color: '#d6f7ff' },
      { text: `STATS: ${currentEffects} → ${nextEffects}`, color: '#86efac' },
      { text: `COST: ${cost === undefined ? 'Unavailable' : `${cost} Scrap`}`, color: '#d6f7ff', fontSize: 14, lineSpacing: 2 },
      { text: `BALANCE AFTER: ${cost === undefined ? `${scrap} Scrap` : `${scrap - cost} Scrap`}`, color: '#d6f7ff', fontSize: 14, lineSpacing: 2 },
      { text: consequence.replace(/^EFFECT:/, 'ACTIVATION:'), color: selected.state === 'EQUIPPED' ? '#86efac' : '#d6f7ff', fontSize: 14, lineSpacing: 2 },
      { text: `BLOCKER: ${blocker}`, color: blocker === 'None' ? '#86efac' : '#fbbf24' },
    ];
  }

  private upgradeReviewHeight(
    selected: MainMenuSnapshot['equipment']['presentation']['slots'][number]['candidates'][number],
    upgrade: MainMenuSnapshot['equipment']['owned'][number],
    afterItem: MainMenuSnapshot['equipment']['presentation']['slots'][number]['candidates'][number],
    scrap: number,
    width: number,
  ): number {
    const innerWidth = Math.max(1, width - 24);
    return 12 + this.upgradeReviewLines(selected, upgrade, afterItem, scrap)
      .reduce((height, line) => height + this.measureLoadoutCopyHeight(
        line.text, innerWidth, line.fontSize ?? 12, line.lineSpacing ?? 1, line.heading ? '700' : '600',
      ) + 2, 0);
  }

  private renderUpgradeReview(
    root: Phaser.GameObjects.Container,
    left: number,
    top: number,
    width: number,
    selected: MainMenuSnapshot['equipment']['presentation']['slots'][number]['candidates'][number],
    upgrade: MainMenuSnapshot['equipment']['owned'][number],
    afterItem: MainMenuSnapshot['equipment']['presentation']['slots'][number]['candidates'][number],
    scrap: number,
    registerScroll = true,
  ): number {
    const innerWidth = Math.max(1, width - 24);
    const lines = this.upgradeReviewLines(selected, upgrade, afterItem, scrap);
    const heights = lines.map((line) => this.measureLoadoutCopyHeight(
      line.text, innerWidth, line.fontSize ?? 12, line.lineSpacing ?? 1, line.heading ? '700' : '600',
    ));
    const height = 12 + heights.reduce((sum, rowHeight) => sum + rowHeight + 2, 0);
    const panel = this.environment.visuals?.addPanel(this.environment.scene, left + width / 2, top + height / 2, width, height, 'figma-card');
    if (panel) {
      this.own(root, panel);
      if (registerScroll) this.environment.controls.registerScrollObject(panel);
      root.moveTo(panel, 0);
    }
    let y = top + 6;
    lines.forEach((line) => {
      const copy = this.loadoutCopy(root, left + 12, y, line.text, innerWidth, line.color, registerScroll);
      copy.setStyle({ fontSize: `${line.fontSize ?? 12}px`, lineSpacing: line.lineSpacing ?? 1, fontStyle: line.heading ? '700' : '600' });
      y += copy.height + 2;
    });
    return height;
  }

  private detailUpgradeReviewHeight(snapshot: MainMenuSnapshot, scrap: number): number {
    const equipment = snapshot.equipment;
    const selectedSlot = equipment.presentation.slots.find(slot => slot.slot === equipment.selectedSlot);
    const selected = selectedSlot?.candidates.find(item => item.instanceId === equipment.selectedInstanceId);
    const upgrade = selected ? equipment.owned.find(item => item.instanceId === selected.instanceId) : undefined;
    const afterItem = selected ? this.upgradeAfterItem(selected, upgrade) : undefined;
    if (!selected || !upgrade || !afterItem || !this.upgradeReviewMatches(selected, upgrade)) return 0;
    return this.upgradeReviewHeight(selected, upgrade, afterItem, scrap, this.loadoutContentWidth());
  }

  private detailActionLabels(snapshot: MainMenuSnapshot): readonly string[] {
    const equipment = snapshot.equipment;
    const selectedSlot = equipment.presentation.slots.find(slot => slot.slot === equipment.selectedSlot);
    const selected = selectedSlot?.candidates.find(item => item.instanceId === equipment.selectedInstanceId);
    if (!selected) {
      this.upgradeReview = undefined;
      return [];
    }
    const upgrade = equipment.owned.find(item => item.instanceId === selected.instanceId);
    const hasUpgrade = upgrade?.upgradePreview?.cost !== undefined;
    const review = hasUpgrade && this.upgradeReviewMatches(selected, upgrade);
    const labels = [review
      ? `Cancel review to ${selected.state === 'EQUIPPED' ? 'unequip' : 'equip'}`
      : selected.state === 'EQUIPPED' ? `Unequip ${selected.name}` : `Equip ${selected.name}`];
    if (upgrade?.upgradePreview) {
      const cost = upgrade.upgradePreview.cost;
      if (cost !== undefined) {
        if (review) labels.push(`Confirm Upgrade • ${cost} Scrap`, 'Cancel Upgrade');
        else labels.push(upgrade.upgradeLockReason ? `LOCKED • ${upgrade.upgradeLockReason}` : 'Review upgrade');
      }
    }
    return labels;
  }

  private detailActionHeights(snapshot: MainMenuSnapshot): readonly number[] {
    return this.detailActionLabels(snapshot).map((label) => this.measureLoadoutActionHeight(label, this.loadoutContentWidth()));
  }

  private detailReviewInScrollBody(): boolean {
    return this.layout.height <= 480;
  }

  private detailScrollableBottom(snapshot: MainMenuSnapshot, scrap: number): number {
    const actionHeights = this.detailActionHeights(snapshot);
    if (!actionHeights.length) return this.layout.scrollBottom;
    const actionGap = 8;
    const footerTop = snapshot.equipment.selectedBlueprintId === undefined ? this.layout.scrollBottom : this.footerTop();
    const fixedActionsTop = footerTop - actionHeights.reduce((height, actionHeight) => height + actionHeight + actionGap, 0);
    const previewHeight = this.detailDecisionPreviewHeight(snapshot);
    const reviewHeight = this.detailReviewInScrollBody() ? 0 : this.detailUpgradeReviewHeight(snapshot, scrap);
    const reservedBottom = Math.min(this.layout.scrollBottom, fixedActionsTop - actionGap
      - (reviewHeight > 0 ? reviewHeight + actionGap : 0)
      - (previewHeight > 0 ? previewHeight + actionGap : 0));
    // On a short landscape viewport the review reader moves into the body
    // scroll lane, but the action stack remains fixed. Keep the shared mask
    // valid even when wrapped fixed labels consume nearly all of the height.
    return Math.max(this.detailTop + 32, reservedBottom);
  }

  private detailFixedActionTop(snapshot: MainMenuSnapshot): number {
    const footerTop = snapshot.equipment.selectedBlueprintId === undefined ? this.layout.scrollBottom : this.footerTop();
    const actionHeights = this.detailActionHeights(snapshot);
    return footerTop - actionHeights.reduce((height, actionHeight) => height + actionHeight + 8, 0);
  }

  /** Narrow detail keeps the commit actions fixed, but gives the player a
   * short consequence preview immediately above them. The full comparison
   * reader remains scrollable below the selected item; this is only the
   * minimum context needed to avoid a blind Equip/Upgrade choice. */
  private detailDecisionPreviewHeight(snapshot: MainMenuSnapshot): number {
    if (this.layout.width >= 600) return 0;
    const selectedSlot = snapshot.equipment.presentation.slots.find(slot => slot.slot === snapshot.equipment.selectedSlot);
    const selected = selectedSlot?.candidates.find(item => item.instanceId === snapshot.equipment.selectedInstanceId);
    if (!selected) return 0;
    const upgrade = snapshot.equipment.owned.find(item => item.instanceId === selected.instanceId);
    // The upgrade gate replaces the compact Equip preview while it is open;
    // keeping both fixed stacks would push the shared body mask above its
    // top on a 360px phone. Equip itself still retains its full comparison
    // when the review is cancelled or confirmed.
    if (upgrade && this.upgradeReviewMatches(selected, upgrade)) return 0;
    const comparison = selected.state === 'EQUIPPED'
      ? this.commands.equipmentPreview({ kind: 'unequip', slot: selectedSlot!.slot })
      : snapshot.equipment.comparison;
    // The preview is complete enough to make Equip safe: piece change plus
    // every set threshold transition. Reserve the actual Phaser-wrapped row
    // heights so a long multi-effect threshold cannot collide with the fixed
    // action stack on a phone viewport.
    const width = this.loadoutContentWidth();
    return 24 + this.detailDecisionPreviewLines(selected, selectedSlot!, comparison)
      .reduce((height, line) => height + this.measureLoadoutCopyHeight(
        line.text, Math.max(1, width - 24), line.heading ? 14 : 13, 2, line.heading ? '700' : '600',
      ) + 4, 0);
  }

  private detailDecisionPreviewLines(
    selected: MainMenuSnapshot['equipment']['presentation']['slots'][number]['candidates'][number],
    selectedSlot: MainMenuSnapshot['equipment']['presentation']['slots'][number],
    comparison: EquipmentComparison | undefined,
  ): readonly { readonly text: string; readonly color: string; readonly heading?: boolean }[] {
    const consequence = selected.state === 'EQUIPPED'
      ? `Unequip → Empty ${selectedSlot.label}`
      : `Equip → ${comparison?.displaced ? `Replaces ${comparison.displaced.name}` : `Fills ${selectedSlot.label} slot`}`;
    const pieceGain = selected.state === 'EQUIPPED' ? undefined
      : this.signedEffectCopy('+', selected.effects);
    const pieceLoss = selected.state === 'EQUIPPED'
      ? this.signedEffectCopy('−', selected.effects)
      : comparison?.displaced ? this.signedEffectCopy('−', comparison.displaced.effects) : undefined;
    const lines: { text: string; color: string; heading?: boolean }[] = [
      { text: 'FIXED DECISION PREVIEW', color: '#f78003', heading: true },
      { text: `ACTION • ${consequence}`, color: '#d6f7ff' },
    ];
    if (pieceGain) lines.push({ text: `ITEM GAIN • ${pieceGain}`, color: '#86efac' });
    if (pieceLoss) lines.push({ text: `ITEM LOSS • ${pieceLoss}`, color: '#fbbf24' });
    if (comparison?.setChanges.length) {
      for (const change of comparison.setChanges) {
        const set = comparison.after.sets.find((row) => row.setId === change.setId);
        if (!set) continue;
        for (const count of change.lost) {
          const effect = comparison.before.sets.find((row) => row.setId === change.setId)?.thresholds
            .find((threshold) => threshold.count === count)?.effects ?? [];
          lines.push({ text: `SET LOSS • ${set.name} ${count}-piece bonus removed`, color: '#fbbf24' });
          lines.push({ text: this.signedValue('−', this.loadoutEffectCopy(effect) || 'None'), color: '#fbbf24' });
        }
        for (const count of change.gained) {
          const effect = set.thresholds.find((threshold) => threshold.count === count)?.effects ?? [];
          lines.push({ text: `NEW ${set.name.toUpperCase()} BONUS • ${count}-piece`, color: '#86efac' });
          lines.push({ text: this.signedValue('+', this.loadoutEffectCopy(effect) || 'None'), color: '#86efac' });
        }
      }
    } else {
      lines.push({ text: 'SET • Set change → No threshold change', color: '#d6f7ff' });
    }
    return lines;
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
      : `FABRICATE • Creates a stored Standard grade item for ${blueprint.fabricationCost} Scrap.`;
  }

  private equipmentSetChangeCopy(comparison: EquipmentComparison | undefined): string[] {
    return comparison?.setChanges.flatMap((change) => {
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
  }

  private equipmentDecisionCopy(
    selected: MainMenuSnapshot['equipment']['presentation']['slots'][number]['candidates'][number],
    selectedSlot: MainMenuSnapshot['equipment']['presentation']['slots'][number],
    comparison: EquipmentComparison | undefined,
  ): string[] {
    const equipped = selected.state === 'EQUIPPED';
    const setChangeCopy = this.equipmentSetChangeCopy(comparison);
    return [
      `ACTION: ${equipped ? 'UNEQUIP' : 'EQUIP'} ${selected.name}`,
      `${equipped ? 'ITEM GAIN: EFFECT WHILE EQUIPPED' : 'ITEM GAIN: EFFECT AFTER EQUIP'}: ${this.loadoutEffectCopy(selected.effects) || 'None'}`,
      equipped
        ? `ITEM LOSS: AFTER UNEQUIP: Empty ${selectedSlot.label} slot`
        : comparison?.displaced ? `ITEM LOSS: REPLACES: ${comparison.displaced.name} • ${this.loadoutEffectCopy(comparison.displaced.effects) || 'None'}` : `ITEM LOSS: SLOT: ${selectedSlot.label}`,
      `SET CHANGES: ${setChangeCopy.length ? setChangeCopy.join(' • ') : 'None'}`,
    ];
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
    const upgradeReviewActive = !!selected && !!upgrade && this.upgradeReviewMatches(selected, upgrade);
    const upgradeAfter = selected ? this.upgradeAfterItem(selected, upgrade) : undefined;
    const actionGap = 8;
    const actionHeight = this.layout.hitTarget;
    const reviewHeight = upgradeReviewActive && selected && upgrade && upgradeAfter
      ? this.upgradeReviewHeight(selected, upgrade, upgradeAfter, scrap, width) : 0;
    const fullActionCount = 1 + (selected ? 1 : 0) + (hasUpgrade ? upgradeReviewActive ? 2 : 1 : 0);
    const actionTopFor = (count: number): number => this.footerTop() - actionHeight - actionGap
      - Math.max(0, count - 1) * (actionHeight + actionGap)
      - (reviewHeight > 0 ? reviewHeight + actionGap : 0);
    let actionCount = fullActionCount;
    let actionTop = actionTopFor(actionCount);
    const contentBottom = (): number => actionTop - actionGap;
    const contentTop = this.layout.top + 18;
    const title = selected ? `${selected.name} • ${equipmentGradeAccessibleCopy(selected.tier)}` : `${blueprint!.name} • ${equipmentGradeAccessibleCopy(1)}`;
    const subtitle = selected ? `${selectedSlot.label} • ${selected.state}` : `${blueprint!.setName} Set • ${selectedSlot.label}`;
    const heading = this.loadoutCopy(root, left, contentTop, `INSPECTOR\n${title}\n${subtitle}`, width, '#f7f1d5');
    const comparison = selected
      ? selected.state === 'EQUIPPED'
        ? this.commands.equipmentPreview({ kind: 'unequip', slot: selectedSlot.slot })
        : equipment.comparison
      : undefined;
    const selectedEffects = selected ? this.loadoutEffectCopy(selected.effects) || 'None' : undefined;
    const summaryText = selected
      ? [
        ...this.equipmentDecisionCopy(selected, selectedSlot, comparison),
        ...(comparison?.displaced && selected.state !== 'EQUIPPED'
          ? [`REMOVES: ${this.loadoutEffectCopy(comparison.displaced.effects) || 'None'}`] : []),
        upgradeAfter
          ? `UPGRADE: ${equipmentGradeCopy(selected.tier)} → ${equipmentGradeCopy(upgradeAfter.tier)} • ${selectedEffects} → ${this.loadoutEffectCopy(upgradeAfter.effects) || 'None'}${upgrade?.upgradePreview?.cost === undefined ? '' : ` • ${upgrade.upgradePreview.cost} Scrap`}`
          : 'UPGRADE: No preview',
      ].join('\n')
      : [
        `${blueprint!.effects.length} blueprint effect${blueprint!.effects.length === 1 ? '' : 's'}`,
        'EFFECTS', this.loadoutEffectCopy(blueprint!.effects) || 'None',
        'Creates a stored Standard grade item; equip it separately.',
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
    // The selected candidate already owns its artwork in the collection card.
    // Do not add a second tier pair inside the inspector's text lane: at
    // desktop widths those thumbnails overlap the Effect after equip copy.
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
      const loadoutActionLabel = upgradeReviewActive
        ? `Cancel review to ${selected.state === 'EQUIPPED' ? 'unequip' : 'equip'}`
        : selected.state === 'EQUIPPED' ? 'Unequip current item' : 'Equip selected item';
      const action = this.button(fixedRoot, left, nextActionY,
        loadoutActionLabel,
        actionHeight, () => {
          if (upgradeReviewActive) {
            this.cancelUpgradeReview();
            return;
          }
          const next = selected.state === 'EQUIPPED'
            ? this.commands.unequipEquipment(selectedSlot.slot)
            : this.commands.equipEquipment(selected.instanceId);
          this.environment.onSnapshot(next);
        }, 'ui:confirm', width);
      this.rememberLoadoutFocus(action, `equipment-equip:${selected.instanceId}`);
      nextActionY += action.height + actionGap;
      if (upgrade?.upgradePreview) {
        const cost = upgrade.upgradePreview.cost;
        if (upgradeReviewActive && upgradeAfter) {
          this.renderUpgradeReview(fixedRoot, left, nextActionY, width, selected, upgrade, upgradeAfter, scrap, false);
          nextActionY += reviewHeight + actionGap;
          const confirm = this.button(fixedRoot, left, nextActionY, `Confirm Upgrade • ${cost} Scrap`, actionHeight,
            () => this.confirmUpgradeReview(selected.instanceId, selected.tier, selected.state), 'ui:confirm', width);
          this.rememberLoadoutFocus(confirm, `equipment-upgrade-confirm:${selected.instanceId}`);
          if (this.upgradeReviewBlocker(upgrade, scrap) !== 'None') this.environment.controls.disableButton(confirm);
          nextActionY += confirm.height + actionGap;
          const cancel = this.button(fixedRoot, left, nextActionY, 'Cancel Upgrade', actionHeight,
            () => this.cancelUpgradeReview(), 'ui:back', width);
          this.rememberLoadoutFocus(cancel, `equipment-upgrade-cancel:${selected.instanceId}`);
        } else {
          const upgradeAction = this.button(fixedRoot, left, nextActionY,
            upgrade.upgradeLockReason ? 'Upgrade locked' : cost === undefined ? 'Upgrade unavailable' : 'Review upgrade',
            actionHeight, () => this.beginUpgradeReview(selected.instanceId, selected.tier, selected.state), 'ui:confirm', width);
          this.rememberLoadoutFocus(upgradeAction, `equipment-upgrade:${selected.instanceId}`);
          if (upgrade.upgradeLocked || upgrade.upgradeLockReason || cost === undefined || scrap < cost) this.environment.controls.disableButton(upgradeAction);
        }
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
    const selectedUpgrade = selected ? equipment.owned.find((item) => item.instanceId === selected.instanceId) : undefined;
    const selectedUpgradeAfterItem = selected ? this.upgradeAfterItem(selected, selectedUpgrade) : undefined;
    const upgradeReviewActive = !!selected && !!selectedUpgrade && this.upgradeReviewMatches(selected, selectedUpgrade);
    const fixedDetailActions: Array<{ label: string; action: () => void; key: string; disabled?: boolean }> = [];
    const queueFixedDetailAction = (label: string, action: () => void, key: string, disabled = false): void => {
      fixedDetailActions.push({ label, action, key, disabled });
    };
    if (selected) {
      const source = equipment.acquisition.find((row) => row.equipmentId === selected.equipmentId)?.summary ?? '';
      const set = equipment.presentation.sets.find((row) => row.setId === selected.setId)!;
      const equipped = selected.state === 'EQUIPPED';
      const comparison = equipped ? this.commands.equipmentPreview({ kind: 'unequip', slot: selectedSlot.slot }) : equipment.comparison;
      const detailLabel = this.layout.width < 600
        ? `${selected.name} • ${equipmentGradeCopy(selected.tier)}\n${selected.state}`
        : [`${selected.name} • ${equipmentGradeAccessibleCopy(selected.tier)}`, `${selectedSlot.label} • ${set.name} Set • ${selected.state}`, source]
          .filter(Boolean).join('\n');
      const detail = this.equipmentInspection(root, left, y, contentWidth, detailLabel, selected.iconArtId);
      this.rememberLoadoutFocus(detail, `equipment-detail:${selected.instanceId}`);
      y += detail.height + 16;
      if (this.layout.width >= 600 && comparison) {
        put(`ACTION: ${selected.state === 'EQUIPPED' ? `UNEQUIP ${selected.name}` : `EQUIP ${selected.name}`}`, '#f7f1d5');
        if (selected.state === 'EQUIPPED') {
          put(`AFTER UNEQUIP: Empty ${selectedSlot.label} slot`, '#fbbf24');
        } else if (comparison.displaced) {
          put(`REPLACES: ${comparison.displaced.name} • ${this.loadoutEffectCopy(comparison.displaced.effects) || 'None'}`, '#fbbf24');
        }
        y = this.renderEquipmentComparison(root, comparison, left, y, contentWidth,
          new Map(snapshot.gunsmith.families.map((family) => [family.id, family.name])));
      }
      // Desktop keeps the action, selected effect and named Set changes in
      // one decision card. Narrow detail keeps the longer comparison reader.
      if (this.layout.width < 600) {
        y = this.renderScopedLoadoutEffects(root, selected.effects, left, y, contentWidth, 22);
        put(equipped ? `AFTER UNEQUIP: Empty ${selectedSlot.label} slot`
          : comparison?.displaced ? `REPLACES: ${comparison.displaced.name}` : `SLOT: ${selectedSlot.label}`);
        if (!equipped && comparison?.displaced) {
          put(`REMOVES: ${this.loadoutEffectCopy(comparison.displaced.effects) || 'None'}`, '#fbbf24');
        }
        if (comparison) y = this.renderEquipmentComparison(root, comparison, left, y, contentWidth, new Map(snapshot.gunsmith.families.map((family) => [family.id, family.name])));
      }
      queueFixedDetailAction(
        upgradeReviewActive
          ? `Cancel review to ${equipped ? 'unequip' : 'equip'}`
          : equipped ? `Unequip ${selected.name}` : `Equip ${selected.name}`,
        () => {
          if (upgradeReviewActive) {
            this.cancelUpgradeReview();
            return;
          }
          const next = equipped
            ? this.commands.unequipEquipment(selectedSlot.slot)
            : this.commands.equipEquipment(selected.instanceId);
          this.environment.onSnapshot(next);
        },
        `equipment-equip:${selected.instanceId}`,
      );
      const upgrade = selectedUpgrade!;
      if (upgrade.upgradePreview) {
        const cost = upgrade.upgradePreview.cost;
        const afterItem = selectedUpgradeAfterItem!;
        put(`UPGRADE • ${equipmentGradeCopy(selected.tier)} → ${equipmentGradeCopy(selected.tier + 1)} • ${cost} Scrap\nBENEFIT: ${this.loadoutEffectCopy(selected.effects)} → ${this.loadoutEffectCopy(afterItem.effects)}\n${equipped ? 'EQUIPPED: improved values apply immediately after upgrade.' : 'STORED: no active Loadout value changes until equipped.'}`);
        if (cost !== undefined) put(upgrade.upgradeLockReason ? `No Scrap spent • balance remains ${scrap}`
          : scrap < cost ? `Need ${cost - scrap} more Scrap • balance remains ${scrap}`
            : `Balance after: ${scrap - cost} Scrap`);
        const pairWidth = (contentWidth - 16) / 2;
        const extent = Math.min(this.equipmentInspectionExtent(pairWidth), pairWidth - 24);
        const framing = [selected.iconArtId, afterItem.iconArtId];
        this.loadoutMaterial(root, left, y, pairWidth, extent + 56);
        this.loadoutMaterial(root, left + pairWidth + 16, y, pairWidth, extent + 56);
        this.environment.controls.addLoadoutArt(root, left + pairWidth / 2, y + 12 + extent / 2,
          selected.iconArtId, extent, extent, undefined, framing);
        this.environment.controls.addLoadoutArt(root, left + pairWidth + 16 + pairWidth / 2, y + 12 + extent / 2,
          afterItem.iconArtId, extent, extent, undefined, framing);
        this.loadoutCopy(root, left + 12, y + extent + 24, equipmentGradeAccessibleCopy(selected.tier), pairWidth - 24, '#24cec7');
        this.loadoutCopy(root, left + pairWidth + 28, y + extent + 24, equipmentGradeAccessibleCopy(afterItem.tier), pairWidth - 24, '#24cec7');
        y += extent + 72;
        put(`ITEM NOW\n${this.loadoutEffectCopy(selected.effects)}\nITEM AFTER UPGRADE\n${this.loadoutEffectCopy(afterItem.effects)}`);
        if (cost !== undefined) {
          if (upgradeReviewActive) {
            queueFixedDetailAction(`Confirm Upgrade • ${cost} Scrap`,
              () => this.confirmUpgradeReview(selected.instanceId, selected.tier, selected.state),
              `equipment-upgrade-confirm:${selected.instanceId}`,
              this.upgradeReviewBlocker(upgrade, scrap) !== 'None');
            queueFixedDetailAction('Cancel Upgrade',
              () => this.cancelUpgradeReview(),
              `equipment-upgrade-cancel:${selected.instanceId}`);
          } else {
            queueFixedDetailAction(upgrade.upgradeLockReason ? `LOCKED • ${upgrade.upgradeLockReason}` : 'Review upgrade',
              () => this.beginUpgradeReview(selected.instanceId, selected.tier, selected.state),
              `equipment-upgrade:${selected.instanceId}`, upgrade.upgradeLocked || scrap < cost);
          }
        }
      }
      if (upgrade.upgradeLockReason) put(`LOCKED • ${upgrade.upgradeLockReason}`, '#fbbf24');
      else if (selected.tier >= 4) put('Masterwork grade reached • Maximum upgrade');
    } else if (selectedBlueprint) {
      const source = equipment.acquisition.find((row) => row.equipmentId === selectedBlueprint.equipmentId)?.summary ?? '';
      const detailLabel = this.layout.width < 600
        ? `${selectedBlueprint.name} • ${equipmentGradeCopy(1)}\n${selectedBlueprint.setName} Set • FABRICABLE`
        : `${selectedBlueprint.name}\n${selectedBlueprint.setName} Set • ${selectedSlot.label}\n${source}`;
      const detail = this.equipmentInspection(root, left, y, contentWidth, detailLabel, selectedBlueprint.iconArtId);
      this.rememberLoadoutFocus(detail, `equipment-blueprint-detail:${selectedBlueprint.equipmentId}`);
      y += detail.height + 16;
      y = this.renderScopedLoadoutEffects(root, selectedBlueprint.effects, left, y, contentWidth, 22);
      put('Creates a stored Standard grade item. Equip it separately to change your Loadout.');
    }
    if (selectedBlueprint) {
      put(this.fabricationReason(selectedBlueprint, scrap), scrap >= selectedBlueprint.fabricationCost ? '#d6f7ff' : '#fbbf24');
    }
    put('ACTIVE SETS');
    const activeSets = equipment.presentation.sets.filter((set) => set.equippedCount > 0);
    if (!activeSets.length) put('No Set pieces equipped');
    for (const set of activeSets) {
      const copy = this.loadoutCopy(root, left + 38, y, this.setProgressCopy(set), contentWidth - 38);
      this.environment.controls.addCatalogIcon(root, left + 17, y + 20, set.emblemArtId, 30);
      y += copy.height + 10;
    }
    if (equipment.unavailable.length) put('A legacy Equipment item is unavailable in this version.', '#fbbf24');
    if (upgradeReviewActive && selected && selectedUpgrade && selectedUpgradeAfterItem && this.detailReviewInScrollBody()) {
      y += 8;
      this.renderUpgradeReview(root, left, y, contentWidth,
        selected, selectedUpgrade, selectedUpgradeAfterItem, scrap);
    }
    this.environment.controls.endScrollableRegion();
    let fixedActionY = this.detailFixedActionTop(snapshot);
    const decisionPreviewHeight = selected ? this.detailDecisionPreviewHeight(snapshot) : 0;
    if (selected && decisionPreviewHeight > 0) {
      const previewTop = fixedActionY - decisionPreviewHeight - 8;
      const panel = this.environment.visuals?.addPanel(
        this.environment.scene, left + contentWidth / 2, previewTop + decisionPreviewHeight / 2,
        contentWidth, decisionPreviewHeight, 'figma-card', { alpha: 0.96 },
      );
      if (panel) {
        this.own(fixedRoot, panel);
        fixedRoot.moveTo(panel, 0);
      }
      const boundary = this.own(fixedRoot, this.environment.scene.add.rectangle(
        left + contentWidth / 2, previewTop + 2, contentWidth, 2, 0x2dd4bf, 1,
      ));
      fixedRoot.moveTo(boundary, 1);
      let previewY = previewTop + 10;
      const previewLines = this.detailDecisionPreviewLines(selected, selectedSlot,
        selected.state === 'EQUIPPED' ? this.commands.equipmentPreview({ kind: 'unequip', slot: selectedSlot.slot }) : equipment.comparison);
      for (const line of previewLines) {
        const preview = this.loadoutCopy(fixedRoot, left + 12, previewY, line.text, Math.max(1, contentWidth - 24), line.color, false);
        preview.setStyle({ fontSize: `${line.heading ? 14 : 13}px`, lineSpacing: 2, fontStyle: line.heading ? '700' : '600' });
        previewY += preview.height + 4;
      }
    }
    if (upgradeReviewActive && selected && selectedUpgrade && selectedUpgradeAfterItem && !this.detailReviewInScrollBody()) {
      const reviewHeight = this.upgradeReviewHeight(selected, selectedUpgrade, selectedUpgradeAfterItem, scrap, contentWidth);
      this.renderUpgradeReview(fixedRoot, left, fixedActionY - reviewHeight - 8, contentWidth,
        selected, selectedUpgrade, selectedUpgradeAfterItem, scrap, false);
    }
    const actionHeights = this.detailActionHeights(snapshot);
    fixedDetailActions.forEach((detailAction, index) => {
      const action = this.button(fixedRoot, left, fixedActionY, detailAction.label, actionHeights[index] ?? hitTarget, detailAction.action,
        'ui:confirm', contentWidth);
      this.rememberLoadoutFocus(action, detailAction.key);
      if (detailAction.disabled) this.environment.controls.disableButton(action);
      fixedActionY += action.height + 8;
    });
    if (selectedBlueprint) {
      this.loadoutFooter(fixedRoot, left, contentWidth, hitTarget,
        this.fabricationActionLabel(selectedBlueprint, scrap), () => {
          const next = this.commands.fabricateEquipment(selectedBlueprint.equipmentId);
          if (next.equipment.selectedInstanceId) {
            // The successful fabrication removes its blueprint card. Return to
            // the new stored item rather than restoring that missing identity.
            this.browseReturnFocusKey = `equipment-candidate:${next.equipment.selectedInstanceId}`;
            this.browseReturnBookmark = { anchorKey: this.browseReturnFocusKey, intraRowOffset: 0 };
          }
          this.environment.controls.focusNext(next.equipment.selectedInstanceId ? `equipment-detail:${next.equipment.selectedInstanceId}` : `equipment-blueprint-detail:${selectedBlueprint.equipmentId}`, true);
          this.environment.onSnapshot(next);
        }, scrap < selectedBlueprint.fabricationCost);
    }
    if (selected || selectedBlueprint) {
      const localBack = this.button(fixedRoot, left, edgeMargin(this.layout.viewport, 'top') - 12 + 7, 'Back to candidates', hitTarget,
        () => { this.handleBack(); }, 'ui:back', 160);
      this.rememberLoadoutFocus(localBack, selected ? `equipment-detail-back:${selected.instanceId}` : 'equipment-detail-back');
    }
    // Create the bounded fixed Back control last: slots remain the first four
    // semantic focus entries for the shared grid navigator.
    this.addOuterBack(fixedRoot, left, contentWidth);
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
