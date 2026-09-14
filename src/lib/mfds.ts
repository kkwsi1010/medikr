// process.env.MFDS_API_KEY 는 astro.config.mjs 의 vite.define 으로 빌드 시 실제 값 inline
// Cloudflare Workers runtime (process 미정의 환경) 에서도 hardcoded 값 사용
// Node tsx (prebuild) 에서는 실제 process.env 객체
const KEY: string | undefined = process.env.MFDS_API_KEY || undefined;
const BASE = 'https://apis.data.go.kr/1471000';
const HAS_KEY = Boolean(KEY);

if (!HAS_KEY) {
  console.warn(
    '[mfds] MFDS_API_KEY not set — API calls return empty data. ' +
    'Set this env var in Cloudflare Pages Settings → Variables and Secrets.'
  );
}

export type EasyDrug = {
  itemSeq: string;
  itemName: string;
  entpName: string;
  efcyQesitm?: string;
  useMethodQesitm?: string;
  atpnQesitm?: string;
  atpnWarnQesitm?: string;
  intrcQesitm?: string;
  seQesitm?: string;
  depositMethodQesitm?: string;
  itemImage?: string;
};

export type PillIdent = {
  ITEM_SEQ: string;
  ITEM_NAME: string;
  ENTP_NAME: string;
  CHART: string;
  ITEM_IMAGE: string;
  DRUG_SHAPE: string;
  COLOR_CLASS1: string;
  COLOR_CLASS2?: string;
  PRINT_FRONT?: string;
  PRINT_BACK?: string;
  CLASS_NAME?: string;
  ETC_OTC_NAME?: string;
  FORM_CODE_NAME?: string;
};

export type DrugPermit = {
  ITEM_SEQ: string;
  ITEM_NAME: string;
  ITEM_ENG_NAME?: string;
  ENTP_NAME: string;
  ITEM_PERMIT_DATE?: string;
  SPCLTY_PBLC?: string;
  PRDUCT_TYPE?: string;
  PRDUCT_PRMISN_NO?: string;
  ITEM_INGR_NAME?: string;
  EDI_CODE?: string;
};

export type DurTaboo = {
  TYPE_NAME: string;
  INGR_KOR_NAME: string;
  ITEM_SEQ: string;
  ITEM_NAME: string;
  MIXTURE_ITEM_SEQ?: string;
  MIXTURE_ITEM_NAME?: string;
  MIXTURE_INGR_KOR_NAME?: string;
  PROHBT_CONTENT?: string;
  NOTIFICATION_DATE?: string;
};

type ApiResponse<T> = {
  header: { resultCode: string; resultMsg: string };
  body: { pageNo: number; totalCount: number; numOfRows: number; items: T[] };
};

async function fetchApi<T>(
  service: string,
  endpoint: string,
  params: Record<string, string> = {}
): Promise<{ items: T[]; totalCount: number }> {
  if (!HAS_KEY) {
    return { items: [], totalCount: 0 };
  }
  const query = new URLSearchParams({
    serviceKey: KEY!,
    type: 'json',
    pageNo: '1',
    numOfRows: '100',
    ...params,
  });
  const url = `${BASE}/${service}/${endpoint}?${query.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[mfds] HTTP ${res.status}: ${service}/${endpoint}`);
      return { items: [], totalCount: 0 };
    }
    const data = (await res.json()) as ApiResponse<T>;
    if (data.header?.resultCode !== '00') {
      console.warn(`[mfds] ${data.header?.resultMsg ?? 'unknown'}: ${service}/${endpoint}`);
      return { items: [], totalCount: 0 };
    }
    return {
      items: data.body?.items ?? [],
      totalCount: data.body?.totalCount ?? 0,
    };
  } catch (err) {
    console.warn(`[mfds] fetch failed for ${service}/${endpoint}:`, (err as Error).message);
    return { items: [], totalCount: 0 };
  }
}

export async function listEasyDrugs(pageNo = 1, numOfRows = 100) {
  return fetchApi<EasyDrug>('DrbEasyDrugInfoService', 'getDrbEasyDrugList', {
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
  });
}

// 식약처 API 는 매칭 안 되는 itemSeq 에 대해 빈 결과가 아니라 첫 항목을 반환하는 경우가 있어
// (존재하지 않는 약이 엉뚱한 약으로 200 응답 → soft-404/중복 양산),
// 반환된 약의 itemSeq 가 요청과 일치할 때만 인정한다.
export async function getEasyDrug(itemSeq: string): Promise<EasyDrug | null> {
  const { items } = await fetchApi<EasyDrug>('DrbEasyDrugInfoService', 'getDrbEasyDrugList', { itemSeq });
  const found = items.find((d) => String(d.itemSeq) === String(itemSeq));
  return found ?? null;
}

