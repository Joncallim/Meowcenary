import { expect, test } from '@playwright/test';

type ArenaFramingDiagnostics = {
  window: { innerWidth: number; innerHeight: number; devicePixelRatio: number };
  rootRect: { x: number; y: number; width: number; height: number };
  canvas: { width: number; height: number; rect: { x: number; y: number; width: number; height: number } };
  scale: { width: number; height: number };
  camera: {
    viewport: { x: number; y: number; width: number; height: number };
    zoom: number;
    worldView: { x: number; y: number; width: number; height: number };
    bounds: { x: number; y: number; width: number; height: number };
    roundPixels: boolean;
  };
  arena: { width: number; height: number };
  player: { x: number; y: number; bodyRadius: number; screenBounds: { x: number; y: number; width: number; height: number }; completePresentationBounds: { x: number; y: number; width: number; height: number } };
  hudLayers: Array<{ type: string; depth: number; alpha: number; fillAlpha?: number }>;
};

type ArenaFramingSeam = {
  isSceneActive(key: string): boolean;
  waitForMenuPresentation(): Promise<boolean>;
  showMenu(panel: string): boolean;
  placePlayerForArenaFraming(x: number, y: number): boolean;
  arenaFramingDiagnostics(): ArenaFramingDiagnostics | undefined;
};

function expectedArenaPresentationBounds(diagnostic: ArenaFramingDiagnostics) {
  const actor = diagnostic.player.completePresentationBounds;
  const player = diagnostic.player;
  const paddingX = Math.max(0, player.x - actor.x - player.bodyRadius, actor.x + actor.width - player.x - player.bodyRadius);
  const paddingY = Math.max(0, player.y - actor.y - player.bodyRadius, actor.y + actor.height - player.y - player.bodyRadius);
  const width = Math.max(diagnostic.arena.width + 2 * paddingX, diagnostic.scale.width / diagnostic.camera.zoom);
  const height = Math.max(diagnostic.arena.height + 2 * paddingY, diagnostic.scale.height / diagnostic.camera.zoom);
  return {
    x: (diagnostic.arena.width - width) / 2,
    y: (diagnostic.arena.height - height) / 2,
    width,
    height,
  };
}

async function applyKeyboardCpuThrottle(page: import('@playwright/test').Page, project: string): Promise<void> {
  const rate = Number(process.env.MEOW_KEYBOARD_CPU_THROTTLE_RATE ?? 0);
  if (project !== 'desktop-1920x1080' || !Number.isFinite(rate) || rate < 2) return;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate });
}

test('canvas fills the available viewport and survives a live resize', async ({ page }, testInfo) => {
  await page.goto('/');
  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('#portrait-orientation-guard')).toBeHidden();
  const viewport = page.viewportSize()!;
  await expect.poll(async () => canvas.boundingBox()).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });

  await page.setViewportSize({ width: Math.max(360, viewport.height), height: Math.max(640, viewport.width) });
  const resized = page.viewportSize()!;
  await expect.poll(async () => canvas.boundingBox()).toEqual({ x: 0, y: 0, width: resized.width, height: resized.height });
  await page.reload();
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.boundingBox()).toEqual({ x: 0, y: 0, width: resized.width, height: resized.height });
  await page.screenshot({ path: testInfo.outputPath('home-resized.png') });
});

