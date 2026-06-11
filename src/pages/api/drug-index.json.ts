import type { APIRoute } from 'astro';
import { prefetchAll } from '../../lib/mfds';
import { jsonResponse, corsHeaders } from '../../lib/api-cors';

// 헤더 자동완성용 — 가볍게 e약은요 4,800여 건만
// 외부 API 풀 검색은 /api/search?q=... 사용
export const OPTIONS: APIRoute = () => new Response(null, { headers: corsHeaders });

export const GET: APIRoute = async () => {
  const { drugs } = await prefetchAll();
  const idx = drugs.map((d) => ({ s: d.itemSeq, n: d.itemName, e: d.entpName }));
  return jsonResponse(idx);
};
