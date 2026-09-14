import type { APIRoute } from 'astro';

// 빌드 수집 전용 식약처 API 중계.
//
// data.go.kr 이 GitHub Actions 러너 IP 를 막는다. 2026-09-12 저녁부터 러너에서는
// 'fetch failed' 가 32시간 넘게 이어졌는데, 같은 시각 한국 IP 와 이 Cloudflare
// 런타임(/api/drug/*.json, cf-cache-status: DYNAMIC)에서는 정상 응답했다.
// 그래서 러너는 여기로 요청하고 여기서 data.go.kr 로 넘긴다.
//
// 공개 중계기가 되면 안 된다. 누구나 medikr.kr 을 경유해 data.go.kr 의 IP 차단을
// 우회하고 Cloudflare 무료 한도를 소모할 수 있게 되기 때문이다. 그래서:
//   1. GitHub 시크릿과 Cloudflare Pages 시크릿에 같은 MFDS_RELAY_SECRET 을 두고
//      x-relay-secret 헤더가 일치할 때만 넘긴다. 시크릿이 없으면 전부 거부한다.
//   2. 경로는 1471000 아래 '서비스/엔드포인트' 두 단어만 허용한다.
//   3. 거부할 때는 존재 자체를 드러내지 않도록 404 로 답한다.
//
// serviceKey 는 호출자가 쿼리에 실어 보낸다. 이 엔드포인트는 식약처 키를 들고
// 있지 않다. 시크릿은 vite define 으로 번들에 박지 않고 런타임 env 로만 읽는다.
// dist 가 공개 레포의 Actions 아티팩트로 올라가기 때문이다.
export const prerender = false;

const UPSTREAM = 'https://apis.data.go.kr/1471000';
const PATH_RE = /^[A-Za-z0-9]+\/[A-Za-z0-9]+$/;

function notFound(): Response {
  return new Response('Not Found', { status: 404 });
}

// 네트워크 너머 타이밍 공격은 사실상 불가능하지만 비용이 거의 없으니 상수 시간으로 비교한다.
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const secret: string | undefined = (locals as any).runtime?.env?.MFDS_RELAY_SECRET;
  const given = request.headers.get('x-relay-secret') ?? '';
  if (!secret || !sameSecret(given, secret)) return notFound();

  const path = params.path ?? '';
  if (!PATH_RE.test(path)) return notFound();

  const search = new URL(request.url).search;
  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}/${path}${search}`);
  } catch (e) {
    // 호출자(mfds.ts attemptFetch)는 5xx 를 재시도 대상으로 본다.
    return new Response(`upstream fetch failed: ${e instanceof Error ? e.message : String(e)}`, {
      status: 502,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      // 쿼리에 serviceKey 가 들어 있으므로 어떤 계층에서도 캐시하지 않는다.
      'cache-control': 'no-store',
    },
  });
};
