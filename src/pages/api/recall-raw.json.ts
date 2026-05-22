import type { APIRoute } from 'astro';
import { fetchAllDrugRecalls } from '../../lib/mfds';
import { jsonResponse, corsHeaders } from '../../lib/api-cors';

// 임시 디버그: 의약품 회수 raw response 확인용 (field name 매핑 확인)
export const prerender = false;
export const OPTIONS: APIRoute = () => new Response(null, { headers: corsHeaders });

export const GET: APIRoute = async () => {
  const data = await fetchAllDrugRecalls().catch((e) => ({ error: String(e) }));
  const sample = Array.isArray(data) ? data.slice(0, 2) : data;
  return jsonResponse({ count: Array.isArray(data) ? data.length : 0, sample });
};
