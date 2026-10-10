import { expect, test } from '@playwright/test';
import { dismissRunStartBrief } from './run-start-helpers';

// A complete visual pass deliberately reloads Phaser and its art bundles many
// times. Shared CI runners can take materially longer than a developer machine
// to reach those observable states, so bound infrastructure readiness without
// changing game timing or weakening any screenshot comparison.
const visualReadyTimeoutMs = 20_000;
const illustratedScreenshot = {
  animations: 'disabled' as const,
  maxDiffPixels: 128,
  // GitHub's constrained Chromium exceeded the 5 s default while capturing a
  // settled Equipment frame. This only bounds screenshot scheduling; the
  // pixel contract above remains exact.
  timeout: 20_000,
};

type VisualTestSeam = {
  freeze(): Promise<void>;
  useAuthoredArenaArtReference(): boolean;
  focusArtBackdrop(): boolean;
  resume(): void;
  isSceneActive(key: string): boolean;
  isMenuPresentationSettled(): boolean;
  menuFocusedKey(): string | undefined;
  waitForMenuPresentation(): Promise<boolean>;
  focusFirstEnemy(bossOnly?: boolean): boolean;
  focusPlayer(): boolean;
  showAbilityEffect(): boolean;
  focusedActorScreenPoint(): { x: number; y: number } | undefined;
  showMenu(panel: string): boolean;
  showUpgradeChooser(): boolean;
  showExtraction(): boolean;
  showRunSummary(outcome: 'won' | 'lost'): boolean;
};

const representativeProjects = new Set([
  'phone-390x844',
  'foldable-1114x720',
  'desktop-1280x720',
]);

async function press(page: import('@playwright/test').Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(60);
  await page.keyboard.up(key);
  await page.waitForTimeout(120);
}

async function freezeAtStableFrame(page: import('@playwright/test').Page, artReference?: 'actor' | 'backdrop'): Promise<void> {
  if (artReference === 'backdrop') {
    expect(await page.evaluate(() => (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__?.focusArtBackdrop())).toBe(true);
  }
  await page.waitForTimeout(250);
  if (artReference) {
    // Fixed asset/overlay references explicitly own a paused fixture. Real
    // camera, UI overlap and production input tests never normalize framing.
    expect(await page.evaluate(() => (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__?.useAuthoredArenaArtReference())).toBe(true);
  }
  await page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__;
    if (!seam) throw new Error('visual-test loop seam was not installed');
    return seam.freeze();
  });
}

async function resumeLoop(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__;
    if (!seam) throw new Error('visual-test loop seam was not installed');
    seam.resume();
  });
}

async function showMenu(page: import('@playwright/test').Page, panel: string): Promise<void> {
  await expect.poll(() => page.evaluate((targetPanel) => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__;
    return seam?.showMenu(targetPanel) ?? false;
  }, panel), { timeout: visualReadyTimeoutMs }).toBe(true);
  await page.waitForTimeout(250);
}

async function expectScene(page: import('@playwright/test').Page, key: string): Promise<void> {
  await expect.poll(() => page.evaluate((sceneKey) => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__;
    return seam?.isSceneActive(sceneKey) ?? false;
  }, key), { timeout: visualReadyTimeoutMs }).toBe(true);
}

async function expectMenuPresentationSettled(page: import('@playwright/test').Page): Promise<void> {
  const settled = await page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__;
    return seam?.waitForMenuPresentation() ?? false;
  });
  expect(settled).toBe(true);
  await page.waitForTimeout(100);
}

async function expectCenteredActor(page: import('@playwright/test').Page, name: string): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('visual actor capture requires a fixed viewport');
  const point = await page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam })
      .__MEOWCENARY_VISUAL_TEST__;
    return seam?.focusedActorScreenPoint();
  });
  if (!point) throw new Error('visual actor capture requires a focused actor');
  const x = Math.max(0, Math.min(viewport.width - 96, Math.round(point.x) - 48));
  const y = Math.max(0, Math.min(viewport.height - 96, Math.round(point.y) - 48));
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    clip: { x, y, width: 96, height: 96 },
  });
}

