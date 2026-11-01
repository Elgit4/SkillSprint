import { test, expect } from '@playwright/test';

test('SkillSprint loads and exposes email-only authentication', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/SkillSprint/i);
  await expect(page.locator('#ssBootScreen')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#authEmail')).toBeVisible();
  await expect(page.locator('#authPassword')).toBeVisible();
  await expect(page.locator('#googleSignIn')).toHaveCount(0);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/);
  expect(pageErrors).toEqual([]);
});

test('IndexedDB persists the complete offline catalogue and queued answers per account', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const store = await import('/src/lib/offline-store.js');
    const userId = 'e2e-user-a';
    await store.saveOfflineSnapshot(userId, {
      profile: { username: 'offline-learner' },
      paths: [{ id: 'web', title: 'Web Development' }],
      lessons: [{ id: 'lesson-1', path_id: 'web', content: { options: [{ id: 'a' }, { id: 'b' }] } }],
      attempts: [],
      events: [],
      achievements: [],
      earned: [],
      completed: [],
    });
    const queued = await store.enqueueOfflineAction(userId, {
      type: 'answer', lessonId: 'lesson-1', answer: 'b', durationSeconds: 18,
    });
    const snapshot = await store.loadOfflineSnapshot(userId);
    const actions = await store.listOfflineActions(userId);
    const otherUserSnapshot = await store.loadOfflineSnapshot('e2e-user-b');
    await store.removeOfflineAction(queued.id);
    const remaining = await store.countOfflineActions(userId);
    return {
      lessonCount: snapshot.lessons.length,
      pathCount: snapshot.paths.length,
      username: snapshot.profile.username,
      actionCount: actions.length,
      actionType: actions[0]?.type,
      isolated: otherUserSnapshot === null,
      remaining,
    };
  });
  expect(result).toEqual({
    lessonCount: 1,
    pathCount: 1,
    username: 'offline-learner',
    actionCount: 1,
    actionType: 'answer',
    isolated: true,
    remaining: 0,
  });
});

test('PWA service worker installs and caches the offline learning shell', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service-worker offline routing is asserted in Chromium; all engines run app and IndexedDB smoke tests.');
  await page.goto('/');
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable');
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cacheState = await page.evaluate(async () => {
    const names = await caches.keys();
    const name = names.find((value) => value === 'skillsprint-shell-v5-shell');
    if (!name) return { names, root: false, offlinePage: false };
    const cache = await caches.open(name);
    return {
      names,
      root: Boolean(await cache.match(new URL('./', location.href))),
      offlinePage: Boolean(await cache.match(new URL('./offline.html', location.href))),
    };
  });
  expect(cacheState.names).toContain('skillsprint-shell-v5-shell');
  expect(cacheState.root).toBeTruthy();
  expect(cacheState.offlinePage).toBeTruthy();
  await page.context().setOffline(true);
  await page.reload();
  await expect(page).toHaveTitle(/SkillSprint/i);
  await expect(page.locator('#authGate')).toBeVisible();
});
