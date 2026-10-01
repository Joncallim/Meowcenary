import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { WorldUiReadability, WORLD_UI_OVERLAP_ALPHA } from '../src/ui/worldUiReadability';

function paint(x: number, y: number, width: number, height: number, alpha = 1) {
  return {
    x, y, width, height, alpha, visible: true, boundsCalls: 0,
    getBounds(output = { x: 0, y: 0, width: 0, height: 0 } as Phaser.Geom.Rectangle) {
      this.boundsCalls += 1;
      output.x = this.x; output.y = this.y; output.width = this.width; output.height = this.height;
      return output;
    },
    setAlpha(next: number) { this.alpha = next; },
  };
}

describe('world UI paint readability', () => {
  it('fades only intersecting actual paint and restores authored alpha after exit', () => {
    const helper = new WorldUiReadability();
    const plate = paint(0, 0, 390, 110, 0.48);
    const meter = paint(12, 35, 300, 18);
    const number = paint(30, 35, 90, 18);
    helper.register(plate); helper.register(meter); helper.register(number);
    const actor = { x: 210, y: 25, width: 62, height: 62 };
    helper.update(actor, { scrollX: 0, scrollY: 0 });
    expect(plate.alpha).toBe(0.48 * WORLD_UI_OVERLAP_ALPHA);
    expect(meter.alpha).toBe(WORLD_UI_OVERLAP_ALPHA);
    expect(number.alpha).toBe(1);
    helper.update(actor, { scrollX: 0, scrollY: 0 });
    expect(plate.alpha).toBe(0.48 * WORLD_UI_OVERLAP_ALPHA);
    helper.update({ ...actor, y: 150 }, { scrollX: 0, scrollY: 0 });
    expect([plate.alpha, meter.alpha, number.alpha]).toEqual([0.48, 1, 1]);
  });

  it('uses camera scroll and cached parent-origin bounds without refreshing on frame reads', () => {
    const helper = new WorldUiReadability();
    const node = paint(180, 40, 35, 25);
    helper.register(node);
    helper.update({ x: 300, y: 240, width: 30, height: 30 }, { scrollX: 120, scrollY: 200 });
    expect(node.alpha).toBe(WORLD_UI_OVERLAP_ALPHA);
    expect(node.boundsCalls).toBe(1);
    node.x = 250;
    helper.refreshBounds(node);
    helper.update({ x: 300, y: 240, width: 30, height: 30 }, { scrollX: 120, scrollY: 200 });
    expect(node.alpha).toBe(1);
    expect(node.boundsCalls).toBe(2);
  });

  it('restores initial authored alpha on clear and never revisits released paint', () => {
    const helper = new WorldUiReadability();
    const node = paint(20, 20, 90, 20, 0.76);
    helper.register(node);
    helper.update({ x: 25, y: 25, width: 10, height: 10 }, { scrollX: 0, scrollY: 0 });
    expect(node.alpha).toBe(0.76 * WORLD_UI_OVERLAP_ALPHA);
    helper.update(undefined, { scrollX: 0, scrollY: 0 });
    expect(node.alpha).toBe(0.76);
    helper.update({ x: 25, y: 25, width: 10, height: 10 }, { scrollX: 0, scrollY: 0 });
    helper.clear();
    expect(node.alpha).toBe(0.76);
    helper.update({ x: 25, y: 25, width: 10, height: 10 }, { scrollX: 0, scrollY: 0 });
    expect(node.alpha).toBe(0.76);
    const reads = node.boundsCalls;
    node.alpha = 0.5; // The released node may belong to another owner now.
    helper.refreshBounds();
    helper.update(undefined, { scrollX: 0, scrollY: 0 });
    helper.clear();
    expect(node.alpha).toBe(0.5);
    expect(node.boundsCalls).toBe(reads);
  });

  it('restores invisible paint and invalid/empty actor bounds without altering geometry', () => {
    const helper = new WorldUiReadability();
    const node = paint(0, 0, 44, 44);
    helper.register(node);
    const actor = { x: 1, y: 1, width: 10, height: 10 };
    helper.update(actor, { scrollX: 0, scrollY: 0 });
    node.visible = false;
    helper.update(actor, { scrollX: 0, scrollY: 0 });
    expect(node.alpha).toBe(1);
    node.visible = true;
    helper.update({ ...actor, width: 0 }, { scrollX: 0, scrollY: 0 });
    helper.update({ ...actor, x: NaN }, { scrollX: 0, scrollY: 0 });
    expect(node.alpha).toBe(1);
    expect([node.x, node.y, node.width, node.height]).toEqual([0, 0, 44, 44]);
  });
});