test('fixed art reference compositions retain the Meowcenary visual system', async ({ page }, testInfo) => {
  // This journey reloads seven independently lazy-loaded production surfaces
  // before entering gameplay. A single-core CI runner has measured just over
  // 90 seconds while every bounded readiness assertion remained healthy; the
  // suite-level budget must cover the whole journey, not compete with them.
  test.setTimeout(180_000);
  test.skip(!representativeProjects.has(testInfo.project.name));
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));

  await page.goto('/?visual-test=1');
  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/ui-atlas.png')), { timeout: visualReadyTimeoutMs }).toBe(true);
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/menu-junkyard.png')), { timeout: visualReadyTimeoutMs }).toBe(true);
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/enemy-portraits-atlas.png')), { timeout: visualReadyTimeoutMs }).toBe(true);
  await expectMenuPresentationSettled(page);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('home.png', illustratedScreenshot);

  await page.reload();
  await showMenu(page, 'character');
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/mercenary-portraits-atlas.png')), { timeout: visualReadyTimeoutMs }).toBe(true);
  await expectMenuPresentationSettled(page);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('mercenary.png', illustratedScreenshot);
  await resumeLoop(page);
  for (let index = 0; index < 7; index += 1) await press(page, 'ArrowDown');
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('mercenary-lower.png', illustratedScreenshot);

  await page.reload();
  await showMenu(page, 'stage');
  await expectMenuPresentationSettled(page);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('contract-selection.png', illustratedScreenshot);

  await page.reload();
  await showMenu(page, 'equipment');
  await expectMenuPresentationSettled(page);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('loadout-equipment.png', illustratedScreenshot);

  await page.reload();
  await showMenu(page, 'gunsmith');
  await expectMenuPresentationSettled(page);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('loadout-gunsmith.png', illustratedScreenshot);

  await page.reload();
  await showMenu(page, 'achievements');
  await expectMenuPresentationSettled(page);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('achievements.png', illustratedScreenshot);

  await page.reload();
  await showMenu(page, 'settings');
  await expectMenuPresentationSettled(page);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('settings.png', illustratedScreenshot);

  await page.reload();
  await showMenu(page, 'home');
  await press(page, 'Enter');
  await expectScene(page, 'GameScene');
  await dismissRunStartBrief(page, 'mouse');
  await resumeLoop(page);
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/scrap-tabby.png')), { timeout: visualReadyTimeoutMs }).toBe(true);
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/scrap-sniper.png')), { timeout: visualReadyTimeoutMs }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam })
      .__MEOWCENARY_VISUAL_TEST__;
    return seam?.focusFirstEnemy(false) ?? false;
  }), { timeout: visualReadyTimeoutMs }).toBe(true);
  await freezeAtStableFrame(page, 'actor');
  // Fixed art-reference composition allows incidental player/held-weapon contact timing;
  // the production enemy view itself is locked exactly in the crop below.
  await expect(page).toHaveScreenshot('gameplay.png', { animations: 'disabled', maxDiffPixels: 1_500 });
  await expectCenteredActor(page, 'ordinary-gameplay-actor.png');
  await resumeLoop(page);
  await expect.poll(() => page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam })
      .__MEOWCENARY_VISUAL_TEST__;
    return seam?.focusPlayer() ?? false;
  }), { timeout: visualReadyTimeoutMs }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam })
      .__MEOWCENARY_VISUAL_TEST__;
    return seam?.showAbilityEffect() ?? false;
  }), { timeout: visualReadyTimeoutMs }).toBe(true);
  await page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & { __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam })
      .__MEOWCENARY_VISUAL_TEST__;
    if (!seam) throw new Error('visual-test loop seam was not installed');
    return seam.freeze();
  });
  await expect(page).toHaveScreenshot('ability-effect.png', { animations: 'disabled', maxDiffPixels: 1_500 });
});