test('authored arena top is camera-visible and not hidden by an opaque HUD plate', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'foldable-1114x720');
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__?.waitForMenuPresentation())).toBe(true);
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__?.showMenu('home') ?? false), { timeout: 20_000 }).toBe(true);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__?.waitForMenuPresentation())).toBe(true);
  await page.keyboard.down('Enter');
  await page.waitForTimeout(60);
  await page.keyboard.up('Enter');
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__?.isSceneActive('GameScene') ?? false), { timeout: 20_000 }).toBe(true);

  const initial = await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__?.arenaFramingDiagnostics());
  expect(initial).toBeDefined();
  expect(initial!.rootRect).toEqual({ x: 0, y: 0, width: initial!.window.innerWidth, height: initial!.window.innerHeight });
  expect(initial!.canvas.rect).toEqual(initial!.rootRect);
  expect(initial!.scale).toEqual({ width: initial!.canvas.width, height: initial!.canvas.height });
  expect(initial!.camera.zoom).toBe(1.25);
  expect(initial!.camera.roundPixels).toBe(false);
  expect(initial!.camera.bounds).toEqual(expectedArenaPresentationBounds(initial!));

  const assertTopCornersVisible = async (reference: ArenaFramingDiagnostics) => {
    for (const x of [reference.player.bodyRadius, reference.arena.width - reference.player.bodyRadius]) {
      await page.evaluate(({ targetX, targetY }) => (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
      }).__MEOWCENARY_VISUAL_TEST__?.placePlayerForArenaFraming(targetX, targetY), {
        targetX: x,
        targetY: reference.player.bodyRadius,
      });
      const expectedWorldX = Math.min(
        Math.max(x - reference.camera.worldView.width / 2, reference.camera.bounds.x),
        reference.camera.bounds.x + reference.camera.bounds.width - reference.camera.worldView.width,
      );
      await expect.poll(async () => {
        const diagnostic = await page.evaluate(() => (globalThis as typeof globalThis & {
          __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
        }).__MEOWCENARY_VISUAL_TEST__?.arenaFramingDiagnostics());
        return diagnostic ? {
          x: Math.round(diagnostic.camera.worldView.x),
          y: Math.round(diagnostic.camera.worldView.y),
        } : undefined;
      }).toEqual({ x: Math.round(expectedWorldX), y: Math.round(reference.camera.bounds.y) });
      const corner = await page.evaluate(() => (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
      }).__MEOWCENARY_VISUAL_TEST__?.arenaFramingDiagnostics());
      expect(corner).toBeDefined();
      const playerScreenX = corner!.camera.viewport.x
        + (corner!.player.x - corner!.camera.worldView.x) * corner!.camera.zoom;
      const playerScreenY = corner!.camera.viewport.y
        + (corner!.player.y - corner!.camera.worldView.y) * corner!.camera.zoom;
      expect(playerScreenX).toBeGreaterThanOrEqual(0);
      expect(playerScreenX).toBeLessThanOrEqual(corner!.canvas.rect.width);
      expect(playerScreenY).toBeGreaterThanOrEqual(0);
      expect(playerScreenY).toBeLessThanOrEqual(corner!.canvas.rect.height);
    }
  };

  await page.evaluate(({ x, y }) => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__?.placePlayerForArenaFraming(x, y), {
    x: initial!.arena.width / 2,
    y: initial!.player.bodyRadius,
  });
  await expect.poll(async () => (await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__?.arenaFramingDiagnostics()))?.camera.worldView.y)
    .toBeCloseTo(initial!.camera.bounds.y, 0);
  const atTop = await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__?.arenaFramingDiagnostics());
  expect(atTop).toBeDefined();
  expect(atTop!.camera.worldView.y).toBeCloseTo(initial!.camera.bounds.y, 0);
  expect(atTop!.camera.bounds.y).toBeLessThanOrEqual(0);
  // A fully opaque screen-fixed layer proves the observed crop is HUD-owned:
  // camera, world view and DOM canvas all expose y=0, but the layer erases it.
  const hudPlates = atTop!.hudLayers.filter((layer) => layer.type === 'Rectangle' || layer.type === 'NineSlice');
  expect(hudPlates).toHaveLength(2);
  expect(hudPlates.every((layer) => (layer.fillAlpha ?? layer.alpha) < 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('issue-195-arena-top.png') });
  await assertTopCornersVisible(atTop!);

  const resizedViewport = testInfo.project.name.startsWith('phone')
    ? { width: 412, height: 915 }
    : { width: 1920, height: 1080 };
  await page.setViewportSize(resizedViewport);
  await expect.poll(async () => (await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__?.arenaFramingDiagnostics()))?.scale).toEqual(resizedViewport);
  const resized = await page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__?.arenaFramingDiagnostics());
  expect(resized?.rootRect).toEqual({ x: 0, y: 0, ...resizedViewport });
  expect(resized?.canvas.rect).toEqual(resized?.rootRect);
  expect(resized?.camera.bounds).toEqual(expectedArenaPresentationBounds(resized!));
  expect(resized?.hudLayers
    .filter((layer) => layer.type === 'Rectangle' || layer.type === 'NineSlice')
    .every((layer) => (layer.fillAlpha ?? layer.alpha) < 1)).toBe(true);
  await assertTopCornersVisible(resized!);
});

