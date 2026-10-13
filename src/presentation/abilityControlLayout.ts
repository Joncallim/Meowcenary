import { edgeMargin, physicalToLogical, type UiViewport } from '../ui/layout';

export type AbilityButtonSide = 'left' | 'right';

export const DEFAULT_ABILITY_CONTROL_PREFERENCE: Readonly<{
  abilityButtonSide: AbilityButtonSide;
}> = Object.freeze({ abilityButtonSide: 'left' });

const ABILITY_CARD_WIDTH_PX = 120;
const ABILITY_CARD_HEIGHT_PX = 60;
const ABILITY_CARD_INSET_PX = 12;

/** Strict scalar parser for the additive setting; invalid patches retain a valid current side. */
export function parseAbilityButtonSide(
  valueOrPatch: unknown,
  fallback: AbilityButtonSide = DEFAULT_ABILITY_CONTROL_PREFERENCE.abilityButtonSide,
): AbilityButtonSide {
  let value = valueOrPatch;
  if (valueOrPatch !== null && typeof valueOrPatch === 'object') {
    const descriptor = Object.getOwnPropertyDescriptor(valueOrPatch, 'abilityButtonSide');
    value = descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : undefined;
  }
  if (value === 'left' || value === 'right') return value;
  if (fallback === 'left' || fallback === 'right') return fallback;
  return DEFAULT_ABILITY_CONTROL_PREFERENCE.abilityButtonSide;
}

export interface AbilityControlLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Resolve the existing 120×60 physical-pixel ability card without affecting input ownership. */
export function resolveAbilityControlLayout(
  viewport: UiViewport,
  side: AbilityButtonSide,
): AbilityControlLayout {
  const width = physicalToLogical(ABILITY_CARD_WIDTH_PX, viewport);
  const height = physicalToLogical(ABILITY_CARD_HEIGHT_PX, viewport);
  const inset = physicalToLogical(ABILITY_CARD_INSET_PX, viewport);
  const x = side === 'left'
    ? edgeMargin(viewport, 'left') + inset + width / 2
    : viewport.canvasWidth - edgeMargin(viewport, 'right') - inset - width / 2;
  const y = viewport.canvasHeight - edgeMargin(viewport, 'bottom') - inset - height / 2;
  return Object.freeze({ x, y, width, height });
}