test('stocked Gunsmith showcases assembled weapons, Parts, traits, and Workshop art', async ({ page }, testInfo) => {
  // This exact two-capture journey closes the full Parts/trait/chassis atlas.
  // Keep its infrastructure budget local while resource readiness itself is
  // awaited through the scene-owned loader queue above.
  // The exact GitHub runner completed foldable in 81 s and exhausted 90 s on
  // desktop after every scene-owned readiness boundary had closed. Keep the
  // outer journey budget above that measured infrastructure cost; individual
  // resource closure remains capped at 60 s with state diagnostics.
  test.setTimeout(120_000);
  test.skip(!representativeProjects.has(testInfo.project.name));
  await page.addInitScript(() => {
    localStorage.setItem('meowcenary.save.v2', JSON.stringify({
      version: 4,
      settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
      progression: { scrap: 640, unlocks: [] },
      stages: Object.fromEntries(
        ['stage:junkyard-01', 'stage:junkyard-02', 'stage:junkyard-03', 'stage:junkyard-04', 'stage:junkyard-05']
          .map((id) => [id, { completed: true, bestTimeMs: 60_000 }]),
      ),
      achievements: {}, achievementMetrics: {}, characters: {},
      gunsmith: {
        builds: [{
          id: 'build:pistol', name: 'Junkyard Spark', baseWeaponFamily: 'pistol',
          fitted: {
            receiver: 'owned:receiver-heavy:1', barrel: 'owned:barrel-piercing:1',
            optic: 'owned:optic-red-dot:1', trigger: 'owned:trigger-hair:1',
          },
          traitParts: ['owned:trait-fire:1'],
        }],
        selectedBuildId: 'build:pistol',
        parts: {
          'owned:receiver-heavy:1': { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] },
          'owned:barrel-piercing:1': { partId: 'part:barrel-piercing', tier: 2, infusedTraits: [] },
          'owned:optic-red-dot:1': { partId: 'part:optic-red-dot', tier: 1, infusedTraits: [] },
          'owned:trigger-hair:1': { partId: 'part:trigger-hair', tier: 1, infusedTraits: [] },
          'owned:trait-fire:1': { partId: 'part:trait-fire', tier: 2, infusedTraits: [] },
          'owned:receiver-compact:1': { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
          'owned:receiver-compact:2': { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
        },
        fabricationSerials: { 'part:receiver-compact': 2 },
      },
      equipment: {}, equipmentLoadout: {}, items: {}, bosses: {}, compendium: {},
      pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
    }));
  });
  await test.step('close the stocked Gunsmith resource generation', async () => {
    await page.goto('/?visual-test=1');
    await showMenu(page, 'gunsmith');
    await expectMenuPresentationSettled(page);
  });
  await test.step('capture the assembled build', async () => {
    await freezeAtStableFrame(page);
    await expect(page).toHaveScreenshot('gunsmith-assembled.png', illustratedScreenshot);
  });
  await test.step('navigate and capture the stocked Parts list', async () => {
    await resumeLoop(page);
    for (let index = 0; index < 24; index += 1) {
      const key = await page.evaluate(() => (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
      }).__MEOWCENARY_VISUAL_TEST__?.menuFocusedKey());
      if (key === 'gunsmith-surface:parts') break;
      await press(page, 'ArrowDown');
    }
    expect(await page.evaluate(() => (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__?.menuFocusedKey())).toBe('gunsmith-surface:parts');
    await press(page, 'Enter');
    await expectMenuPresentationSettled(page);
    await freezeAtStableFrame(page);
    await expect(page).toHaveScreenshot('gunsmith-parts.png', illustratedScreenshot);
  });
});

test('pause and Weapon Rack use the shared authored modal system', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280x720');
  await page.goto('/?visual-test=1');
  await showMenu(page, 'home');
  await press(page, 'Enter');
  await expectScene(page, 'GameScene');
  await dismissRunStartBrief(page, 'mouse');
  await press(page, 'p');
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('pause-modal.png', illustratedScreenshot);
  await resumeLoop(page);
  await press(page, 'ArrowDown');
  await press(page, 'Enter');
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('weapon-rack.png', illustratedScreenshot);
});

