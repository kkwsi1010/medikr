import type { APIRoute } from 'astro';
import searchIdx from '../../data/search-idx.json';

// 색인 (drug-names.json 의 itemSeq 키) 기반 5만 약 sitemap
// prefetchAll() 안 쓰고 prebuild 색인 사용 — SSR 동적 생성
type SearchEntry = [string, string, string]; // [itemSeq, itemName, entpName]

export const GET: APIRoute = async ({ site }) => {
  const idx = searchIdx as SearchEntry[];
  const base = site?.href ?? 'https://medikr.kr/';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${idx
  .map(
    ([seq]) => `  <url>
    <loc>${base}drug/${seq}/</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