test('cold Home readiness stays closed until Boot resources arrive', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920x1080');
  let releaseBootImage!: () => void;
  let signalBootImage!: () => void;
  const bootImageRequested = new Promise<void>((resolve) => { signalBootImage = resolve; });
  const bootImageRelease = new Promise<void>((resolve) => { releaseBootImage = resolve; });
  await page.route('**/assets/ui/navigation-icons-atlas.png', async (route) => {
    signalBootImage();
    await bootImageRelease;
    await route.continue();
  });

  try {
    await page.goto('/?visual-test=1', { waitUntil: 'domcontentloaded' });
    await bootImageRequested;
    await expect.poll(() => page.evaluate(() => Boolean((globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: unknown;
    }).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
    const readiness = await page.evaluate(() => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: {
          isMenuPresentationSettled(): boolean;
          menuPresentationDiagnostics(): Record<string, unknown>;
        };
      }).__MEOWCENARY_VISUAL_TEST__;
      return { settled: seam?.isMenuPresentationSettled(), diagnostics: seam?.menuPresentationDiagnostics() };
    });
    expect(readiness.settled).toBe(false);
    expect(readiness.diagnostics).toMatchObject({ active: false, committedDisplay: false });
  } finally {
    releaseBootImage();
  }

  await page.evaluate(async () => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: { waitForMenuPresentation(): Promise<boolean> };
    }).__MEOWCENARY_VISUAL_TEST__;
    await seam?.waitForMenuPresentation();
  });
  await expect.poll(() => page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: {
        isMenuPresentationSettled(): boolean;
        menuPresentationDiagnostics(): Record<string, unknown>;
      };
    }).__MEOWCENARY_VISUAL_TEST__;
    return seam?.isMenuPresentationSettled() && seam.menuPresentationDiagnostics().committedPanel === 'home';
  })).toBe(true);
});

