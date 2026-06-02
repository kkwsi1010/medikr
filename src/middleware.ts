import { defineMiddleware } from 'astro:middleware';

// 캐시 일시 비활성화 — 빌드 간 Workers Cache 잔존(옛 500 응답 서빙) 격리용.
// 안정화 후 빌드 버전 키 방식으로 재도입 예정.
export const onRequest = defineMiddleware(async (_context, next) => {
  return next();
});