export async function getPillIdent(itemSeq: string): Promise<PillIdent | null> {
  const { items } = await fetchApi<PillIdent>(
    'MdcinGrnIdntfcInfoService03',
    'getMdcinGrnIdntfcInfoList03',
    { item_seq: itemSeq }
  );
  const found = items.find((p) => String(p.ITEM_SEQ) === String(itemSeq));
  return found ?? null;
}

export async function getDrugPermit(itemSeq: string): Promise<DrugPermit | null> {
  const { items } = await fetchApi<DrugPermit>(
    'DrugPrdtPrmsnInfoService07',
    'getDrugPrdtPrmsnInq07',
    { item_seq: itemSeq }
  );
  const found = items.find((p) => String(p.ITEM_SEQ) === String(itemSeq));
  return found ?? null;
}

const _durCache = new Map<string, Promise<DurTaboo[]>>();
export async function getDurTaboos(itemSeq: string): Promise<DurTaboo[]> {
  if (!_durCache.has(itemSeq)) {
    _durCache.set(
      itemSeq,
      fetchApi<DurTaboo>('DURPrdlstInfoService03', 'getUsjntTabooInfoList03', { itemSeq }).then(
        (r) => r.items
      )
    );
  }
  return _durCache.get(itemSeq)!;
}

// ─── 빌드 전용 prefetch 캐시 ─────────────────────────────
// 빌드 시 모든 데이터를 한 번에 다운로드 → 페이지마다 메모리 lookup
// 4,757 페이지를 페이지당 0 API 호출로 빌드 가능

type PrefetchCache = {
  drugs: EasyDrug[];
  drugMap: Map<string, EasyDrug>;
  pillMap: Map<string, PillIdent>;
  permitMap: Map<string, DrugPermit>;
};

let _prefetch: Promise<PrefetchCache> | null = null;

export async function fetchAll<T>(
  service: string,
  endpoint: string,
  extra: Record<string, string> = {},
  maxPages = 500,
  baseOverride?: string,
  // 빌드 수집을 Cloudflare 중계로 보낼 때 인증 헤더를 싣는다 (build-index 전용).
  // 여기서 process.env 를 직접 읽지 않는 이유: 이 파일은 Workers 런타임에도
  // 번들되는데 거기엔 process 가 없어서, vite define 으로 치환되지 않은 참조는
  // SSR 전체를 ReferenceError 로 죽인다. 값은 Node 에서 도는 호출자가 넘긴다.
  headers?: Record<string, string>
): Promise<T[]> {
  const PER = 100;
  const base = baseOverride ?? BASE;
  // 1페이지 먼저 가져와서 totalCount 확인 → 필요 페이지 수 계산
  const first = await fetchApiWithBase<T>(base, service, endpoint, {
    ...extra,
    pageNo: '1',
    numOfRows: String(PER),
  }, headers);
  if (first.items.length === 0) return [];
  const totalPages = Math.min(maxPages, Math.ceil(first.totalCount / PER));
  if (totalPages <= 1) return first.items;
  // 나머지 페이지는 8개씩 병렬 fetch
  const all: T[] = [...first.items];
  const CONCURRENCY = 8;
  for (let pageNo = 2; pageNo <= totalPages; pageNo += CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, totalPages - pageNo + 1) },
      (_, i) => pageNo + i
    );
    const results = await Promise.all(
      batch.map((pn) =>
        fetchApiWithBase<T>(base, service, endpoint, {
          ...extra,
          pageNo: String(pn),
          numOfRows: String(PER),
        }, headers)
      )
    );
    for (const r of results) all.push(...r.items);
    // 한 페이지라도 비면 끝
    if (results.some((r) => r.items.length < PER)) break;
  }
  return all;
}

// 실패를 조용히 빈 배열로 넘기면 빌드가 초록불인 채로 빈 색인·사이트맵이 배포된다.
// (2026-08 실제 사고: 9일 연속 success 로 약 43,229 URL 이 사이트맵에서 사라짐)
// → 원인을 반드시 stderr 로 남긴다. serviceKey 는 절대 로그에 넣지 않는다.
function logMfdsFail(service: string, endpoint: string, reason: string): void {
  console.error(`[mfds] FAIL ${service}/${endpoint} — ${reason}`);
}

