/** Browser-facing, portrait-first phone guard. This deliberately lives
 * outside Phaser so the message remains usable when a short landscape canvas
 * cannot lay out its authored portrait UI safely. */
export interface OrientationEvidence {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly coarsePrimaryPointer: boolean;
}

export function isPortraitRequiredButUnavailable(evidence: OrientationEvidence): boolean {
  return evidence.coarsePrimaryPointer && evidence.viewportWidth > evidence.viewportHeight;
}

export interface PortraitOrientationGuard {
  readonly isBlocked: () => boolean;
  readonly dispose: () => void;
}

type OrientationListener = (blocked: boolean) => void;
let portraitBlocked = false;
const listeners = new Set<OrientationListener>();
let activeGuard: PortraitOrientationGuard | undefined;

export function isPortraitOrientationBlocked(): boolean {
  return portraitBlocked;
}

export function onPortraitOrientationChange(listener: OrientationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: boolean): void {
  if (next === portraitBlocked) return;
  portraitBlocked = next;
  listeners.forEach((listener) => listener(next));
}

function viewportEvidence(win: Window, coarsePrimaryPointer: boolean): OrientationEvidence {
  const viewport = win.visualViewport;
  return {
    viewportWidth: viewport?.width ?? win.innerWidth,
    viewportHeight: viewport?.height ?? win.innerHeight,
    coarsePrimaryPointer,
  };
}

/** Installs the app-global overlay and mirrors its state to scene-level
 * runtime gates. Calling it again replaces the old DOM node/listeners. */
export function installPortraitOrientationGuard(
  win: Window = window,
  doc: Document = document,
): PortraitOrientationGuard {
  // A game recreation/hot reload replaces the physical overlay. Dispose the
  // old installation first so its window and media-query listeners cannot
  // later publish an invisible blocked state into the new scene tree.
  activeGuard?.dispose();
  doc.getElementById('portrait-orientation-guard')?.remove();
  const pointerQuery = win.matchMedia?.('(pointer: coarse)');
  const overlay = doc.createElement('div');
  overlay.id = 'portrait-orientation-guard';
  overlay.setAttribute('role', 'alert');
  overlay.setAttribute('aria-live', 'assertive');
  overlay.setAttribute('aria-label', 'Rotate device. Meowcenary is designed for portrait play.');
  overlay.innerHTML = '<div><strong>ROTATE DEVICE</strong><span>Meowcenary is designed for portrait play.</span></div>';
  overlay.hidden = true;
  const root = doc.getElementById('game-root');
  root?.parentNode?.insertBefore(overlay, root.nextSibling);
  if (!overlay.parentNode) doc.body.appendChild(overlay);

  let disposed = false;
  const refresh = (): void => {
    if (disposed) return;
    const blocked = isPortraitRequiredButUnavailable(viewportEvidence(win, pointerQuery?.matches ?? false));
    overlay.hidden = !blocked;
    publish(blocked);
  };
  const onQueryChange = (): void => refresh();
  win.addEventListener('resize', refresh);
  win.addEventListener('orientationchange', refresh);
  win.visualViewport?.addEventListener('resize', refresh);
  pointerQuery?.addEventListener?.('change', onQueryChange);
  refresh();

  const guard: PortraitOrientationGuard = {
    isBlocked: () => !disposed && portraitBlocked,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      win.removeEventListener('resize', refresh);
      win.removeEventListener('orientationchange', refresh);
      win.visualViewport?.removeEventListener('resize', refresh);
      pointerQuery?.removeEventListener?.('change', onQueryChange);
      overlay.remove();
      if (activeGuard === guard) {
        activeGuard = undefined;
        publish(false);
      }
    },
  };
  activeGuard = guard;
  return guard;
}