test('keyboard player journey reaches Mercenary and returns Home on the real canvas', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));
  const step = async <T>(label: string, action: () => Promise<T>): Promise<T> => test.step(label, action);
  const press = async (key: string) => step(`key ${key}`, async () => {
    await page.keyboard.down(key);
    try {
      // A fixed key hold can end between Phaser polls under CI load. Keep
      // the real key down until the scene-owned core has sampled that edge.
      await expect.poll(() => page.evaluate(() => {
        const seam = (globalThis as typeof globalThis & {
          __MEOWCENARY_VISUAL_TEST__?: {
            isMenuInputNeutral(): boolean;
            isSceneActive(key: string): boolean;
          };
        }).__MEOWCENARY_VISUAL_TEST__;
        return seam !== undefined
          && (!seam.isMenuInputNeutral() || seam.isSceneActive('GameScene'));
      }), { intervals: [16, 32, 50], timeout: 4_000 }).toBe(true);
    } finally {
      await page.keyboard.up(key);
    }
    // Keyboard actions are polled: give the input owner its neutral edge
    // before another press of the same key. This checks the logical input
    // state after InputController's own per-frame keyboard poll.
    await expect.poll(() => page.evaluate(() => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: { isMenuInputNeutral(): boolean };
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.isMenuInputNeutral() ?? false;
    }), { intervals: [16, 32, 50], timeout: 4_000 }).toBe(true);
  });
  const awaitMenu = async (panel: 'home' | 'character' | 'career' | 'achievements') => step(`settled menu ${panel}`, async () => {
    const settled = await page.evaluate(async () => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: { waitForMenuPresentation(): Promise<boolean> };
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.waitForMenuPresentation() ?? false;
    });
    expect(settled).toBe(true);
    await expect.poll(() => page.evaluate((expectedPanel) => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: {
          isMenuPresentationSettled(): boolean;
          menuPresentationDiagnostics(): Record<string, unknown>;
        };
      }).__MEOWCENARY_VISUAL_TEST__;
      const diagnostics = seam?.menuPresentationDiagnostics();
      return seam?.isMenuPresentationSettled() === true
        && diagnostics?.active === true
        && diagnostics?.committedDisplay === true
        && diagnostics?.committedPanel === expectedPanel;
    }, panel)).toBe(true);
  });

  await applyKeyboardCpuThrottle(page, testInfo.project.name);
  await step('cold boot and page navigation', () => page.goto('/?visual-test=1'));
  await awaitMenu('home');
  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();

  await press('ArrowDown');
  await press('ArrowDown');
  await press('Enter');
  await awaitMenu('character');
  await expect.poll(
    () => requestedAssets.some((path) => path.endsWith('/mercenary-portraits-atlas.png')),
    { intervals: [150, 250, 400], timeout: 8_000 },
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mercenary.png') });

  await press('Escape');
  await awaitMenu('home');

  await expect(canvas).toBeVisible();
});


test('keyboard player launches the prepared Contract on the real canvas', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));
  const step = async <T>(label: string, action: () => Promise<T>): Promise<T> => test.step(label, action);
  const press = async (key: string) => step(`key ${key}`, async () => {
    await page.keyboard.down(key);
    try {
      // A fixed key hold can end between Phaser polls under CI load. Keep
      // the real key down until the scene-owned core has sampled that edge.
      await expect.poll(() => page.evaluate(() => {
        const seam = (globalThis as typeof globalThis & {
          __MEOWCENARY_VISUAL_TEST__?: {
            isMenuInputNeutral(): boolean;
            isSceneActive(key: string): boolean;
          };
        }).__MEOWCENARY_VISUAL_TEST__;
        return seam !== undefined
          && (!seam.isMenuInputNeutral() || seam.isSceneActive('GameScene'));
      }), { intervals: [16, 32, 50], timeout: 4_000 }).toBe(true);
    } finally {
      await page.keyboard.up(key);
    }
    // Keyboard actions are polled: give the input owner its neutral edge
    // before another press of the same key. This checks the logical input
    // state after InputController's own per-frame keyboard poll.
    await expect.poll(() => page.evaluate(() => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: { isMenuInputNeutral(): boolean };
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.isMenuInputNeutral() ?? false;
    }), { intervals: [16, 32, 50], timeout: 4_000 }).toBe(true);
  });

  await applyKeyboardCpuThrottle(page, testInfo.project.name);
  await step('cold boot and page navigation', () => page.goto('/?visual-test=1'));
  await step('settled Home before launch', async () => {
    const settled = await page.evaluate(async () => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: { waitForMenuPresentation(): Promise<boolean> };
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.waitForMenuPresentation() ?? false;
    });
    expect(settled).toBe(true);
  });
  const canvas = page.locator('#game-root canvas');
  await press('Enter');
  await expect.poll(() => page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: { isSceneActive(key: string): boolean };
    }).__MEOWCENARY_VISUAL_TEST__;
    return seam?.isSceneActive('GameScene') ?? false;
  }), { intervals: [150, 250, 400], timeout: 30_000 }).toBe(true);
  await expect.poll(
    () => requestedAssets.some((path) => path.endsWith('/mercenary-identity-icons-atlas.png')),
    { intervals: [150, 250, 400], timeout: 8_000 },
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('gameplay.png') });
  await expect(canvas).toBeVisible();
});