// data.go.kr 게이트웨이 오류는 서비스 응답과 형태가 다르고 HTTP 200 으로도 온다.
// { OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg, returnAuthMsg, returnReasonCode } } }
type GatewayHeader = { errMsg: string; returnAuthMsg: string; returnReasonCode: string };

function gatewayErrorHeader(data: unknown): GatewayHeader | null {
  const h = (data as { OpenAPI_ServiceResponse?: { cmmMsgHeader?: Partial<GatewayHeader> } })
    ?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (!h) return null;
  return {
    errMsg: h.errMsg ?? '(없음)',
    returnAuthMsg: h.returnAuthMsg ?? '(없음)',
    returnReasonCode: h.returnReasonCode ?? '(없음)',
  };
}

// 일시적 오류(네트워크 끊김, 5xx, 순간 호출제한)는 재시도로 스스로 복구된다.
// 키 미등록(30)·기한만료(31)·IP 미등록(32)은 재시도해도 절대 안 풀리므로 즉시 포기한다.
const RETRY_MAX = 3;
const RETRY_BASE_MS = 1000;
const PERMANENT_GATEWAY_CODES = new Set(['30', '31', '32']);

type FetchOutcome<T> =
  | { ok: true; items: T[]; totalCount: number }
  | { ok: false; reason: string; retryable: boolean };

async function attemptFetch<T>(url: string, headers?: Record<string, string>): Promise<FetchOutcome<T>> {
  try {
    const res = await fetch(url, headers ? { headers } : undefined);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        reason: `HTTP ${res.status} ${body.slice(0, 300)}`,
        retryable: res.status === 429 || res.status >= 500,
      };
    }
    const data = (await res.json()) as ApiResponse<T>;
    const gw = gatewayErrorHeader(data);
    if (gw) {
      return {
        ok: false,
        reason: `게이트웨이 오류 code=${gw.returnReasonCode} ${gw.errMsg} (${gw.returnAuthMsg})`,
        retryable: !PERMANENT_GATEWAY_CODES.has(gw.returnReasonCode),
      };
    }
    if (data.header?.resultCode !== '00') {
      return {
        ok: false,
        reason: `resultCode=${data.header?.resultCode ?? '(없음)'} resultMsg=${data.header?.resultMsg ?? '(없음)'}`,
        retryable: false,
      };
    }
    return { ok: true, items: data.body?.items ?? [], totalCount: data.body?.totalCount ?? 0 };
  } catch (e) {
    return {
      ok: false,
      reason: `예외 ${e instanceof Error ? e.message : String(e)}`,
      retryable: true,
    };
  }
}

