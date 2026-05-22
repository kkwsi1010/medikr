// 클라이언트 beacon 방식으로 변경됨 — 카운트는 /api/visit.json 에서 처리
// middleware 는 비워둠 (추후 다른 처리 필요 시 사용)
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (_context, next) => {
  return next();
});
