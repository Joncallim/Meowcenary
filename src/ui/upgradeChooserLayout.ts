export interface UpgradeChooserCardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
  /** Leading-column width: the larger of the number badge and the icon box. */
  numberWidth: number;
  /** Epic 18 (D8): square icon box, clamped to the card's affordable space. */
  iconSize: number;
  nameX: number;
  nameWidth: number;
  nameHeight: number;
  rarityReserve: number;
  rarityHeight: number;
  /** Epic 18 (D9 content priority 2): "current/max -> next/max" stack row. */
  statusY: number;
  statusHeight: number;
  descriptionY: number;
  descriptionHeight: number;
}

import { safeDisplayScale, type UiViewport } from './layout';
import { ZERO_SAFE_AREA, type SafeAreaInsetsPx } from '../platform/safeArea';

export interface UpgradeChooserLayout {
  displayScale: number;
  contentCenterX: number;
  headerWidth: number;
  headingY: number;
  headingHeight: number;
  instructionsY: number;
  instructionsHeight: number;
  fonts: {
    heading: number;
    instructions: number;
    name: number;
    rarity: number;
    status: number;
    description: number;
  };
  lineSpacing: number;
  cards: readonly UpgradeChooserCardLayout[];
}

const MIN_PHYSICAL_FONT = {
  heading: 18,
  instructions: 11,
  name: 14,
  rarity: 10,
  status: 10,
  description: 12,
} as const;

const BASE_LOGICAL_FONT = {
  heading: 24,
  instructions: 13,
  name: 18,
  rarity: 12,
  status: 12,
  description: 14,
} as const;

const MIN_REGION_SIZE = 1;

