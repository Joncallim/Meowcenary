import type { EventBus, GameEventMap } from '../engine/eventBus';
import type { RunState } from './runState';
import type { CharacterPassiveEvent } from '../systems/types';

export interface PassiveHandlerContext {
  readonly run: RunState;
  readonly sourceId: string;
  readonly bus: EventBus;
}

export type PassiveHandler<K extends CharacterPassiveEvent> = (
  ctx: PassiveHandlerContext,
  payload: GameEventMap[K],
) => void;

export interface PassiveHandlerRegistry {
  handlerById(handlerId: string): PassiveHandler<CharacterPassiveEvent> | undefined;
}

export function createPassiveHandlerRegistry(
  handlers: Readonly<Record<string, PassiveHandler<CharacterPassiveEvent>>>,
): PassiveHandlerRegistry {
  return { handlerById: (handlerId) => handlers[handlerId] };
}

export const DEFAULT_PASSIVE_HANDLERS: Readonly<
  Record<string, PassiveHandler<CharacterPassiveEvent>>
> = Object.freeze({});
