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

export async function getDurTaboos(itemSeq: string): Promise<DurTaboo[]> {
  const { items } = await fetchApi<DurTaboo>('DURPrdlstInfoService03', 'getUsjntTabooInfoList03', {
    itemSeq,
  });
  return items;
}