test('keyboard player journey reaches Career and Achievements on the real canvas', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));
  const step = async <T>(label: string, action: () => Promise<T>): Promise<T> => test.step(label, action);
  const press = async (key: string) => step(`key ${key}`, async () => {
    await page.keyboard.down(key);
    try {
      // A fixed key hold can end between Phaser polls under CI load. Keep
      // the real key down until the scene-owned core has sampled that edge.
      await expect.poll(() => page.evaluate(() => {
        const seam = (globalThis as typeof globalThis & {
          __MEOWCENARY_VISUAL_TEST__?: {
            isMenuInputNeutral(): boolean;
            isSceneActive(key: string): boolean;
          };
        }).__MEOWCENARY_VISUAL_TEST__;
        return seam !== undefined
          && (!seam.isMenuInputNeutral() || seam.isSceneActive('GameScene'));
      }), { intervals: [16, 32, 50], timeout: 4_000 }).toBe(true);
    } finally {
      await page.keyboard.up(key);
    }
    // Keyboard actions are polled; wait for Phaser's next frame to observe the
    // neutral edge before another press of the same key.
    await expect.poll(() => page.evaluate(() => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: { isMenuInputNeutral(): boolean };
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.isMenuInputNeutral() ?? false;
    }), { intervals: [16, 32, 50], timeout: 4_000 }).toBe(true);
  });
  const awaitMenu = async (panel: 'home' | 'career' | 'achievements') => step(`settled menu ${panel}`, async () => {
    const settled = await page.evaluate(async () => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: { waitForMenuPresentation(): Promise<boolean> };
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.waitForMenuPresentation() ?? false;
    });
    expect(settled).toBe(true);
    await expect.poll(() => page.evaluate((expectedPanel) => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: {
          isMenuPresentationSettled(): boolean;
          menuPresentationDiagnostics(): Record<string, unknown>;
        };
      }).__MEOWCENARY_VISUAL_TEST__;
      const diagnostics = seam?.menuPresentationDiagnostics();
      return seam?.isMenuPresentationSettled() === true
        && diagnostics?.active === true
        && diagnostics?.committedDisplay === true
        && diagnostics?.committedPanel === expectedPanel;
    }, panel)).toBe(true);
  });

  await applyKeyboardCpuThrottle(page, testInfo.project.name);
  await step('cold boot and page navigation', () => page.goto('/?visual-test=1'));
  await awaitMenu('home');
  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();

  for (let index = 0; index < 3; index += 1) await press('ArrowDown');
  await press('Enter');
  await awaitMenu('career');
  await press('ArrowDown');
  await press('Enter');
  await awaitMenu('achievements');
  expect(await page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: { menuPresentationDiagnostics(): Record<string, unknown> };
    }).__MEOWCENARY_VISUAL_TEST__;
    return (seam?.menuPresentationDiagnostics().loadedTextureKeys as string[] | undefined)?.includes('art-achievement-icons');
  })).toBe(true);
  await expect.poll(
    () => requestedAssets.some((path) => path.endsWith('/achievement-icons-atlas.png')),
    { intervals: [150, 250, 400], timeout: 8_000 },
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('achievements.png') });

  await press('Escape');
  await awaitMenu('career');
  await press('Escape');
  await awaitMenu('home');
  await expect(canvas).toBeVisible();
});

