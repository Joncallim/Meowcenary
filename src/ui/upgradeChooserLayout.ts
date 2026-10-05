import { safeDisplayScale, type UiViewport } from './layout';
import { ZERO_SAFE_AREA, type SafeAreaInsetsPx } from '../platform/safeArea';

export interface UpgradeChooserCardLayout {
  x: number; y: number; width: number; height: number; padding: number;
  numberWidth: number; iconSize: number; iconX: number; iconY: number;
  nameX: number; nameY: number; nameWidth: number; nameHeight: number;
  rarityReserve: number; rarityHeight: number; rarityX: number; rarityY: number;
  statusX: number; statusY: number; statusWidth: number; statusHeight: number;
  descriptionX: number; descriptionY: number; descriptionWidth: number; descriptionHeight: number;
}
export interface UpgradeChooserLayout {
  displayScale: number; contentCenterX: number; headerWidth: number;
  headingY: number; headingHeight: number; instructionsY: number; instructionsHeight: number;
  fonts: { heading: number; instructions: number; name: number; rarity: number; status: number; description: number };
  lineSpacing: number; cards: readonly UpgradeChooserCardLayout[];
}

/** Physical-pixel hierarchy is shared by every title in an offer. Portrait
 * uses four illustrated rows; wide canvases use bounded columns. Geometry,
 * rather than string length, selects a hierarchy. Gameplay never reads it. */
export function computeUpgradeChooserLayout(
  canvasWidth: number, canvasHeight: number, displayedWidth: number, displayedHeight: number,
  choiceCount: number, layoutInsets: SafeAreaInsetsPx = ZERO_SAFE_AREA,
): UpgradeChooserLayout {
  const displayScale = safeDisplayScale({ canvasWidth, canvasHeight, displayWidth: displayedWidth,
    displayHeight: displayedHeight, layoutInsets } satisfies UiViewport);
  const px = (value: number) => value / displayScale;
  const safeLeft = Math.max(0, layoutInsets.left), safeTop = Math.max(0, layoutInsets.top);
  const safeWidth = Math.max(1, canvasWidth - safeLeft - Math.max(0, layoutInsets.right));
  const safeHeight = Math.max(1, canvasHeight - safeTop - Math.max(0, layoutInsets.bottom));
  const physicalWidth = safeWidth * displayScale, physicalHeight = safeHeight * displayScale;
  const count = Math.max(1, Math.min(5, Number.isFinite(choiceCount) ? Math.floor(choiceCount) : 1));
  const columns = physicalWidth >= 1100 ? count : physicalWidth >= 640 && count > 2 ? 2 : 1;
  const rows = Math.ceil(count / columns);
  const compact = physicalHeight < 700 && rows >= 3 || physicalHeight < 500;
  const fonts = {
    heading: px(compact ? 22 : 28), instructions: px(12),
    name: px(compact ? 18 : columns === 1 ? 20 : 24), rarity: px(11),
    status: px(compact ? 11 : 12), description: px(compact ? 14 : 16),
  };
  const contentCenterX = safeLeft + safeWidth / 2;
  const headerWidth = Math.max(1, safeWidth - px(20));
  const headingY = safeTop + px(10);
  const headingHeight = fonts.heading * 1.3;
  const instructionsY = headingY + headingHeight + px(3);
  const instructionsHeight = fonts.instructions * 1.3;
  const top = instructionsY + instructionsHeight + px(12);
  const gap = px(compact ? 8 : 12);
  const available = Math.max(1, safeTop + safeHeight - top - px(10));
  const lane = Math.min(safeWidth - Math.min(px(24), safeWidth / 4), px(columns === 1 ? 520 : 1280));
  const width = Math.max(1, (lane - gap * (columns - 1)) / columns);
  const height = Math.max(1, Math.min(px(columns === 1 ? 184 : 500), (available - gap * (rows - 1)) / rows));
  const totalHeight = height * rows + gap * (rows - 1);
  const cardsTop = top + Math.max(0, (available - totalHeight) / 2);
  const left = contentCenterX - lane / 2;
  const lineSpacing = px(2);
  const cards = Array.from({ length: count }, (_, index): UpgradeChooserCardLayout => {
    const x = left + (index % columns) * (width + gap) + width / 2;
    const y = cardsTop + Math.floor(index / columns) * (height + gap) + height / 2;
    const cardLeft = x - width / 2, cardTop = y - height / 2;
    const padding = Math.max(0, Math.min(px(compact ? 9 : 14), width / 8, height / 8));
    const innerWidth = Math.max(1, width - padding * 2), innerHeight = Math.max(0, height - padding * 2);
    const vertical = columns > 1 && height * displayScale >= 300;
    const iconSize = Math.max(0, Math.min(px(vertical ? 144 : compact ? 84 : 108),
      innerWidth * (vertical ? 0.8 : 0.3), innerHeight - px(15)));
    const iconX = vertical ? x - iconSize / 2 : cardLeft + padding;
    const iconY = cardTop + padding + (vertical ? px(10) : 0);
    const textLeft = vertical ? cardLeft + padding : cardLeft + padding + iconSize + px(10);
    const textWidth = Math.max(0, cardLeft + width - padding - textLeft);
    const nameY = vertical ? iconY + iconSize + px(18) : cardTop + padding;
    const nameHeight = Math.min(fonts.name * (compact ? 2.35 : 2.5), Math.max(0, cardTop + height - padding - nameY));

    const statusHeight = Math.min(fonts.status * (vertical ? 2.7 : 1.3), innerHeight);
    const statusY = Math.max(cardTop + padding, cardTop + height - padding - statusHeight - (vertical ? px(20) : 0));
    const descriptionY = Math.min(nameY + nameHeight + px(3), statusY);
    const descriptionHeight = Math.max(0, statusY - px(4) - descriptionY);
    const rarityHeight = Math.min(fonts.rarity * 1.3, innerHeight);
    const rarityX = vertical ? cardLeft + padding : cardLeft + padding;
    const rarityY = Math.max(cardTop + padding, cardTop + height - padding - rarityHeight);
    return { x, y, width, height, padding, iconSize, iconX, iconY,
      numberWidth: Math.max(1, iconSize), nameX: textLeft - cardLeft, nameY, nameWidth: textWidth, nameHeight,
      rarityX, rarityY, rarityReserve: Math.max(1, vertical ? innerWidth : iconSize), rarityHeight,
      statusX: textLeft, statusY, statusWidth: textWidth, statusHeight,
      descriptionX: textLeft, descriptionY, descriptionWidth: textWidth, descriptionHeight };
  });
  return { displayScale, contentCenterX, headerWidth, headingY, headingHeight, instructionsY,
    instructionsHeight, fonts, lineSpacing, cards };
}
