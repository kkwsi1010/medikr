import type { APIRoute } from 'astro';
import searchIdx from '../data/search-idx.json';

// 통합 sitemap index — 정적 페이지(sitemap-0.xml) + 약 sitemap 분할(15,000개씩).
// 단일 5.66MB sitemap 은 Google 이 '가져올 수 없음' → 분할. 이 index 하나만 Search Console 에 제출.
// prerender=false: Content-Type(application/xml) 보장.
export const prerender = false;

const PER = 15000;

export const GET: APIRoute = () => {
  const total = Math.max(Math.ceil((searchIdx as unknown[]).length / PER), 1);
  const drugMaps = Array.from(
    { length: total },
    (_, i) => `  <sitemap><loc>https://medikr.kr/api/sitemap-drugs/${i}.xml</loc></sitemap>`
  ).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://medikr.kr/sitemap-0.xml</loc></sitemap>
${drugMaps}
</sitemapindex>`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
