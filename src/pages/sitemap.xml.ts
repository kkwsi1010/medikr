import type { APIRoute } from 'astro';

// 통합 sitemap index — 정적 페이지(sitemap-0.xml) + 약 43k(api/sitemap-drugs.xml)를 한 번에.
// @astrojs/sitemap 의 sitemap-index.xml 은 정적 페이지만 포함하므로, 이 파일을 Search Console 에 제출하면 전체 색인.
export const GET: APIRoute = () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://medikr.kr/sitemap-0.xml</loc></sitemap>
  <sitemap><loc>https://medikr.kr/api/sitemap-drugs.xml</loc></sitemap>
</sitemapindex>`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
