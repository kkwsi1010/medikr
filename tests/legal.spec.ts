import { test, expect } from '@playwright/test';

const pages = [
  { path: '/about', heading: '운영자 정보' },
  { path: '/privacy', heading: '개인정보처리방침' },
  { path: '/terms', heading: '이용약관' },
];

for (const { path, heading } of pages) {
  test(`법적 페이지 ${path} 정상 로드`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('main h2')).toContainText(heading);
    await expect(page.locator('footer')).toBeVisible();
  });
}

test('404 페이지', async ({ page }) => {
  const res = await page.goto('/does-not-exist-xyz');
  // 정적 사이트라 404 페이지가 반환되어야 함
  expect([200, 404]).toContain(res?.status() ?? 0);
  await expect(page.locator('main h2')).toContainText('찾을 수');
});
