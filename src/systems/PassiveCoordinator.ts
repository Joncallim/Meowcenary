import type { System } from '../engine/system';
import type { EventBus } from '../engine/eventBus';
import type { RunState } from '../gameplay/runState';
import type { CharacterDefinition } from '../systems/types';
import type { PassiveHandlerRegistry } from '../gameplay/characterPassives';

const installedRuns = new WeakSet<RunState>();

export interface PassiveCoordinatorOptions {
  readonly runState: RunState;
  readonly bus: EventBus;
  readonly character: Readonly<CharacterDefinition>;
  readonly handlers: PassiveHandlerRegistry;
}

export class PassiveCoordinator implements System {
  private readonly runState: RunState;
  private readonly bus: EventBus;
  private readonly unsubscribers: Array<() => void> = [];
  private destroyed = false;
  private dispatching = false;

  constructor(options: PassiveCoordinatorOptions) {
    this.runState = options.runState;
    this.bus = options.bus;

    if (installedRuns.has(options.runState)) {
      return;
    }

    installedRuns.add(options.runState);

    for (const passive of options.character.passives) {
      if (passive.kind !== 'reactive') continue;

      const handler = options.handlers.handlerById(passive.handlerId);
      if (!handler) {
        throw new Error(`Unknown passive handler "${passive.handlerId}"`);
      }

      const sourceId = `character:${options.character.id}:${passive.id}`;

      const unsubscribe = options.bus.on(passive.event, (payload: unknown) => {
        if (this.dispatching) {
          console.error(
            `PassiveCoordinator: reentrant dispatch blocked for "${sourceId}"`,
          );
          return;
        }

        if (this.destroyed || this.runState.status !== 'active') return;

        this.dispatching = true;
        try {
          handler(
            { run: this.runState, sourceId, bus: this.bus },
            payload as never,
          );
        } finally {
          this.dispatching = false;
        }
      });

      this.unsubscribers.push(unsubscribe);
    }
  }

  update(_dtMs: number): void {}

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
  }
}
