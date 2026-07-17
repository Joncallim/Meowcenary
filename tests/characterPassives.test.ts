import { describe, expect, it } from 'vitest';
import {
  createPassiveHandlerRegistry,
  DEFAULT_PASSIVE_HANDLERS,
} from '../src/gameplay/characterPassives';
import type { CharacterPassiveEvent } from '../src/systems/types';
import type { PassiveHandler } from '../src/gameplay/characterPassives';

describe('characterPassives', () => {
  describe('createPassiveHandlerRegistry', () => {
    it('returns a registry that resolves known handler ids', () => {
      const handler: PassiveHandler<CharacterPassiveEvent> = () => {};
      const registry = createPassiveHandlerRegistry({ test: handler });
      expect(registry.handlerById('test')).toBe(handler);
    });

    it('returns undefined for unknown handler ids', () => {
      const registry = createPassiveHandlerRegistry({});
      expect(registry.handlerById('missing')).toBeUndefined();
    });

    it('DEFAULT_PASSIVE_HANDLERS is empty and frozen', () => {
      expect(Object.keys(DEFAULT_PASSIVE_HANDLERS)).toHaveLength(0);
      expect(Object.isFrozen(DEFAULT_PASSIVE_HANDLERS)).toBe(true);
    });
  });
});
