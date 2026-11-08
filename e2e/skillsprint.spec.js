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

test('mobile sign-up remains scrollable and keeps auth copy inside a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.locator('#ssBootScreen')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#authGate')).toBeVisible();

  await page.locator('#authModeToggle').click();
  for (const id of ['authUsername', 'authDisplayName', 'authPhone', 'authPassword', 'authConfirmPassword', 'authSubmit']) {
    await expect(page.locator('#' + id)).toBeVisible();
  }

  const layout = await page.evaluate(() => {
    const gate = document.querySelector('#authGate');
    const heading = document.querySelector('#authTitle');
    const intro = document.querySelector('#authIntro');
    return {
      overflowY: getComputedStyle(gate).overflowY,
      scrollable: gate.scrollHeight > gate.clientHeight,
      headingFits: heading.scrollWidth <= heading.clientWidth + 1,
      introFits: intro.scrollWidth <= intro.clientWidth + 1,
    };
  });
  expect(layout.overflowY).toBe('auto');
  expect(layout.scrollable).toBeTruthy();
  expect(layout.headingFits).toBeTruthy();
  expect(layout.introFits).toBeTruthy();

  await page.locator('#authSubmit').scrollIntoViewIfNeeded();
  await expect(page.locator('#authSubmit')).toBeInViewport();
});



test('authentication copy is concise and aligned at desktop, tablet and mobile widths', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#ssBootScreen')).toBeHidden({ timeout: 15000 });
    await expect(page.locator('#authGate')).toBeVisible();
    await expect(page.locator('#authTitle')).toHaveText('Sign in');
    await expect(page.locator('#authIntro')).toHaveText('Use your telephone number and six-digit PIN.');
    await expect(page.locator('#authFormEyebrow')).toHaveCount(0);
    await expect(page.locator('.auth-privacy')).toHaveCount(0);
    await expect(page.locator('#installAppBtnAuth')).toHaveCount(0);

    const signInLayout = await page.evaluate(() => {
      const gate = document.querySelector('#authGate');
      const title = document.querySelector('#authTitle');
      const intro = document.querySelector('#authIntro');
      const label = document.querySelector('#authPhoneLabel');
      return {
        titleAlign: getComputedStyle(title).textAlign,
        introAlign: getComputedStyle(intro).textAlign,
        labelAlign: getComputedStyle(label).textAlign,
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        gateVisible: !gate.hidden,
      };
    });
    expect(signInLayout.titleAlign).toBe('left');
    expect(signInLayout.introAlign).toBe('left');
    expect(signInLayout.labelAlign).toBe('left');
    expect(signInLayout.noHorizontalOverflow).toBeTruthy();
    expect(signInLayout.gateVisible).toBeTruthy();

    await page.locator('#authModeToggle').click();
    await expect(page.locator('#authTitle')).toHaveText('Create account');
    await expect(page.locator('#authIntro')).toHaveText('Add your details and choose a six-digit PIN.');
    for (const id of ['authUsername', 'authDisplayName', 'authPhone', 'authPassword', 'authConfirmPassword', 'authSubmit']) {
      await expect(page.locator('#' + id)).toBeVisible();
    }
    const signUpLayout = await page.evaluate(() => ({
      titleAlign: getComputedStyle(document.querySelector('#authTitle')).textAlign,
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      confirmHintCount: document.querySelectorAll('#authConfirmHint').length,
    }));
    expect(signUpLayout.titleAlign).toBe('left');
    expect(signUpLayout.noHorizontalOverflow).toBeTruthy();
    expect(signUpLayout.confirmHintCount).toBe(0);
  }
});
