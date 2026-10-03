import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { MenuSurfaceMount } from '../src/ui/menuSurfaces/mount';

type TestChild = { destroyed: boolean; destroyCount: number; parent?: TestContainer };

class TestContainer {
  readonly children: TestChild[] = [];
  destroyed = false;
  destroyCount = 0;
  parent?: TestContainer;

  add(child: TestChild): this {
    if (child.parent) child.parent.remove(child);
    child.parent = this;
    this.children.push(child);
    return this;
  }

  setScrollFactor(_factor: number): this { return this; }

  remove(child: TestChild): this {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parent = undefined;
    return this;
  }

  destroy(deep = true): void {
    this.destroyCount += 1;
    if (this.destroyed) return;
    this.destroyed = true;
    if (deep) for (const child of [...this.children]) destroyChild(child);
    this.parent?.remove(this);
  }
}

function destroyChild(child: TestChild): void {
  if (child instanceof TestContainer) child.destroy(true);
  else {
    child.destroyCount += 1;
    child.destroyed = true;
    child.parent?.remove(child);
  }
}

function child(): TestChild {
  return { destroyed: false, destroyCount: 0 };
}

function sceneHarness(): { scene: Phaser.Scene; parent: TestContainer; roots: TestContainer[] } {
  const parent = new TestContainer();
  const roots: TestContainer[] = [];
  const scene = {
    add: {
      container: () => {
        const root = new TestContainer();
        roots.push(root);
        return root;
      },
    },
  } as unknown as Phaser.Scene;
  return { scene, parent, roots };
}

describe('MenuSurfaceMount', () => {
  it('adds ownership before drawing and rolls back a partially drawn tree on failure', () => {
    const { scene, parent, roots } = sceneHarness();
    const mount = new MenuSurfaceMount(scene);
    const partial = child();
    const action = vi.fn();
    let staleCommand!: () => void;

    expect(() => mount.present(parent as unknown as Phaser.GameObjects.Container, root => {
      expect(parent.children).toContain(root as unknown as TestContainer);
      root.add(partial as unknown as Phaser.GameObjects.GameObject);
      staleCommand = mount.guardedCommand(action);
      throw new Error('injected draw failure');
    })).toThrow('injected draw failure');

    expect(roots).toHaveLength(1);
    expect(roots[0]!.destroyed).toBe(true);
    expect(roots[0]!.destroyCount).toBe(1);
    expect(partial.destroyed).toBe(true);
    expect(partial.destroyCount).toBe(1);
    expect(parent.children).toEqual([]);
    expect(mount.root).toBeUndefined();
    staleCommand();
    expect(action).not.toHaveBeenCalled();
  });

  it('rolls back if parent adoption throws after attaching the root and rejects pre-mount commands', () => {
    const { scene, parent, roots } = sceneHarness();
    const mount = new MenuSurfaceMount(scene);
    const action = vi.fn();
    const preMountCommand = mount.guardedCommand(action);
    const add = parent.add.bind(parent);
    vi.spyOn(parent, 'add').mockImplementation((root: TestChild) => {
      add(root);
      throw new Error('injected parent adoption failure');
    });

    expect(() => mount.present(parent as unknown as Phaser.GameObjects.Container, () => undefined))
      .toThrow('injected parent adoption failure');
    expect(parent.children).toEqual([]);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.destroyed).toBe(true);
    expect(roots[0]!.destroyCount).toBe(1);
    expect(mount.root).toBeUndefined();
    preMountCommand();
    expect(action).not.toHaveBeenCalled();
  });

  it('keeps repeated presentation and unmount bounded to one owned root and destroys each tree once', () => {
    const { scene, parent, roots } = sceneHarness();
    const mount = new MenuSurfaceMount(scene);
    const keep = child();
    parent.add(keep);

    for (let index = 0; index < 5; index += 1) {
      const drawn = child();
      mount.present(parent as unknown as Phaser.GameObjects.Container, root => {
        root.add(drawn as unknown as Phaser.GameObjects.GameObject);
      });
      expect(parent.children.filter(value => value instanceof TestContainer)).toHaveLength(1);
      expect(mount.root).toBe(roots.at(-1));
      if (index > 0) {
        expect(roots[index - 1]!.destroyed).toBe(true);
        expect(roots[index - 1]!.destroyCount).toBe(1);
      }
    }

    const currentChild = roots.at(-1)!.children[0]!;
    mount.unmount();
    mount.unmount();
    expect(roots.at(-1)!.destroyed).toBe(true);
    expect(roots.at(-1)!.destroyCount).toBe(1);
    expect(currentChild.destroyed).toBe(true);
    expect(currentChild.destroyCount).toBe(1);
    expect(parent.children).toEqual([keep]);
    expect(mount.root).toBeUndefined();

    mount.present(parent as unknown as Phaser.GameObjects.Container, () => undefined);
    expect(parent.children.filter(value => value instanceof TestContainer)).toHaveLength(1);
    expect(mount.root).toBe(roots.at(-1));
  });

  it('rejects callbacks from prior mounts and disposal while allowing the current command', () => {
    const { scene, parent } = sceneHarness();
    const mount = new MenuSurfaceMount(scene);
    const action = vi.fn();
    const present = () => mount.present(parent as unknown as Phaser.GameObjects.Container, () => undefined);

    present();
    const first = mount.guardedCommand(action);
    first();
    expect(action).toHaveBeenCalledTimes(1);

    present();
    first();
    expect(action).toHaveBeenCalledTimes(1);
    const second = mount.guardedCommand(action);
    mount.unmount();
    second();
    expect(action).toHaveBeenCalledTimes(1);

    present();
    const third = mount.guardedCommand(action);
    third();
    expect(action).toHaveBeenCalledTimes(2);
    mount.dispose();
    mount.dispose();
    third();
    expect(action).toHaveBeenCalledTimes(2);
    expect(mount.root).toBeUndefined();
    expect(() => present()).toThrow();
  });
});
