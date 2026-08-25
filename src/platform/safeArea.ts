export interface SafeAreaInsetsPx {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const ZERO_SAFE_AREA: SafeAreaInsetsPx = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

type StyleReader = (property: string) => string | null | undefined;

/** Read the browser's safe-area CSS variables without embedding device data. */
export function readSafeAreaInsets(styleReader?: StyleReader): SafeAreaInsetsPx {
  const reader = styleReader ?? defaultStyleReader();
  if (!reader) return ZERO_SAFE_AREA;

  return Object.freeze({
    top: parseCssPx(reader('--safe-top')),
    right: parseCssPx(reader('--safe-right')),
    bottom: parseCssPx(reader('--safe-bottom')),
    left: parseCssPx(reader('--safe-left')),
  });
}

function defaultStyleReader(): StyleReader | undefined {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return undefined;
  const style = getComputedStyle(document.documentElement);
  return (property) => style.getPropertyValue(property);
}

function parseCssPx(value: string | null | undefined): number {
  if (typeof value !== 'string') return 0;
  const match = /^\s*([+]?(?:\d+\.?\d*|\.\d+))px\s*$/i.exec(value);
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
