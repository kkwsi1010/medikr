import type { APIContext } from 'astro';
import sampleRaw from '../data/prefetch-sample.json';

// 예전에는 prefetchAll() 로 빌드 중에 식약처 API 를 불렀다.
// API 가 죽은 날 RSS 가 빈 채로 배포되므로 build-index 가 떨군 샘플을 쓴다.
type Sample = { seq: string; name: string; entp: string; ingr: string; date: string; efcy: string };

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
  // 허가일자 desc 정렬, 최근 50개
  const recent = [...(sampleRaw as Sample[])]
    .map((d) => ({ d, date: d.date }))
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
    const link = `${site}약/${encodeURIComponent(d.seq)}/`;
    const desc = (d.efcy || `${d.name} 의 효능, 부작용, 주의사항 등 식약처 공식 정보`).slice(0, 200);
    return `    <item>
      <title>${escapeXml(d.name)}</title>
      <link>${link}</link>
      <description>${escapeXml(desc)}</description>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${fmtRFC822(date)}</pubDate>
      <category>${escapeXml(d.entp || '의약품')}</category>
    </item>`;
  })
  .join('\n')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
