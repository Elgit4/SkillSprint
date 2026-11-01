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

test('PWA service worker installs and caches the offline learning shell', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service-worker cache/offline routing is asserted in Chromium; all engines run the app smoke test.');
  await page.goto('/');
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable');
    await navigator.serviceWorker.ready;
  });
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
