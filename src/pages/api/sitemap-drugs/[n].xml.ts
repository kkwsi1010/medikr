import type { APIRoute } from 'astro';
import searchIdx from '../../../data/search-idx.json';

// 약 sitemap 분할 — 단일 5.66MB 는 Google 이 '가져올 수 없음' → 15,000개씩 쪼갬.
// sitemap.xml(index)이 /api/sitemap-drugs/0.xml, 1.xml ... 를 가리킴.
type SearchEntry = [string, string, string]; // [seq, name, entp]
const PER = 15000;

export function getStaticPaths() {
  const total = Math.ceil((searchIdx as SearchEntry[]).length / PER);
  return Array.from({ length: Math.max(total, 1) }, (_, i) => ({ params: { n: String(i) } }));
}

export const GET: APIRoute = ({ params }) => {
  const idx = searchIdx as SearchEntry[];
  const n = Number(params.n) || 0;
  const slice = idx.slice(n * PER, (n + 1) * PER);
  const urls = slice
    .map(
      ([seq]) =>
        `  <url><loc>https://medikr.kr/drug/${seq}/</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
