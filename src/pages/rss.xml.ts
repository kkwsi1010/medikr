import type { APIContext } from 'astro';
import { prefetchAll, type EasyDrug } from '../lib/mfds';

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export async function GET(context: APIContext) {
  const site = context.site?.href ?? 'https://medikr.kr/';
  const { drugs, permitMap } = await prefetchAll();

  // 허가일자 desc 정렬, 최근 50개
  const recent = [...drugs]
    .map((d) => ({ d, date: permitMap.get(d.itemSeq)?.ITEM_PERMIT_DATE ?? '' }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 50);

  function fmtRFC822(yyyymmdd: string): string {
    if (!yyyymmdd || yyyymmdd.length !== 8) return new Date().toUTCString();
    const d = new Date(
      Number(yyyymmdd.slice(0, 4)),
      Number(yyyymmdd.slice(4, 6)) - 1,
      Number(yyyymmdd.slice(6, 8))
    );
    return d.toUTCString();
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>medikr — 의약품 정보</title>
    <link>${site}</link>
    <description>식약처 공식 데이터 기반 의약품 정보 검색. 5만+ 의약품 + 무료 통합 API.</description>
    <language>ko-KR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${site}rss.xml" rel="self" type="application/rss+xml" />
${recent
  .map(({ d, date }) => {
    const link = `${site}약/${encodeURIComponent(d.itemSeq)}/`;
    const desc = (d.efcyQesitm ?? `${d.itemName} 의 효능, 부작용, 주의사항 등 식약처 공식 정보`).slice(0, 200);
    return `    <item>
      <title>${escapeXml(d.itemName)}</title>
      <link>${link}</link>
      <description>${escapeXml(desc)}</description>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${fmtRFC822(date)}</pubDate>
      <category>${escapeXml(d.entpName ?? '의약품')}</category>
    </item>`;
  })
  .join('\n')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
