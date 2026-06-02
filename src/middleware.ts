import { defineMiddleware } from 'astro:middleware';

// drug 페이지는 매 요청 식약처 API 4개 호출(~3-7s). Pages Functions(SSR)는 기본 캐시 안 됨(DYNAMIC).
// → Workers Cache API(caches.default)로 edge 캐시. token 권한 불필요(코드 레벨).
// 첫 요청만 식약처 API 거치고 이후 HIT(ms). 일 단위 갱신 데이터라 충분.
export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  if (!path.startsWith('/drug/')) return next();

  // Cloudflare Workers global
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  if (!cache) return next();

  // query string 무시 — drug 페이지는 pathname 만으로 식별
  const cacheKey = new Request(new URL(path, context.url.origin).toString(), { method: 'GET' });

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const response = await next();
  // 200 응답만 캐시 (404 등 제외). drug 페이지가 Cache-Control: s-maxage=86400 제공 → 그 TTL 적용.
  if (response.status === 200) {
    const runtime = (context.locals as any).runtime;
    const toCache = response.clone();
    if (runtime?.ctx?.waitUntil) {
      runtime.ctx.waitUntil(cache.put(cacheKey, toCache));
    } else {
      try { await cache.put(cacheKey, toCache); } catch {}
    }
  }
  return response;
});
