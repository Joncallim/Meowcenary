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
  descriptionY: number;
  descriptionHeight: number;
}

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
  description: 12,
} as const;

const BASE_LOGICAL_FONT = {
  heading: 24,
  instructions: 13,
  name: 18,
  rarity: 12,
  description: 14,
} as const;

export function computeUpgradeChooserLayout(
  canvasWidth: number,
  canvasHeight: number,
  displayedWidth: number,
  displayedHeight: number,
  choiceCount: number,
): UpgradeChooserLayout {
  const displayScale = safeDisplayScale(
    canvasWidth,
    canvasHeight,
    displayedWidth,
    displayedHeight,
  );
  const physical = (pixels: number): number => pixels / displayScale;
  const font = (base: number, minimumPhysical: number): number =>
    Math.max(base, physical(minimumPhysical));
  const fonts = {
    heading: font(BASE_LOGICAL_FONT.heading, MIN_PHYSICAL_FONT.heading),
    instructions: font(BASE_LOGICAL_FONT.instructions, MIN_PHYSICAL_FONT.instructions),
    name: font(BASE_LOGICAL_FONT.name, MIN_PHYSICAL_FONT.name),
    rarity: font(BASE_LOGICAL_FONT.rarity, MIN_PHYSICAL_FONT.rarity),
    description: font(BASE_LOGICAL_FONT.description, MIN_PHYSICAL_FONT.description),
  };
  const compactHeader = canvasWidth * displayScale < 220;
  const headerWidth = Math.max(0, canvasWidth - physical(12));
  const headingY = physical(compactHeader ? 6 : 12);
  const headingHeight = fonts.heading * (compactHeader ? 2.25 : 1.2);
  const instructionsY = headingY + headingHeight + physical(compactHeader ? 2 : 4);
  const instructionsHeight = fonts.instructions * (compactHeader ? 2.4 : 1.2);
  const cardsRegionTop =
    instructionsY + instructionsHeight + physical(compactHeader ? 5 : 10);
  const bottomMargin = physical(compactHeader ? 4 : 8);
  const cardGap = Math.max(compactHeader ? 0 : 12, physical(compactHeader ? 4 : 6));
  const count = Math.max(1, Math.min(3, Math.floor(choiceCount)));
  const availableHeight = Math.max(0, canvasHeight - cardsRegionTop - bottomMargin);
  const maxCardHeight = Math.max(168, physical(150));
  const cardHeight = Math.min(
    maxCardHeight,
    (availableHeight - cardGap * (count - 1)) / count,
  );
  const totalCardHeight = cardHeight * count + cardGap * (count - 1);
  const cardsTop = cardsRegionTop + Math.max(0, (availableHeight - totalCardHeight) / 2);
  const sideMargin = Math.max(compactHeader ? 0 : 10, physical(compactHeader ? 4 : 8));
  const cardWidth = canvasWidth - sideMargin * 2;
  const padding = Math.max(compactHeader ? 0 : 16, physical(compactHeader ? 4 : 8));
  const numberWidth = Math.max(fonts.name * 1.35, physical(18));
  const rarityReserve = Math.max(compactHeader ? 0 : 72, physical(44));
  const inlineGap = Math.max(compactHeader ? 0 : 8, physical(3));
  const nameX = padding + numberWidth + inlineGap;
  const nameWidth = Math.max(
    0,
    cardWidth - padding * 2 - numberWidth - rarityReserve - inlineGap * 2,
  );
  const nameHeight = Math.max(fonts.name * 1.15, physical(16));
  const rarityHeight = Math.max(fonts.rarity * 1.15, physical(11));
  const descriptionOffset = padding + Math.max(nameHeight, rarityHeight) + physical(2);
  const lineSpacing = Math.max(4, physical(2));

  const cards = Array.from({ length: count }, (_, index) => {
    const y = cardsTop + cardHeight / 2 + index * (cardHeight + cardGap);
    const cardTop = y - cardHeight / 2;
    const descriptionY = cardTop + descriptionOffset;
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
      descriptionY,
      descriptionHeight: Math.max(0, cardTop + cardHeight - padding - descriptionY),
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

function safeDisplayScale(
  canvasWidth: number,
  canvasHeight: number,
  displayedWidth: number,
  displayedHeight: number,
): number {
  const widthScale = displayedWidth / canvasWidth;
  const heightScale = displayedHeight / canvasHeight;
  const scale = Math.min(widthScale, heightScale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
