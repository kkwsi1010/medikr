import type { APIRoute } from 'astro';
import { getDurTaboos } from '../../../lib/mfds';

// SSR endpoint — 매 요청 식약처 API 호출 + 24h 캐시
// (prerender 안 함: 5만 약 × 3초 = 빌드 timeout)
export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const taboos = await getDurTaboos(params.itemSeq!).catch(() => []);
  return new Response(
    JSON.stringify(
      taboos.map((t) => ({
        seq: t.MIXTURE_ITEM_SEQ ?? '',
        name: t.MIXTURE_ITEM_NAME ?? '',
        reason: t.PROHBT_CONTENT ?? '',
        ingredient: t.MIXTURE_INGR_KOR_NAME ?? '',
      }))
    ),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    }
  );
};
