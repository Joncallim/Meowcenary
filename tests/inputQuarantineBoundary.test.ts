import { describe, expect, it, vi } from 'vitest';
import { MockInputPlugin } from './__mocks__/phaser';
import { InputController } from '../src/systems/input';

describe('Shared modal input quarantine boundary', () => {
  it('quarantines later ability/navigation edges from the same Confirm poll until every source is neutral', () => {
    const input = new MockInputPlugin({ keyboard: true });
    const controller = new InputController({ input } as any);
    const confirm = vi.fn(() => controller.quarantineUntilNeutral());
    const ability = vi.fn(); const nav = vi.fn();
    controller.onAction('confirm', confirm); controller.onAction('ability', ability); controller.onAction('navDown', nav);
    input.keyboard!.keydown('Enter'); input.keyboard!.keydown('q'); input.keyboard!.keydown('down');
    controller.update(16);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(ability).not.toHaveBeenCalled(); expect(nav).not.toHaveBeenCalled();
    controller.update(1000); expect(ability).not.toHaveBeenCalled(); expect(nav).not.toHaveBeenCalled();
    input.keyboard!.keyup('Enter'); input.keyboard!.keyup('q'); input.keyboard!.keyup('down');
    controller.update(16);
    input.keyboard!.keydown('q'); controller.update(16);
    expect(ability).toHaveBeenCalledTimes(1);
    controller.destroy();
  });
});