async function fetchApiWithBase<T>(
  base: string,
  service: string,
  endpoint: string,
  params: Record<string, string> = {},
  headers?: Record<string, string>
): Promise<{ items: T[]; totalCount: number }> {
  if (!HAS_KEY) {
    logMfdsFail(service, endpoint, 'MFDS_API_KEY 미설정');
    return { items: [], totalCount: 0 };
  }
  const query = new URLSearchParams({
    serviceKey: KEY!,
    type: 'json',
    pageNo: '1',
    numOfRows: '100',
    ...params,
  });
  const url = `${base}/${service}/${endpoint}?${query.toString()}`;
  let lastReason = '(원인 미상)';
  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    const r = await attemptFetch<T>(url, headers);
    if (r.ok) return { items: r.items, totalCount: r.totalCount };
    lastReason = r.reason;
    if (!r.retryable || attempt === RETRY_MAX) break;
    const waitMs = RETRY_BASE_MS * attempt;
    console.warn(`[mfds] retry ${attempt}/${RETRY_MAX - 1} ${service}/${endpoint} ${waitMs}ms — ${r.reason}`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  logMfdsFail(service, endpoint, lastReason);
  return { items: [], totalCount: 0 };
}

// DUR 카테고리별 전체 fetch (페이지별 prefetch)
export type DurEntry = {
  ITEM_SEQ: string;
  ITEM_NAME: string;
  ENTP_NAME: string;
  INGR_KOR_NAME?: string;
  PROHBT_CONTENT?: string;
  NOTIFICATION_DATE?: string;
  PREGNANCY_LEVEL?: string;       // pwnm 등급 (1: 절대금기, 2: 잠재위험)
  AGE_BASE?: string;              // 연령기준
};

let _pwnmCache: Promise<DurEntry[]> | null = null;
export function fetchAllPwnmTaboos(): Promise<DurEntry[]> {
  if (_pwnmCache) return _pwnmCache;
  _pwnmCache = fetchAll<DurEntry>('DURPrdlstInfoService03', 'getPwnmTabooInfoList03');
  return _pwnmCache;
}

let _odsnCache: Promise<DurEntry[]> | null = null;
export function fetchAllOdsnAtent(): Promise<DurEntry[]> {
  if (_odsnCache) return _odsnCache;
  _odsnCache = fetchAll<DurEntry>('DURPrdlstInfoService03', 'getOdsnAtentInfoList03');
  return _odsnCache;
}

let _ageCache: Promise<DurEntry[]> | null = null;
export function fetchAllAgeTaboos(): Promise<DurEntry[]> {
  if (_ageCache) return _ageCache;
  _ageCache = fetchAll<DurEntry>('DURPrdlstInfoService03', 'getSpcifyAgrdeTabooInfoList03');
  return _ageCache;
}

// ─── Phase F: 추가 카테고리 (사용자 endpoint 정확 확인 후 정정 필요) ──
// TODO: 실제 신청 후 swagger 에서 정확한 service / endpoint 명 확인 → 아래 string 정정
//       graceful 처리 (fail 시 빈 배열) 이라 빌드는 항상 통과

export type GenericProduct = Record<string, string>;

// 화장품 제조판매업 (15020628) — 정정 완료
let _cosmeticCache: Promise<GenericProduct[]> | null = null;
export function fetchAllCosmetics(): Promise<GenericProduct[]> {
  if (_cosmeticCache) return _cosmeticCache;
  _cosmeticCache = fetchAll<GenericProduct>(
    'CsmtcsMfcrtrInfoService01', 'getCsmtcsMfcrtrInfoList01', {}, 30
  );
  return _cosmeticCache;
}

// 기능성화장품 보고품목 (15095680) — 정정 완료
let _functionalCosmeticCache: Promise<GenericProduct[]> | null = null;
export function fetchAllFunctionalCosmetics(): Promise<GenericProduct[]> {
  if (_functionalCosmeticCache) return _functionalCosmeticCache;
  _functionalCosmeticCache = fetchAll<GenericProduct>(
    'FtnltCosmRptPrdlstInfoService', 'getRptPrdlstInq', {}, 30
  );
  return _functionalCosmeticCache;
}

// 화장품 원료성분정보 (15111774) — 신규
let _cosmeticIngredientCache: Promise<GenericProduct[]> | null = null;
export function fetchAllCosmeticIngredients(): Promise<GenericProduct[]> {
  if (_cosmeticIngredientCache) return _cosmeticIngredientCache;
  _cosmeticIngredientCache = fetchAll<GenericProduct>(
    'CsmtcsIngdCpntInfoService01', 'getCsmtcsIngdCpntInfoService01', {}, 30
  );
  return _cosmeticIngredientCache;
}

// 의료기기 (15073906) — 정정 완료
let _mdCache: Promise<GenericProduct[]> | null = null;
export function fetchAllMedicalDevices(): Promise<GenericProduct[]> {
  if (_mdCache) return _mdCache;
  _mdCache = fetchAll<GenericProduct>(
    'MdeqPrdlstInfoService02', 'getMdeqPrdlstInfoInq02', {}, 50
  );
  return _mdCache;
}

// 건강기능식품 (15056760) — 정정 완료
let _htfsCache: Promise<GenericProduct[]> | null = null;
export function fetchAllHealthFunctionalFoods(): Promise<GenericProduct[]> {
  if (_htfsCache) return _htfsCache;
  _htfsCache = fetchAll<GenericProduct>('HtfsInfoService03', 'getHtfsList01', {}, 50);
  return _htfsCache;
}

// 한약(생약) (15076330) — 정정 완료, 다른 base 도메인 (1471057)
let _herbalCache: Promise<GenericProduct[]> | null = null;
export function fetchAllHerbalMedicines(): Promise<GenericProduct[]> {
  if (_herbalCache) return _herbalCache;
  _herbalCache = fetchAll<GenericProduct>(
    'HerbMdntfService', 'getMdntf', {}, 30,
    'https://apis.data.go.kr/1471057'
  );
  return _herbalCache;
}

// 의약품 회수·판매중지 (15059114) — 응답 wrapping {item: {...}} unwrap
let _drugRecallCache: Promise<GenericProduct[]> | null = null;
export function fetchAllDrugRecalls(): Promise<GenericProduct[]> {
  if (_drugRecallCache) return _drugRecallCache;
  _drugRecallCache = fetchAll<{ item: GenericProduct } | GenericProduct>(
    'MdcinRtrvlSleStpgeInfoService04', 'getMdcinRtrvlSleStpgelList03', {}, 30
  ).then((items) =>
    items.map((i) => ('item' in i && i.item ? i.item : (i as GenericProduct)))
  );
  return _drugRecallCache;
}

// 식품 회수 (15074318, I0490) — 식품안전나라 API (별도 도메인 + 별도 URL 패턴)
// URL: http://openapi.foodsafetykorea.go.kr/api/{KEY}/I0490/json/{startIdx}/{endIdx}
// 인증키: 식약처 일반 키와 같은 키 일 수도, 별도 일 수도 (시도 후 확인)
const FOODSAFETY_BASE = 'http://openapi.foodsafetykorea.go.kr/api';

async function fetchFoodSafetyApi(serviceId: string, perPage = 100, maxPages = 20): Promise<GenericProduct[]> {
  if (!HAS_KEY) return [];
  const all: GenericProduct[] = [];
  const CONCURRENCY = 5;
  let stopped = false;
  for (let pageStart = 0; pageStart < maxPages && !stopped; pageStart += CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, maxPages - pageStart) },
      (_, i) => pageStart + i
    );
    const results = await Promise.all(
      batch.map(async (page) => {
        const start = page * perPage + 1;
        const end = start + perPage - 1;
        try {
          const res = await fetch(`${FOODSAFETY_BASE}/${KEY}/${serviceId}/json/${start}/${end}`);
          if (!res.ok) return [] as GenericProduct[];
          const data = await res.json();
          return (data[serviceId]?.row ?? []) as GenericProduct[];
        } catch {
          return [] as GenericProduct[];
        }
      })
    );
    for (const rows of results) {
      all.push(...rows);
      if (rows.length < perPage) stopped = true;
    }
  }
  return all;
}

