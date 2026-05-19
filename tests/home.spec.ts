import { test, expect } from '@playwright/test';

test('홈페이지 정상 로드 + 메타데이터', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/medikr/);
  await expect(page.locator('header h1')).toContainText('medikr');
  await expect(page.locator('main h2')).toContainText('최근');
});

test('홈페이지 → 약 상세 이동', async ({ page }) => {
  await page.goto('/');
  const firstLink = page.locator('main ul li a').first();
  const href = await firstLink.getAttribute('href');
  if (href) {
    await firstLink.click();
    await expect(page).toHaveURL(href);
  } else {
    test.skip(true, 'No drug links present (MFDS_API_KEY not set in build env)');
  }
});

test('robots.txt + sitemap 노출', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBeTruthy();
  expect(await robots.text()).toContain('Sitemap:');

  const sitemap = await request.get('/sitemap-index.xml');
  expect(sitemap.ok()).toBeTruthy();
});
