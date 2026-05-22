import type { APIRoute } from 'astro';
import { corsHeaders } from '../../lib/api-cors';

// 클라이언트 beacon — 매 페이지뷰 마다 호출 (Layout 의 <script>)
// no-store 캐시 X — 매 요청 origin 도달 보장
export const prerender = false;

export const OPTIONS: APIRoute = () => new Response(null, { headers: corsHeaders });

const noCacheHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  ...corsHeaders,
};

async function increment(locals: any): Promise<void> {
  const db = (locals as any).runtime?.env?.DB;
  if (!db) return;
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const visitDate = kstNow.toISOString().slice(0, 10);
  const ts = kstNow.toISOString().slice(0, 19).replace('T', ' ');
  await db.prepare(
    `INSERT INTO tb_visit_stat (visit_date, visit_cnt, indate, inuser, moddate, moduser, delcheck)
     VALUES (?, 1, ?, 'system', ?, 'system', 'N')
     ON CONFLICT(visit_date) DO UPDATE SET
       visit_cnt = visit_cnt + 1,
       moddate = excluded.moddate`
  ).bind(visitDate, ts, ts).run().catch(() => {});
}

export const GET: APIRoute = async ({ locals }) => {
  await increment(locals);
  return new Response('{"ok":true}', { headers: noCacheHeaders });
};

export const POST: APIRoute = async ({ locals }) => {
  await increment(locals);
  return new Response('{"ok":true}', { headers: noCacheHeaders });
};
