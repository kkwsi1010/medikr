const KEY = import.meta.env.MFDS_API_KEY;
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

export async function getEasyDrug(itemSeq: string): Promise<EasyDrug | null> {
  const { items } = await fetchApi<EasyDrug>('DrbEasyDrugInfoService', 'getDrbEasyDrugList', { itemSeq });
  return items[0] ?? null;
}

export async function getPillIdent(itemSeq: string): Promise<PillIdent | null> {
  const { items } = await fetchApi<PillIdent>(
    'MdcinGrnIdntfcInfoService03',
    'getMdcinGrnIdntfcInfoList03',
    { item_seq: itemSeq }
  );
  return items[0] ?? null;
}

export async function getDrugPermit(itemSeq: string): Promise<DrugPermit | null> {
  const { items } = await fetchApi<DrugPermit>(
    'DrugPrdtPrmsnInfoService07',
    'getDrugPrdtPrmsnInq07',
    { item_seq: itemSeq }
  );
  return items[0] ?? null;
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
  maxPages = 500
): Promise<T[]> {
  const all: T[] = [];
  const PER = 100;
  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    const { items, totalCount } = await fetchApi<T>(service, endpoint, {
      ...extra,
      pageNo: String(pageNo),
      numOfRows: String(PER),
    });
    all.push(...items);
    if (items.length < PER || pageNo * PER >= totalCount) break;
  }
  return all;
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

export function prefetchAll(): Promise<PrefetchCache> {
  if (_prefetch) return _prefetch;
  _prefetch = (async () => {
    console.log('[mfds prefetch] e약은요 + 낱알식별 + 허가정보 다운로드 시작...');
    const t0 = Date.now();
    const [drugs, pills, permits] = await Promise.all([
      fetchAll<EasyDrug>('DrbEasyDrugInfoService', 'getDrbEasyDrugList'),
      fetchAll<PillIdent>('MdcinGrnIdntfcInfoService03', 'getMdcinGrnIdntfcInfoList03'),
      fetchAll<DrugPermit>('DrugPrdtPrmsnInfoService07', 'getDrugPrdtPrmsnInq07'),
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
