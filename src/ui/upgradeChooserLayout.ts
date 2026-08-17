export interface UpgradeChooserCardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
  numberWidth: number;
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

export interface UpgradeChooserLayout {
  displayScale: number;
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
): UpgradeChooserLayout {
  const viewport: UiViewport = {
    canvasWidth,
    canvasHeight,
    displayWidth: displayedWidth,
    displayHeight: displayedHeight,
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
  const headerWidth = Math.max(MIN_REGION_SIZE, canvasWidth - physical(12));
  const headingY = physical(compactHeader ? 6 : 12);
  const headingHeight = fonts.heading * (compactHeader ? 2.25 : 1.2);
  const instructionsY = headingY + headingHeight + physical(compactHeader ? 2 : 4);
  const instructionsHeight = fonts.instructions * (compactHeader ? 2.4 : 1.2);
  const cardsRegionTop =
    instructionsY + instructionsHeight + physical(compactHeader ? 5 : 10);
  const bottomMargin = physical(compactHeader ? 4 : 8);
  const cardGap = Math.max(compactHeader ? 0 : 12, physical(compactHeader ? 4 : 6));
  // Epic 18 (D2/D9): 1–5 cards, no legacy three-card clamp.
  const count = Math.max(1, Math.min(5, Math.floor(choiceCount)));
  const availableHeight = Math.max(0, canvasHeight - cardsRegionTop - bottomMargin);
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
  const cardWidth = Math.max(MIN_REGION_SIZE, canvasWidth - sideMargin * 2);
  const desiredPadding = Math.max(
    compactHeader ? 0 : 16,
    physical(compactHeader ? 4 : 8),
  );
  const padding = Math.min(desiredPadding, Math.max(0, (cardWidth - 3) / 2));
  const contentWidth = Math.max(MIN_REGION_SIZE, cardWidth - padding * 2);
  const desiredNumberWidth = Math.max(fonts.name * 1.35, physical(18));
  const desiredRarityReserve = Math.max(compactHeader ? 0 : 72, physical(44));
  const desiredInlineGap = Math.max(compactHeader ? 0 : 8, physical(3));
  const numberWidth = Math.max(
    MIN_REGION_SIZE,
    Math.min(desiredNumberWidth, contentWidth - MIN_REGION_SIZE),
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
  const headerOffset = padding + Math.max(nameHeight, rarityHeight);
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
      x: canvasWidth / 2,
      y,
      width: cardWidth,
      height: cardHeight,
      padding,
      numberWidth,
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

