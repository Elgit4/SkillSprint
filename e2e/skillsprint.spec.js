import { test, expect } from '@playwright/test';

test('SkillSprint loads with a spinner-only start screen and telephone-number PIN authentication', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/SkillSprint/i);
  await expect(page.locator('#ssBootScreen')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#ssBootScreen img')).toHaveCount(0);
  await expect(page.locator('#authPhone')).toBeVisible();
  await expect(page.locator('#authPassword')).toBeVisible();
  await expect(page.locator('#googleSignIn')).toHaveCount(0);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/);
  expect(pageErrors).toEqual([]);
});

test('legacy offline workers and SkillSprint caches are retired', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(async () => {
    if (!('caches' in window)) return true;
    const registrations = navigator.serviceWorker?.getRegistrations
      ? await navigator.serviceWorker.getRegistrations()
      : [];
    const names = await caches.keys();
    return registrations.length === 0 && !names.some((name) => name.startsWith('skillsprint-'));
  }, null, { timeout: 15000 });
  const state = await page.evaluate(async () => ({
    registrations: navigator.serviceWorker?.getRegistrations ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    appCaches: 'caches' in window ? (await caches.keys()).filter((name) => name.startsWith('skillsprint-')) : [],
  }));
  expect(state).toEqual({ registrations: 0, appCaches: [] });
});

test('PWA manifest retains standard SkillSprint desktop and mobile icons', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const manifestResponse = await fetch(link.href);
    if (!manifestResponse.ok) throw new Error('PWA manifest could not be loaded');
    const manifest = await manifestResponse.json();
    const icons = await Promise.all(manifest.icons.map(async (icon) => {
      const response = await fetch(new URL(icon.src, location.href));
      return { sizes: icon.sizes, purpose: icon.purpose || 'any', ok: response.ok };
    }));
    const favicon = await fetch('/icons/icon-192.png');
    return { display: manifest.display, icons, faviconOk: favicon.ok };
  });
  expect(result.display).toBe('standalone');
  expect(result.icons.some((icon) => icon.sizes === '192x192' && icon.ok)).toBeTruthy();
  expect(result.icons.some((icon) => icon.sizes === '512x512' && icon.ok)).toBeTruthy();
  expect(result.icons.some((icon) => icon.purpose.includes('maskable') && icon.ok)).toBeTruthy();
  expect(result.faviconOk).toBeTruthy();
});