test('phone touch starts a run, moves, and activates the graphical ability control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-390x844');
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));
  await page.goto('/?visual-test=1');
  // Home deliberately rejects actions while its cold art closure owns the
  // Phaser loader. The illustrated Home redesign moved the first action card
  // below the richer Contract hero, so tap its current safe center and prove
  // the touch reached GameScene rather than inferring launch from an art file
  // that Home itself now legitimately loads.
  await expect.poll(async () => {
    await page.touchscreen.tap(195, 282);
    return page.evaluate(() => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: { isSceneActive(key: string): boolean };
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.isSceneActive('GameScene') ?? false;
    });
  }, { intervals: [150, 250, 400], timeout: 8_000 }).toBe(true);
  expect(requestedAssets.some((path) => path.includes('/assets/'))).toBe(true);
  await page.waitForTimeout(1_000);

  // Sample static arena floor away from the animated player/effects. The
  // fixed-follow gameplay camera moves this texture only when the player
  // actually moves, so idle animation cannot satisfy the assertion.
  const floorClip = { x: 20, y: 180, width: 80, height: 80 };
  const idleFloorA = await page.screenshot({ clip: floorClip });
  await page.waitForTimeout(250);
  const idleFloorB = await page.screenshot({ clip: floorClip });
  expect(idleFloorB.equals(idleFloorA)).toBe(true);
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: 40, y: 620, id: 1 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: 120, y: 620, id: 1 }],
  });
  await page.waitForTimeout(250);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const movedFloor = await page.screenshot({ clip: floorClip });
  expect(movedFloor.equals(idleFloorB)).toBe(false);

  const abilityBefore = await page.screenshot({ clip: { x: 240, y: 750, width: 140, height: 84 } });
  await page.touchscreen.tap(320, 800);
  await page.waitForTimeout(100);
  const abilityAfter = await page.screenshot({ clip: { x: 240, y: 750, width: 140, height: 84 } });
  expect(abilityAfter.equals(abilityBefore)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('touch-gameplay.png') });
});

test('compact phone landscape is quarantined until portrait returns', async ({ browser }) => {
  const compact = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await compact.newPage();
  await page.goto('/');
  await expect(page.locator('#portrait-orientation-guard')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#portrait-orientation-guard')).toBeHidden();
  await compact.close();
});

test('fine-pointer compact landscape keeps every sparse menu action visible', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280x720');
  const compact = await browser.newContext({ viewport: { width: 844, height: 390 }, colorScheme: 'dark' });
  const page = await compact.newPage();
  await page.goto('/?visual-test=1');
  await expect.poll(() => page.evaluate(() => Boolean((globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: unknown;
  }).__MEOWCENARY_VISUAL_TEST__))).toBe(true);
  const settled = async () => {
    await expect.poll(() => page.evaluate(() => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: { isMenuPresentationSettled(): boolean };
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.isMenuPresentationSettled() ?? false;
    })).toBe(true);
    await page.waitForTimeout(150);
  };
  const show = async (panel: string) => {
    await expect.poll(() => page.evaluate((target) => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: { showMenu(panel: string): boolean };
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.showMenu(target) ?? false;
    }, panel)).toBe(true);
    await settled();
  };

  await settled();
  await expect(page).toHaveScreenshot('compact-home.png', { animations: 'disabled' });
  await show('loadout');
  await expect(page).toHaveScreenshot('compact-loadout.png', { animations: 'disabled' });

  await show('career');
  await expect(page).toHaveScreenshot('compact-career.png', { animations: 'disabled' });
  await show('next-goals');
  await expect(page).toHaveScreenshot('compact-next-goals.png', { animations: 'disabled' });

  await show('settings');
  await expect(page).toHaveScreenshot('compact-settings.png', { animations: 'disabled' });
  await compact.close();
});

