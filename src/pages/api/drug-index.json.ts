import type { APIRoute } from 'astro';
import idx from '../../data/drug-index.json';
import { jsonResponse, corsHeaders } from '../../lib/api-cors';

// 헤더 자동완성용 e약은요 4,800여 건. 외부 API 풀 검색은 /api/search?q=... 사용
//
// output:'static' 이라 이 응답은 빌드 때 구워진다. 예전에는 여기서 prefetchAll()
// 로 식약처 API 를 불렀는데, API 가 죽은 날 빈 배열이 구워져서 모든 페이지의
// 헤더 검색이 조용히 죽었다. build-index 가 떨군 파일을 읽는다.
export const OPTIONS: APIRoute = () => new Response(null, { headers: corsHeaders });

export const GET: APIRoute = async () => jsonResponse(idx);
