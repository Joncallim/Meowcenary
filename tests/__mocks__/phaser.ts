import { vi } from 'vitest';

// Shared Phaser runtime mocks for tests that instantiate entities/systems that
// depend on Phaser classes (e.g. DropSystem). Tests needing these mocks must
// import this module; `import type` from 'phaser' does not require it.

export class MockGameObject {
  active = true;
  visible = true;
  destroyed = false;
  depth = 0;
  alpha = 1;
  fillColor?: number;
  strokeWidth = 0;
  strokeColor?: number;
  strokeAlpha = 0;
  body?: MockBody;

  constructor(
    public x = 0,
    public y = 0,
  ) {}

  setDepth(depth: number): this {
    this.depth = depth;
    return this;
  }

  setAlpha(alpha: number): this {
    this.alpha = alpha;
    return this;
  }

  setStrokeStyle(width: number, color: number, alpha: number): this {
    this.strokeWidth = width;
    this.strokeColor = color;
    this.strokeAlpha = alpha;
    return this;
  }

  setActive(active: boolean): this {
    this.active = active;
    return this;
  }

  setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setFillStyle(color: number): this {
    this.fillColor = color;
    return this;
  }

  destroy(): void {
    this.active = false;
    this.destroyed = true;
  }
}

export class MockArc extends MockGameObject {}

export class MockBody {
  enable = true;
  velocity = { x: 0, y: 0 };
  circleRadius?: number;

  constructor(readonly gameObject: MockGameObject) {}

  setCircle(radius: number): void {
    this.circleRadius = radius;
  }

  setVelocity(x: number, y: number): void {
    this.velocity = { x, y };
  }
}

vi.mock('phaser', () => ({
  default: {
    GameObjects: { GameObject: MockGameObject },
    Physics: { Arcade: { Body: MockBody, StaticBody: MockBody } },
  },
}));
