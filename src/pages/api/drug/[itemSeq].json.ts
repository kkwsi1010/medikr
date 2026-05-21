import type { APIRoute } from 'astro';
import { getEasyDrug, getPillIdent, getDrugPermit } from '../../../lib/mfds';

// SSR endpoint — 매 요청 식약처 API 호출 + 24h 캐시
// (prerender 안 함: 5만 약 prerender 시 빌드 timeout)
export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const seq = params.itemSeq!;
  const [d, p, pm] = await Promise.all([
    getEasyDrug(seq),
    getPillIdent(seq),
    getDrugPermit(seq),
  ]);
  if (!d) return new Response('{}', { status: 404 });
  const payload = {
    s: d.itemSeq,
    n: d.itemName,
    e: d.entpName,
    efcy: d.efcyQesitm ?? '',
    use: d.useMethodQesitm ?? '',
    atpn: d.atpnQesitm ?? '',
    warn: d.atpnWarnQesitm ?? '',
    intrc: d.intrcQesitm ?? '',
    se: d.seQesitm ?? '',
    deposit: d.depositMethodQesitm ?? '',
    image: d.itemImage || p?.ITEM_IMAGE || '',
    shape: p?.DRUG_SHAPE ?? '',
    color: [p?.COLOR_CLASS1, p?.COLOR_CLASS2].filter(Boolean).join(', '),
    cls: p?.CLASS_NAME ?? '',
    etc: p?.ETC_OTC_NAME ?? '',
    ing: pm?.ITEM_INGR_NAME ?? '',
    permit: pm?.ITEM_PERMIT_DATE ?? '',
  };
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};