export function computeUpgradeChooserLayout(
  canvasWidth: number,
  canvasHeight: number,
  displayedWidth: number,
  displayedHeight: number,
  choiceCount: number,
  layoutInsets: SafeAreaInsetsPx = ZERO_SAFE_AREA,
): UpgradeChooserLayout {
  const viewport: UiViewport = {
    canvasWidth,
    canvasHeight,
    displayWidth: displayedWidth,
    displayHeight: displayedHeight,
    layoutInsets: ZERO_SAFE_AREA,
  };
  const displayScale = safeDisplayScale(viewport);
  const physical = (pixels: number): number => pixels / displayScale;
  const font = (base: number, minimumPhysical: number): number =>
    Math.max(base, physical(minimumPhysical));
  const fonts = {
    heading: font(BASE_LOGICAL_FONT.heading, MIN_PHYSICAL_FONT.heading),
    instructions: font(BASE_LOGICAL_FONT.instructions, MIN_PHYSICAL_FONT.instructions),
    name: font(BASE_LOGICAL_FONT.name, MIN_PHYSICAL_FONT.name),
    rarity: font(BASE_LOGICAL_FONT.rarity, MIN_PHYSICAL_FONT.rarity),
    status: font(BASE_LOGICAL_FONT.status, MIN_PHYSICAL_FONT.status),
    description: font(BASE_LOGICAL_FONT.description, MIN_PHYSICAL_FONT.description),
  };
  const compactHeader = canvasWidth * displayScale < 220;
  const safeLeft = Math.max(0, layoutInsets.left);
  const safeRight = Math.max(0, layoutInsets.right);
  const safeTop = Math.max(0, layoutInsets.top);
  const safeBottom = Math.max(0, layoutInsets.bottom);
  const safeWidth = Math.max(MIN_REGION_SIZE, canvasWidth - safeLeft - safeRight);
  const contentCenterX = safeLeft + safeWidth / 2;
  const headerWidth = Math.max(MIN_REGION_SIZE, safeWidth - physical(12));
  const headingY = safeTop + physical(compactHeader ? 6 : 12);
  const headingHeight = fonts.heading * (compactHeader ? 2.25 : 1.6);
  const instructionsY = headingY + headingHeight + physical(compactHeader ? 2 : 4);
  const instructionsHeight = fonts.instructions * (compactHeader ? 2.4 : 1.4);
  const cardsRegionTop =
    // The game scene renders through the 1.25x camera viewport; leaving only
    // a few logical pixels here lets Phaser font ascenders touch the first
    // card on a real portrait phone despite nominal bounds being separate.
    instructionsY + instructionsHeight + physical(compactHeader ? 12 : 28);
  const bottomMargin = physical(compactHeader ? 4 : 8);
  const cardGap = Math.max(compactHeader ? 0 : 12, physical(compactHeader ? 4 : 6));
  // Epic 18 (D2/D9): 1–5 cards, no legacy three-card clamp.
  const count = Math.max(1, Math.min(5, Math.floor(choiceCount)));
  const availableHeight = Math.max(0, canvasHeight - cardsRegionTop - bottomMargin - safeBottom);
  const maxCardHeight = Math.max(168, physical(150));
  const cardHeight = Math.max(
    MIN_REGION_SIZE,
    Math.min(
      maxCardHeight,
      (availableHeight - cardGap * (count - 1)) / count,
    ),
  );
  const totalCardHeight = cardHeight * count + cardGap * (count - 1);
  const cardsTop = cardsRegionTop + Math.max(0, (availableHeight - totalCardHeight) / 2);
  const sideMargin = Math.max(compactHeader ? 0 : 10, physical(compactHeader ? 4 : 8));
  const cardWidth = Math.max(MIN_REGION_SIZE, safeWidth - sideMargin * 2);
  const desiredPadding = Math.max(
    compactHeader ? 0 : 16,
    physical(compactHeader ? 4 : 8),
  );
  const padding = Math.min(desiredPadding, Math.max(0, (cardWidth - 3) / 2));
  const contentWidth = Math.max(MIN_REGION_SIZE, cardWidth - padding * 2);
  const desiredNumberWidth = Math.max(fonts.name * 1.35, physical(18));
  // Reserve enough real card width for the longest production cue (for
  // example, "legendary • mobility") before measured font fitting begins.
  // Compact layouts may still hide the secondary cue when their physical
  // minimum font cannot fit, but portrait keeps the cue visible and whole.
  const desiredRarityReserve = Math.max(compactHeader ? 0 : 120, physical(44));
  const desiredInlineGap = Math.max(compactHeader ? 0 : 8, physical(3));
  // Epic 18 (D8/D9 priority 1): the leading column holds the card icon, whose
  // binding declares a 36px logical display. Sizing that column from the old
  // "1." text badge alone would shrink the icon to roughly half its declared
  // size; it is instead the larger of the text badge and an icon box clamped
  // to what the card can actually afford in both axes.
  const desiredIconSize = Math.max(36, physical(28));
  const iconSize = Math.max(
    0,
    Math.min(
      desiredIconSize,
      contentWidth / 3,
      Math.max(0, cardHeight - padding * 2),
    ),
  );
  const numberWidth = Math.max(
    MIN_REGION_SIZE,
    Math.min(Math.max(desiredNumberWidth, iconSize), contentWidth - MIN_REGION_SIZE),
  );
  const remainingAfterNumber = Math.max(
    MIN_REGION_SIZE,
    contentWidth - numberWidth,
  );
  const inlineGap = Math.min(desiredInlineGap, remainingAfterNumber / 3);
  const rarityReserve = Math.max(
    MIN_REGION_SIZE,
    Math.min(
      desiredRarityReserve,
      remainingAfterNumber - inlineGap,
    ),
  );
  const nameX = padding + numberWidth + inlineGap;
  const nameWidth = Math.max(
    0,
    contentWidth - numberWidth - rarityReserve - inlineGap * 2,
  );
  const nameHeight = Math.max(fonts.name * 1.15, physical(16));
  const rarityHeight = Math.max(fonts.rarity * 1.15, physical(11));
  const desiredStatusHeight = Math.max(fonts.status * 1.15, physical(11));
  // The header row must clear the tallest of its three occupants so the icon
  // never overlaps the stack-state row below it.
  const headerOffset = padding + Math.max(nameHeight, rarityHeight, iconSize);
  const statusOffset = headerOffset + physical(2);
  const lineSpacing = Math.max(4, physical(2));

  const cards = Array.from({ length: count }, (_, index) => {
    const y = cardsTop + cardHeight / 2 + index * (cardHeight + cardGap);
    const cardTop = y - cardHeight / 2;
    const contentBottom = cardTop + cardHeight - padding;
    const statusY = cardTop + statusOffset;
    // The status row is clamped to the space actually left inside the card
    // (4/5-card modes make cards much shorter), so a stack-state row can
    // never escape its card. The view hides it when the clamped height
    // cannot fit a line; D9's content priority still puts stack state above
    // the description, which only receives whatever space remains.
    const statusHeight = Math.max(0, Math.min(desiredStatusHeight, contentBottom - statusY));
    const descriptionY = statusY + statusHeight + physical(2);
    return {
      x: contentCenterX,
      y,
      width: cardWidth,
      height: cardHeight,
      padding,
      numberWidth,
      iconSize,
      nameX,
      nameWidth,
      nameHeight,
      rarityReserve,
      rarityHeight,
      statusY,
      statusHeight,
      descriptionY,
      descriptionHeight: Math.max(0, contentBottom - descriptionY),
    };
  });

  return {
    displayScale,
    contentCenterX,
    headerWidth,
    headingY,
    headingHeight,
    instructionsY,
    instructionsHeight,
    fonts,
    lineSpacing,
    cards,
  };
}
