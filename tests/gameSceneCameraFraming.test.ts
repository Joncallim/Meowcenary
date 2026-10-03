import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { resolveArenaCameraFraming } from '../src/gameplay/responsiveArenaPresentation';
import { GameScene } from '../src/scenes/GameScene';
import { GAMEPLAY_ZOOM } from '../src/ui/layout';

function framingScene(arena = { width: 768, height: 1344 }, canvas = { width: 390, height: 844 }) {
  const scene = new GameScene() as any;
  const calls: string[] = [];
  const camera = {
    setZoom: vi.fn(() => { calls.push('zoom'); return camera; }),
    setBounds: vi.fn(() => { calls.push('bounds'); return camera; }),
    startFollow: vi.fn(() => { calls.push('follow'); return camera; }),
    stopFollow: vi.fn(() => { calls.push('stop'); return camera; }),
    centerOn: vi.fn(() => { calls.push('center'); return camera; }),
    roundPixels: true,
  };
  const scenery = {
    applyPresentationBounds: vi.fn((_bounds: unknown) => { calls.push('floor'); }),
    destroy: vi.fn(),
  };
  const physicsSetBounds = vi.fn();
  const player = { sprite: {}, destroy: vi.fn() };
  scene.cameras = { main: camera };
  scene.physics = { world: { setBounds: physicsSetBounds } };
  scene.scale = Object.assign(new EventEmitter(), canvas);
  scene.events = new EventEmitter();
  scene.input = { off: vi.fn(), keyboard: { off: vi.fn() } };
  scene.arenaDimensions = arena;
  scene.arenaPresentationPadding = Object.freeze({ left: 7.7, right: 7.7, top: 7.7, bottom: 29.4 });
  scene.arenaScenery = scenery;
  scene.player = player;
  return { scene, camera, scenery, physicsSetBounds, player, calls };
}

describe('GameScene arena camera framing', () => {
  it('applies zoom before matching camera and floor bounds, then follows the player', () => {
    const { scene, camera, scenery, physicsSetBounds, player, calls } = framingScene();
    scene.applyArenaCameraFraming();

    const expected = resolveArenaCameraFraming(
      { width: 768, height: 1344 }, { width: 390, height: 844 }, GAMEPLAY_ZOOM,
      { left: 7.7, right: 7.7, top: 7.7, bottom: 29.4 },
    );
    expect(calls).toEqual(['zoom', 'bounds', 'floor', 'follow']);
    expect(camera.setZoom).toHaveBeenCalledWith(GAMEPLAY_ZOOM);
    expect(camera.roundPixels).toBe(false);
    expect(camera.setBounds).toHaveBeenCalledWith(
      expected.bounds.x, expected.bounds.y, expected.bounds.width, expected.bounds.height,
    );
    expect(scenery.applyPresentationBounds).toHaveBeenCalledWith(scene.arenaCameraFraming.bounds);
    expect(scenery.applyPresentationBounds.mock.calls[0]![0]).toBe(scene.arenaCameraFraming.bounds);
    expect(camera.startFollow).toHaveBeenCalledWith(player.sprite, false, 0.1, 0.1);
    expect(physicsSetBounds).not.toHaveBeenCalled();
  });

  it('uses the same framing result on initial application and a same-size resize', () => {
    const { scene, camera, scenery, physicsSetBounds } = framingScene();
    scene.applyArenaCameraFraming();
    const initial = scene.arenaCameraFraming;
    scene.handleResponsiveCamera();

    expect(scene.arenaCameraFraming).toEqual(initial);
    expect(camera.setBounds.mock.calls[1]).toEqual(camera.setBounds.mock.calls[0]);
    expect(scenery.applyPresentationBounds.mock.calls[1]).toEqual(scenery.applyPresentationBounds.mock.calls[0]);
    expect(physicsSetBounds).not.toHaveBeenCalled();
  });

  it('switches between centered static and following views as the viewport changes', () => {
    const { scene, camera, scenery, physicsSetBounds, calls } = framingScene(
      { width: 200, height: 300 }, { width: 390, height: 844 },
    );
    scene.applyArenaCameraFraming();
    expect(scene.arenaCameraFraming.follow).toBe(false);
    expect(calls).toEqual(['zoom', 'bounds', 'floor', 'stop', 'center']);
    expect(camera.centerOn).toHaveBeenCalledWith(100, 160.85);

    scene.scale.width = 180;
    scene.scale.height = 200;
    calls.length = 0;
    scene.handleResponsiveCamera();
    expect(scene.arenaCameraFraming.follow).toBe(true);
    expect(calls).toEqual(['zoom', 'bounds', 'floor', 'follow']);
    expect(scenery.applyPresentationBounds).toHaveBeenLastCalledWith(scene.arenaCameraFraming.bounds);

    scene.scale.width = 390;
    scene.scale.height = 844;
    calls.length = 0;
    scene.handleResponsiveCamera();
    expect(scene.arenaCameraFraming.follow).toBe(false);
    expect(calls).toEqual(['zoom', 'bounds', 'floor', 'stop', 'center']);
    expect(camera.stopFollow).toHaveBeenCalledTimes(2);
    expect(camera.centerOn).toHaveBeenLastCalledWith(100, 160.85);
    expect(physicsSetBounds).not.toHaveBeenCalled();
  });

  it('clears run framing and the resize listener on shutdown before another visit', () => {
    const { scene, camera, scenery, player } = framingScene();
    scene.scale.on('resize', scene.handleResponsiveCamera);
    scene.applyArenaCameraFraming();
    scene.handleShutdown();

    expect(scene.arenaDimensions).toBeUndefined();
    expect(scene.arenaPresentationPadding).toBeUndefined();
    expect(scene.arenaCameraFraming).toBeUndefined();
    expect(scene.arenaScenery).toBeUndefined();
    expect(scenery.destroy).toHaveBeenCalledTimes(1);
    expect(player.destroy).toHaveBeenCalledTimes(1);
    scene.scale.emit('resize');
    expect(camera.setBounds).toHaveBeenCalledTimes(1);

    scene.arenaDimensions = { width: 200, height: 300 };
    scene.arenaPresentationPadding = { left: 0, right: 0, top: 0, bottom: 0 };
    scene.player = { sprite: {}, destroy: vi.fn() };
    scene.applyArenaCameraFraming();
    expect(scene.arenaCameraFraming.bounds.centerX).toBe(100);
    expect(scene.arenaCameraFraming.bounds.centerY).toBe(150);
  });
});
