import type { APIRoute } from 'astro';
import { prefetchAll } from '../../lib/mfds';

export const GET: APIRoute = async ({ site }) => {
  const { drugs } = await prefetchAll();
  const base = site?.href ?? 'https://medikr.kr/';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${drugs
  .map(
    (d) => `  <url>
    <loc>${base}약/${encodeURIComponent(d.itemSeq)}/</loc>
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
