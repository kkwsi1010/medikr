import type { APIRoute } from 'astro';
import { jsonResponse, corsHeaders } from '../../lib/api-cors';

// GET /api/stats.json — medikr 일별 / 누적 방문수
// SSR 페이지 방문만 카운트 (API / asset 제외)
export const prerender = false;

export const OPTIONS: APIRoute = () => new Response(null, { headers: corsHeaders });

export const GET: APIRoute = async ({ locals }) => {
  const env = (locals as any).runtime?.env;
  const db = env?.DB;
  if (!db) {
    return jsonResponse({ today: 0, total: 0, error: 'db_unavailable' });
  }
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = kstNow.toISOString().slice(0, 10);

  try {
    const [todayRow, totalRow] = await Promise.all([
      db.prepare('SELECT visit_cnt FROM tb_visit_stat WHERE visit_date = ?').bind(today).first(),
      db.prepare("SELECT SUM(visit_cnt) as total FROM tb_visit_stat WHERE delcheck='N'").first(),
    ]);
    return jsonResponse(
      {
        today: Number((todayRow as any)?.visit_cnt ?? 0),
        total: Number((totalRow as any)?.total ?? 0),
        date: today,
      },
      { cache: 60 } // 1분 캐시 (실시간 가까이)
    );
  } catch (e) {
    return jsonResponse({ today: 0, total: 0, error: String(e) });
  }
};