test('the production pause control makes the responsive root fullscreen', async ({ page }, testInfo) => {
  // Browsers expose fullscreen as a process-global presentation surface. Run
  // this production-path assertion in one representative project so parallel
  // viewport workers cannot steal fullscreen from one another.
  test.skip(testInfo.project.name !== 'desktop-1280x720');
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));
  await page.goto('/?visual-test=1');
  await expect(page.locator('#game-root canvas')).toBeVisible();
  // Observe the existing seam only: controls still drive every transition.
  // Canvas visibility precedes Boot's asynchronous native menu artwork.
  await expect.poll(() => page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam & {
        isMenuPresentationSettled(): boolean;
        menuPresentationDiagnostics(): { committedDisplay?: boolean; committedPanel?: string };
      };
    }).__MEOWCENARY_VISUAL_TEST__;
    const menu = seam?.menuPresentationDiagnostics();
    return seam?.isMenuPresentationSettled() === true
      && menu?.committedDisplay === true && menu.committedPanel === 'home';
  }), { intervals: [150, 250, 400], timeout: 8_000 }).toBe(true);
  const supported = await page.evaluate(() => document.fullscreenEnabled);
  test.skip(!supported, 'Headless browser does not expose the Fullscreen API');
  const viewport = page.viewportSize()!;
  // Launch through the selected logical action instead of a stale canvas
  // coordinate: the production home card moved when its artwork grew.
  await page.keyboard.down('Enter');
  try {
    // Hold the real launch key until Phaser has consumed it and installed the
    // actual arena/player, rather than inferring gameplay from an asset load.
    await expect.poll(() => page.evaluate(() => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
      }).__MEOWCENARY_VISUAL_TEST__;
      const arena = seam?.arenaFramingDiagnostics();
      return seam?.isSceneActive('GameScene') === true && arena !== undefined
        && arena.arena.width > 0 && arena.arena.height > 0
        && Number.isFinite(arena.player.x) && Number.isFinite(arena.player.y);
    }), { intervals: [150, 250, 400], timeout: 8_000 }).toBe(true);
  } finally {
    await page.keyboard.up('Enter');
  }
  await expect.poll(
    () => requestedAssets.some((path) => path.endsWith('/mercenary-identity-icons-atlas.png')),
    { intervals: [150, 250, 400], timeout: 8_000 },
  ).toBe(true);
  // Keep the actor at the failing physical boundary while production pause
  // controls drive fullscreen; diagnose both presentation and physics.
  const readFraming = () => page.evaluate(() => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__!.arenaFramingDiagnostics());
  const initial = (await readFraming())!;
  expect(await page.evaluate(({ x, y }) => (globalThis as typeof globalThis & {
    __MEOWCENARY_VISUAL_TEST__?: ArenaFramingSeam;
  }).__MEOWCENARY_VISUAL_TEST__!.placePlayerForArenaFraming(x, y), {
    x: initial.arena.width / 2, y: initial.player.bodyRadius,
  })).toBe(true);
  const assertEdgeFraming = async () => {
    await expect.poll(async () => {
      const state = (await readFraming())!;
      const actor = state.player.screenBounds;
      return actor.x >= -0.5 && actor.y >= -0.5
        && actor.x + actor.width <= state.canvas.rect.width + 0.5
        && actor.y + actor.height <= state.canvas.rect.height + 0.5;
    }).toBe(true);
    const state = (await readFraming())!;
    expect(state.camera.bounds).toEqual(expectedArenaPresentationBounds(state));
    expect(state.camera.roundPixels).toBe(false);
    expect(state.player.y).toBe(initial.player.bodyRadius);
    expect(state.canvas.rect).toEqual(state.rootRect);
    return state;
  };
  const beforeFullscreen = await assertEdgeFraming();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1_000);
  // The launch pointer is intentionally quarantined until a neutral sample.
  // The first post-launch click supplies that neutral/release boundary; the
  // second is the production Pause edge.
  await page.mouse.click(viewport.width - 28, 30);
  await page.waitForTimeout(250);
  await page.mouse.click(viewport.width - 28, 30);
  await page.waitForTimeout(250);
  const sampledFrames = () => page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  for (let index = 0; index < 2; index += 1) {
    await page.keyboard.down('ArrowDown');
    try {
      await sampledFrames();
    } finally {
      await page.keyboard.up('ArrowDown');
    }
    await sampledFrames();
  }
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('game-root');
  const fullscreen = await assertEdgeFraming();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  const restored = await assertEdgeFraming();
  await testInfo.attach('fullscreen-edge-framing', {
    body: JSON.stringify({ beforeFullscreen, fullscreen, restored }, null, 2), contentType: 'application/json',
  });
});
