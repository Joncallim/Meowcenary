export interface UpgradeChooserCardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
  nameWidth: number;
  rarityReserve: number;
  descriptionY: number;
  descriptionHeight: number;
}

export interface UpgradeChooserLayout {
  displayScale: number;
  headingY: number;
  instructionsY: number;
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
  const headingY = physical(12);
  const instructionsY = headingY + fonts.heading * 1.2 + physical(4);
  const cardsRegionTop = instructionsY + fonts.instructions * 1.2 + physical(10);
  const bottomMargin = physical(8);
  const cardGap = Math.max(12, physical(6));
  const count = Math.max(1, Math.min(3, Math.floor(choiceCount)));
  const availableHeight = Math.max(0, canvasHeight - cardsRegionTop - bottomMargin);
  const maxCardHeight = Math.max(168, physical(150));
  const cardHeight = Math.min(
    maxCardHeight,
    (availableHeight - cardGap * (count - 1)) / count,
  );
  const totalCardHeight = cardHeight * count + cardGap * (count - 1);
  const cardsTop = cardsRegionTop + Math.max(0, (availableHeight - totalCardHeight) / 2);
  const sideMargin = Math.max(10, physical(8));
  const cardWidth = canvasWidth - sideMargin * 2;
  const padding = Math.max(16, physical(8));
  const rarityReserve = Math.max(72, physical(54));
  const nameRarityGap = Math.max(8, physical(6));
  const nameWidth = Math.max(
    physical(48),
    cardWidth - padding * 2 - rarityReserve - nameRarityGap,
  );
  const descriptionOffset = padding + Math.max(fonts.name * 2.35, physical(38));
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
      nameWidth,
      rarityReserve,
      descriptionY,
      descriptionHeight: Math.max(0, cardTop + cardHeight - padding - descriptionY),
    };
  });

  return {
    displayScale,
    headingY,
    instructionsY,
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
