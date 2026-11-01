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

test('browser IndexedDB can persist an offline learning queue scoped to a user', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('skillsprint-e2e-offline', 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore('catalogues', { keyPath: 'userId' });
        const queue = database.createObjectStore('sync_queue', { keyPath: 'id' });
        queue.createIndex('byUser', 'userId', { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(['catalogues', 'sync_queue'], 'readwrite');
    transaction.objectStore('catalogues').put({ userId: 'learner-a', lessons: [{ id: 'lesson-1' }], paths: [{ id: 'web' }] });
    transaction.objectStore('sync_queue').put({ id: 'queue-1', userId: 'learner-a', type: 'answer', lessonId: 'lesson-1', answer: 'b' });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    const read = db.transaction(['catalogues', 'sync_queue'], 'readonly');
    const snapshot = await new Promise((resolve, reject) => {
      const request = read.objectStore('catalogues').get('learner-a');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const queued = await new Promise((resolve, reject) => {
      const request = read.objectStore('sync_queue').index('byUser').getAll('learner-a');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return { lessonCount: snapshot.lessons.length, pathCount: snapshot.paths.length, queued: queued.length, action: queued[0].type };
  });
  expect(result).toEqual({ lessonCount: 1, pathCount: 1, queued: 1, action: 'answer' });
});

test('PWA service worker installs and caches the offline learning shell', async ({ page }) => {
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