test('transient decision art references use the shared authored visual system', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(!new Set(['phone-390x844', 'desktop-1280x720']).has(testInfo.project.name));

  const enterRun = async (): Promise<void> => {
    await page.goto('/?visual-test=1');
    await showMenu(page, 'home');
    await press(page, 'Enter');
    await expectScene(page, 'GameScene');
    await dismissRunStartBrief(page, 'mouse');
    await resumeLoop(page);
  };
  const show = async (method: 'showUpgradeChooser' | 'showExtraction', name: string): Promise<void> => {
    await expect.poll(() => page.evaluate((key) => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.[key]() ?? false;
    }, method), { timeout: visualReadyTimeoutMs }).toBe(true);
    await freezeAtStableFrame(page, 'backdrop');
    await expect(page).toHaveScreenshot(name, illustratedScreenshot);
  };

  await enterRun();
  await show('showUpgradeChooser', 'upgrade-chooser.png');
  await enterRun();
  await show('showExtraction', 'extraction.png');

  for (const outcome of ['won', 'lost'] as const) {
    await enterRun();
    await expect.poll(() => page.evaluate((value) => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.showRunSummary(value) ?? false;
    }, outcome), { timeout: visualReadyTimeoutMs }).toBe(true);
    await freezeAtStableFrame(page, 'backdrop');
    await expect(page).toHaveScreenshot(`run-summary-${outcome}.png`, illustratedScreenshot);
  }
});

test('boss art reference keeps the approved boss-scale visual hierarchy', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280x720');
  await page.addInitScript(() => {
    const completed = Object.fromEntries(
      ['stage:junkyard-01', 'stage:junkyard-02', 'stage:junkyard-03', 'stage:junkyard-04']
        .map((id) => [id, { completed: true, bestTimeMs: 60_000 }]),
    );
    localStorage.setItem('meowcenary.save.v2', JSON.stringify({
      version: 4,
      settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
      progression: { scrap: 0, unlocks: [] },
      stages: completed,
      achievements: {}, achievementMetrics: {}, characters: {},
      gunsmith: { builds: [], parts: {}, fabricationSerials: {} },
      equipment: {}, equipmentLoadout: {}, items: {}, bosses: {}, compendium: {},
      pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
    }));
  });
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));
  await page.goto('/?visual-test=1');
  await showMenu(page, 'home');
  await press(page, 'Enter');
  await expectScene(page, 'GameScene');
  await dismissRunStartBrief(page, 'mouse');
  await resumeLoop(page);
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/boss-crusher.png')), { timeout: visualReadyTimeoutMs }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__;
    return seam?.focusFirstEnemy(true) ?? false;
  }), { timeout: visualReadyTimeoutMs }).toBe(true);
  await freezeAtStableFrame(page, 'actor');
  await expect(page).toHaveScreenshot('boss-gameplay.png', { animations: 'disabled', maxDiffPixels: 512 });
  await expectCenteredActor(page, 'boss-gameplay-actor.png');
});

test('Forge Warden art reference keeps its approved furnace-gantry silhouette', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280x720');
  await page.addInitScript(() => {
    const completed = Object.fromEntries(
      [
        'stage:junkyard-01', 'stage:junkyard-02', 'stage:junkyard-03',
        'stage:junkyard-04', 'stage:junkyard-05',
        'stage:forge-01', 'stage:forge-02', 'stage:forge-03', 'stage:forge-04',
      ].map((id) => [id, { completed: true, bestTimeMs: 60_000 }]),
    );
    localStorage.setItem('meowcenary.save.v2', JSON.stringify({
      version: 4,
      settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
      progression: { scrap: 0, unlocks: [] },
      stages: completed,
      achievements: {}, achievementMetrics: {}, characters: {},
      gunsmith: { builds: [], parts: {}, fabricationSerials: {} },
      equipment: {}, equipmentLoadout: {}, items: {}, bosses: {}, compendium: {},
      pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
    }));
  });
  const requestedAssets: string[] = [];
  page.on('response', (response) => requestedAssets.push(new URL(response.url()).pathname));
  await page.goto('/?visual-test=1');
  await showMenu(page, 'home');
  await press(page, 'Enter');
  await expectScene(page, 'GameScene');
  await dismissRunStartBrief(page, 'mouse');
  await resumeLoop(page);
  await expect.poll(() => requestedAssets.some((path) => path.endsWith('/boss-forge.png')), { timeout: visualReadyTimeoutMs }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const seam = (globalThis as typeof globalThis & {
      __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
    }).__MEOWCENARY_VISUAL_TEST__;
    return seam?.focusFirstEnemy(true) ?? false;
  }), { timeout: visualReadyTimeoutMs }).toBe(true);
  await freezeAtStableFrame(page, 'actor');
  await expect(page).toHaveScreenshot('forge-gameplay.png', { animations: 'disabled', maxDiffPixels: 512 });
  await expectCenteredActor(page, 'forge-warden-gameplay-actor.png');
});

