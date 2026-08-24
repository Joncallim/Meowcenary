export type FullscreenState = 'idle' | 'pending-enter' | 'active' | 'pending-exit';

export interface FullscreenScale {
  readonly isFullscreen: boolean;
  startFullscreen(): void;
  stopFullscreen(): void;
  on(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
}

/** A transient, disposable wrapper around Phaser's optional fullscreen API. */
export class FullscreenController {
  private state: FullscreenState;
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  private readonly settle = (): void => {
    if (this.disposed) return;
    this.setState(this.scale.isFullscreen ? 'active' : 'idle');
  };

  constructor(private readonly scale: FullscreenScale, private readonly events = {
    enter: 'enterfullscreen', leave: 'leavefullscreen', failed: 'fullscreenfailed', unsupported: 'fullscreenunsupported',
  }) {
    this.state = scale.isFullscreen ? 'active' : 'idle';
    scale.on(events.enter, this.settle);
    scale.on(events.leave, this.settle);
    scale.on(events.failed, this.settle);
    scale.on(events.unsupported, this.settle);
  }

  get snapshot(): FullscreenState { return this.state; }
  get available(): boolean { return typeof document !== 'undefined' && document.fullscreenEnabled !== false; }

  request(): boolean {
    if (this.disposed || !this.available || this.state === 'pending-enter' || this.state === 'pending-exit') return false;
    if (this.state === 'active') {
      this.setState('pending-exit');
      this.scale.stopFullscreen();
    } else {
      this.setState('pending-enter');
      this.scale.startFullscreen();
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
    this.scale.off(this.events.enter, this.settle);
    this.scale.off(this.events.leave, this.settle);
    this.scale.off(this.events.failed, this.settle);
    this.scale.off(this.events.unsupported, this.settle);
    this.listeners.clear();
  }

  private setState(next: FullscreenState): void {
    if (this.state === next) return;
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
