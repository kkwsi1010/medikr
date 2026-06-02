import { defineMiddleware } from 'astro:middleware';

// drug 페이지는 매 요청 식약처 API 4개 호출(~3-7s). Pages Functions(SSR)는 기본 캐시 안 됨(DYNAMIC).
// → Workers Cache API 로 edge 캐시. 단 cacheKey 에 빌드 버전(PUBLIC_CACHE_VERSION) 포함:
//   빌드마다 새 네임스페이스 → 옛 빌드의 잔존 응답(과거 500 등)을 절대 서빙하지 않음.
const CACHE_VER = (import.meta.env.PUBLIC_CACHE_VERSION as string | undefined) ?? 'dev';

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  if (!path.startsWith('/drug/')) return next();

  try {
    const cache = (globalThis as any).caches?.default as Cache | undefined;
    if (!cache) return next();

    const key = new Request(`https://medikr.kr/__c/${CACHE_VER}${path}`, { method: 'GET' });
    const hit = await cache.match(key);
    if (hit) return hit;

    const res = await next();
    // 200 만 캐시 (404/500 은 매번 실시간 → 잘못된 캐시 영구화 방지)
    if (res.status === 200) {
      const rt = (context.locals as any).runtime;
      if (rt?.ctx?.waitUntil) rt.ctx.waitUntil(cache.put(key, res.clone()));
    }
    return res;
  } catch {
    return next();
  }
});