let _foodRecallCache: Promise<GenericProduct[]> | null = null;
export function fetchAllRecalls(): Promise<GenericProduct[]> {
  if (_foodRecallCache) return _foodRecallCache;
  _foodRecallCache = fetchFoodSafetyApi('I0490', 100, 20);
  return _foodRecallCache;
}

// 식품영양성분DB (15127578) — 정정 완료. endpoint 명 추정 (참고문서 xlsx 확인 후 정정 필요)
let _foodNutritionCache: Promise<GenericProduct[]> | null = null;
export function fetchAllFoodNutrition(): Promise<GenericProduct[]> {
  if (_foodNutritionCache) return _foodNutritionCache;
  _foodNutritionCache = fetchAll<GenericProduct>(
    'FoodNtrCpntDbInfo02', 'getFoodNtrCpntDbInq02', {}, 30
  );
  return _foodNutritionCache;
}

export function prefetchAll(): Promise<PrefetchCache> {
  if (_prefetch) return _prefetch;
  _prefetch = (async () => {
    console.log('[mfds prefetch] e약은요 + 낱알식별 + 허가정보 다운로드 시작...');
    const t0 = Date.now();
    // D 옵션 (hybrid SSR): prefetchAll 은 정적 dynamic 페이지 (성분/분류/제약사/[slug]) 가 사용
    // 정적 페이지 수 줄이려고 500 약만. 약 [itemSeq] SSR 은 별도 색인 (5만 약) lookup.
    const [drugs, pills, permits] = await Promise.all([
      fetchAll<EasyDrug>('DrbEasyDrugInfoService', 'getDrbEasyDrugList', {}, 5),
      fetchAll<PillIdent>('MdcinGrnIdntfcInfoService03', 'getMdcinGrnIdntfcInfoList03', {}, 5),
      fetchAll<DrugPermit>('DrugPrdtPrmsnInfoService07', 'getDrugPrdtPrmsnInq07', {}, 5),
    ]);
    const drugMap = new Map(drugs.map((d) => [d.itemSeq, d]));
    const pillMap = new Map(pills.map((p) => [p.ITEM_SEQ, p]));
    const permitMap = new Map(permits.map((p) => [p.ITEM_SEQ, p]));
    console.log(
      `[mfds prefetch] ${drugs.length} e약은요, ${pills.length} 낱알, ${permits.length} 허가 — ${(Date.now() - t0) / 1000}s`
    );
    return { drugs, drugMap, pillMap, permitMap };
  })();
  return _prefetch;
}
