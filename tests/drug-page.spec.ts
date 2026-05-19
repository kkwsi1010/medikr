import { test, expect } from '@playwright/test';

test('약 페이지 정상 렌더링 + 필수 섹션', async ({ page, request }) => {
  // 홈에서 첫 약 itemSeq 추출
  const homeRes = await request.get('/');
  const html = await homeRes.text();
  const match = html.match(/href="\/약\/([0-9]+)"/);
  if (!match) {
    test.skip(true, 'No drug pages built (MFDS_API_KEY not set in build env)');
    return;
  }
  const itemSeq = match[1];

  await page.goto(`/약/${itemSeq}`);
  await expect(page.locator('article h2')).toBeVisible();
  await expect(page.locator(`text=${itemSeq}`)).toBeVisible();
});

test('약 페이지 JSON-LD Drug schema 노출', async ({ page, request }) => {
  const homeRes = await request.get('/');
  const html = await homeRes.text();
  const match = html.match(/href="\/약\/([0-9]+)"/);
  if (!match) {
    test.skip(true, 'No drug pages built');
    return;
  }
  await page.goto(`/약/${match[1]}`);
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(jsonLd).toBeTruthy();
  const parsed = JSON.parse(jsonLd!);
  expect(parsed['@type']).toBe('Drug');
  expect(parsed.name).toBeTruthy();
});