test('every Mercenary actor retains its approved runtime silhouette', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== 'desktop-1280x720');
  const characterIds = [
    'scrap-tabby', 'bolt-hound', 'volt-lynx', 'brass-boar',
    'ember-cougar', 'scrap-weasel', 'rattle-raptor', 'piston-ram',
  ];
  const unlocks = characterIds.map((id) => `character:${id}`);
  for (const characterId of characterIds) {
    await page.goto('/?visual-test=1');
    await page.evaluate(({ selectedCharacterId, progressionUnlocks }) => {
      localStorage.setItem('meowcenary.save.v2', JSON.stringify({
        version: 4,
        settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
        progression: { scrap: 0, unlocks: progressionUnlocks },
        selectedCharacterId,
        stages: {}, achievements: {}, achievementMetrics: {}, characters: {},
        gunsmith: { builds: [], parts: {}, fabricationSerials: {} },
        equipment: {}, equipmentLoadout: {}, items: {}, bosses: {}, compendium: {},
        pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
      }));
    }, { selectedCharacterId: characterId, progressionUnlocks: unlocks });
    await page.reload();
    await showMenu(page, 'home');
    await press(page, 'Enter');
    await expectScene(page, 'GameScene');
    await dismissRunStartBrief(page, 'mouse');
    await resumeLoop(page);
    await expect.poll(() => page.evaluate(() => {
      const seam = (globalThis as typeof globalThis & {
        __MEOWCENARY_VISUAL_TEST__?: VisualTestSeam;
      }).__MEOWCENARY_VISUAL_TEST__;
      return seam?.focusPlayer() ?? false;
    }), { timeout: visualReadyTimeoutMs }).toBe(true);
    await freezeAtStableFrame(page, 'actor');
    await expectCenteredActor(page, `mercenary-gameplay-${characterId}.png`);
  }
});

test('compendium exposes the complete runtime enemy art roster', async ({ page }, testInfo) => {
  // This cold-loads the full actor portrait atlas, then captures three exact
  // scroll positions. Shared CI runners can complete every bounded resource
  // assertion and screenshot while exceeding Playwright's generic 30s test
  // budget, so keep the larger budget local to this one evidence journey.
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== 'desktop-1280x720');
  await page.addInitScript(() => {
    const enemyIds = [
      'dust-mite', 'junk-rusher', 'trash-brute', 'scrap-sniper',
      'scrap-skitter', 'bastion-beetle', 'junk-nester', 'shard-bot',
      'boss-crusher', 'boss-forge',
    ];
    localStorage.setItem('meowcenary.save.v2', JSON.stringify({
      version: 4,
      settings: { muted: true, musicVolume: 0, sfxVolume: 0, reducedMotion: true },
      progression: { scrap: 0, unlocks: [] },
      stages: {}, achievements: {}, achievementMetrics: {}, characters: {},
      gunsmith: { builds: [], parts: {}, fabricationSerials: {} },
      equipment: {}, equipmentLoadout: {}, items: {}, bosses: {},
      compendium: Object.fromEntries(enemyIds.map((id) => [id, 'defeated'])),
      pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
    }));
  });
  await page.goto('/?visual-test=1');
  await showMenu(page, 'compendium');
  await expectMenuPresentationSettled(page);
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('compendium.png', illustratedScreenshot);
  await resumeLoop(page);
  for (let index = 0; index < 5; index += 1) await press(page, 'ArrowDown');
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('compendium-middle.png', illustratedScreenshot);
  await resumeLoop(page);
  for (let index = 0; index < 4; index += 1) await press(page, 'ArrowDown');
  await freezeAtStableFrame(page);
  await expect(page).toHaveScreenshot('compendium-lower.png', illustratedScreenshot);
});
