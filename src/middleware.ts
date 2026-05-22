import { defineMiddleware } from 'astro:middleware';

// SSR 페이지 마다 D1 visits 카운터 +1
// (정적 페이지에는 적용 안 됨 — middleware 는 SSR 시점만 실행)
export const onRequest = defineMiddleware(async (context, next) => {
  // D1 binding (Cloudflare Pages 환경에서만)
  const env = (context.locals as any).runtime?.env;
  const db = env?.DB as D1Database | undefined;

  // 봇 / asset / API 요청은 카운트 skip (사람 페이지뷰만)
  const path = context.url.pathname;
  const isPageView =
    !path.startsWith('/api/') &&
    !path.startsWith('/_astro/') &&
    !path.match(/\.(json|xml|txt|ico|png|jpg|css|js|svg|webp|woff2?)$/) &&
    !path.match(/^\/(favicon|manifest|robots|ads|sitemap)/);

  if (db && isPageView) {
    // KST 오늘 (UTC+9)
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const visitDate = kstNow.toISOString().slice(0, 10);   // 'YYYY-MM-DD'
    const ts = kstNow.toISOString().slice(0, 19).replace('T', ' '); // 'YYYY-MM-DD HH:MI:SS'
    // UPSERT — 같은 날짜 row 면 visit_cnt +1 + moddate 갱신
    db.prepare(
      `INSERT INTO tb_visit_stat (visit_date, visit_cnt, indate, inuser, moddate, moduser, delcheck)
       VALUES (?, 1, ?, 'system', ?, 'system', 'N')
       ON CONFLICT(visit_date) DO UPDATE SET
         visit_cnt = visit_cnt + 1,
         moddate = excluded.moddate`
    )
      .bind(visitDate, ts, ts)
      .run()
      .catch(() => {}); // 실패해도 페이지 응답 계속
  }

  return next();
});

// D1Database type (Cloudflare Workers runtime)
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  all(): Promise<{ results: unknown[] }>;
  first(): Promise<unknown>;
}
