import type { APIRoute } from 'astro';
import { fetchAllRecalls, fetchAllDrugRecalls } from '../../lib/mfds';
import { jsonResponse, corsHeaders } from '../../lib/api-cors';

// GET /api/recall.json?type=food|drug|all&limit=50
// 식품 + 의약품 회수·판매중지 (식약처 공시) — Cloudflare edge 24h 캐시
export const prerender = false;

export const OPTIONS: APIRoute = () => new Response(null, { headers: corsHeaders });

export const GET: APIRoute = async ({ url }) => {
  const type = url.searchParams.get('type') ?? 'all';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 500);

  const [food, drug] = await Promise.all([
    type === 'drug' ? Promise.resolve([]) : fetchAllRecalls().catch(() => []),
    type === 'food' ? Promise.resolve([]) : fetchAllDrugRecalls().catch(() => []),
  ]);
  const merged = [...drug, ...food]
    .map((p) => ({
      // 의약품: PRDUCT/ENTRPS/RTRVL_RESN/RECALL_COMMAND_DATE
      // 식품: PRDTNM/BSSHNM/RTRVLPRVNS/CRET_DTM
      name: p.PRDUCT || p.PRDTNM || p.PRDT_NM || p.PRDLST_NM || p.ITEM_NAME || '',
      company: p.ENTRPS || p.BSSHNM || p.ENTP_NAME || '',
      reason: p.RTRVL_RESN || p.RTRVLPRVNS || p.RTRVL_CN || p.RECALL_REASON || p.REASON || '',
      date: p.RECALL_COMMAND_DATE || p.CRET_DTM || p.RTRVL_DT || p.RECALL_DATE || p.DATE || '',
      grade: p.RTRVL_GRDCD_NM || '',
      itemSeq: p.ITEM_SEQ || '',
    }))
    .slice(0, limit);
  return jsonResponse({ type, total: merged.length, results: merged });
};
