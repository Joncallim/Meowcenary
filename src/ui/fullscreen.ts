export type FullscreenState = 'idle' | 'pending-enter' | 'active' | 'pending-exit';

export interface FullscreenScale {
  readonly isFullscreen: boolean;
  startFullscreen(): unknown;
  stopFullscreen(): unknown;
  on(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
}

// Fullscreen requests outlive a Phaser scene restart. Keep the transient
// token on the ScaleManager rather than on a scene-owned controller.
const sharedStates = new WeakMap<FullscreenScale, FullscreenState>();

function isIosUserAgent(): boolean {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const maxTouchPoints = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0
    : 0;
  return /iPad|iPhone|iPod/.test(userAgent)
    || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** A transient, disposable wrapper around Phaser's optional fullscreen API. */
export class FullscreenController {
  private state: FullscreenState;
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  private timeout?: ReturnType<typeof setTimeout>;
  private readonly settle = (): void => {
    if (this.disposed) return;
    const doc = typeof document !== 'undefined' ? document : undefined;
    const domState = doc?.fullscreenElement === undefined
      ? this.scale.isFullscreen
      : Boolean(doc.fullscreenElement);
    this.setState(domState ? 'active' : 'idle');
  };
  private readonly settleFailure = (): void => {
    if (this.disposed) return;
    this.setState('idle');
  };

  constructor(private readonly scale: FullscreenScale, private readonly events = {
    enter: 'enterfullscreen', leave: 'leavefullscreen', failed: 'fullscreenfailed', unsupported: 'fullscreenunsupported',
  }) {
    this.state = sharedStates.get(scale) ?? (scale.isFullscreen ? 'active' : 'idle');
    sharedStates.set(scale, this.state);
    if (this.state === 'pending-enter' || this.state === 'pending-exit') this.armTimeout();
    scale.on(events.enter, this.settle);
    scale.on(events.leave, this.settle);
    scale.on(events.failed, this.settle);
    scale.on(events.unsupported, this.settle);
    if (typeof document !== 'undefined') {
      document.addEventListener?.('fullscreenchange', this.settle);
      document.addEventListener?.('fullscreenerror', this.settleFailure);
    }
  }

  get snapshot(): FullscreenState { return this.state; }
  get available(): boolean {
    return !isIosUserAgent()
      && typeof document !== 'undefined'
      && document.fullscreenEnabled === true;
  }

  request(): boolean {
    if (this.disposed || !this.available || this.state === 'pending-enter' || this.state === 'pending-exit') return false;
    if (this.state === 'active') {
      this.setState('pending-exit');
      this.invoke(this.scale.stopFullscreen);
    } else {
      this.setState('pending-enter');
      this.invoke(this.scale.startFullscreen);
    }
    return true;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timeout !== undefined) clearTimeout(this.timeout);
    this.scale.off(this.events.enter, this.settle);
    this.scale.off(this.events.leave, this.settle);
    this.scale.off(this.events.failed, this.settle);
    this.scale.off(this.events.unsupported, this.settle);
    if (typeof document !== 'undefined') {
      document.removeEventListener?.('fullscreenchange', this.settle);
      document.removeEventListener?.('fullscreenerror', this.settleFailure);
    }
    this.listeners.clear();
  }

  private setState(next: FullscreenState): void {
    if (this.state === next) return;
    this.state = next;
    sharedStates.set(this.scale, next);
    if (this.timeout !== undefined) clearTimeout(this.timeout);
    this.timeout = next === 'pending-enter' || next === 'pending-exit'
      ? setTimeout(this.settle, 500)
      : undefined;
    this.listeners.forEach((listener) => listener());
  }

  private armTimeout(): void {
    if (this.timeout !== undefined) clearTimeout(this.timeout);
    this.timeout = setTimeout(this.settle, 500);
  }

  private invoke(method: () => unknown): void {
    try {
      const result = method.call(this.scale);
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(result).catch(this.settleFailure);
      }
    } catch {
      this.settleFailure();
    }
  }
}
