// 빌드 전 색인 생성 — 5만 약 데이터를 prefetchAll() 로 가져와서 정적 JSON 색인 생성
// SSR 시 약 페이지가 식약처 API 1건만 호출하면서도 같은 성분/분류/제약사 추천 유지
import fs from 'node:fs';
import path from 'node:path';

// scripts 디렉터리에서 실행되므로 .. 으로 src/lib/mfds 임포트
import { fetchAll, type EasyDrug, type PillIdent, type DrugPermit } from '../src/lib/mfds.ts';

const OUT_DIR = path.join(process.cwd(), 'src', 'data');
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log('[build-index] 식약처 5만 약 색인 생성 시작...');
const t0 = Date.now();

// 5만 약 전체 fetch (병렬 8 concurrent → 약 3분)
const [drugs, pills, permits] = await Promise.all([
  fetchAll<EasyDrug>('DrbEasyDrugInfoService', 'getDrbEasyDrugList', {}, 500),
  fetchAll<PillIdent>('MdcinGrnIdntfcInfoService03', 'getMdcinGrnIdntfcInfoList03', {}, 500),
  fetchAll<DrugPermit>('DrugPrdtPrmsnInfoService07', 'getDrugPrdtPrmsnInq07', {}, 600),
]);

console.log(`  e약은요 ${drugs.length}, 낱알 ${pills.length}, 허가 ${permits.length}`);

// 진단: 받은 permits 의 ITEM_PERMIT_DATE 분포 (최근 누락 여부 확인)
{
  const dates = permits.map((p) => p.ITEM_PERMIT_DATE ?? '').filter(Boolean).sort();
  const max = dates[dates.length - 1];
  const min = dates[0];
  const after2026 = dates.filter((d) => d >= '20260101').length;
  const after2025h2 = dates.filter((d) => d >= '20250701').length;
  console.log(`  [permits diag] date ${min}~${max} / 2025-07+:${after2025h2} / 2026+:${after2026}`);
}

const pillMap = new Map(pills.map((p) => [p.ITEM_SEQ, p]));
const permitMap = new Map(permits.map((p) => [p.ITEM_SEQ, p]));

// 색인 1: itemSeq → itemName. 허가(43,247) + e약은요(4,754) 통합.
// ★ 식약처 허가 API 는 단건 조회가 안 됨(item_seq 필터 무시, 목록 첫 100건 반환).
//   → e약은요 없는 permit-only 약(최근 허가 대부분)은 단건 API 로 못 가져옴.
//   → 이 색인이 drug 페이지의 valid 게이트 + 이름 fallback 역할을 한다.
const drugNames: Record<string, string> = {};
for (const p of permits) if (p.ITEM_SEQ && p.ITEM_NAME) drugNames[p.ITEM_SEQ] = p.ITEM_NAME;
for (const d of drugs) drugNames[d.itemSeq] = d.itemName; // e약은요 이름 우선

// 색인 1b: permit-only 약 상세 (drug 페이지가 e약은요 없을 때 표시)
// e약은요 없는 약도 업체/허가일/성분/구분/허가번호 표시 → thin content 방지
const permitMeta: Record<string, { e: string; d: string; i: string; s: string; t: string; no: string }> = {};
for (const p of permits) {
  if (!p.ITEM_SEQ) continue;
  permitMeta[p.ITEM_SEQ] = {
    e: p.ENTP_NAME ?? '',
    d: p.ITEM_PERMIT_DATE ?? '',
    i: p.ITEM_INGR_NAME ?? '',
    s: p.SPCLTY_PBLC ?? '',
    t: p.PRDUCT_TYPE ?? '',
    no: p.PRDUCT_PRMISN_NO ?? '',
  };
}

// 색인 2: ingredient → itemSeq[]  (허가 전체 기준 — 관련약 풍부)
const ingredientIdx: Record<string, string[]> = {};
// 색인 3: class → itemSeq[]  (낱알 기준)
const classIdx: Record<string, string[]> = {};
// 색인 4: entp → itemSeq[]  (허가 전체 기준)
const entpIdx: Record<string, string[]> = {};
// 색인 5: 검색용 모든 약 [seq, name, entp]  (허가 전체)
const searchIdx: Array<[string, string, string]> = [];
// 색인 6: 인기 약 itemSeq (prerender 대상 후보)
const popularSeq: string[] = [];

// 관련약 색인은 각 키당 최대 12개만 (색인 파일 크기 폭증 방지, drug 페이지는 5개만 표시)
const CAP = 12;
for (const p of permits) {
  if (!p.ITEM_SEQ) continue;
  if (p.ITEM_INGR_NAME) {
    for (const ing of p.ITEM_INGR_NAME.split('/').map((s) => s.trim()).filter(Boolean)) {
      const arr = (ingredientIdx[ing] ??= []);
      if (arr.length < CAP) arr.push(p.ITEM_SEQ);
    }
  }
  if (p.ENTP_NAME) {
    const arr = (entpIdx[p.ENTP_NAME] ??= []);
    if (arr.length < CAP) arr.push(p.ITEM_SEQ);
  }
  searchIdx.push([p.ITEM_SEQ, p.ITEM_NAME, p.ENTP_NAME ?? '']);
}
for (const pill of pills) {
  if (!pill.ITEM_SEQ || !pill.CLASS_NAME) continue;
  const arr = (classIdx[pill.CLASS_NAME] ??= []);
  if (arr.length < CAP) arr.push(pill.ITEM_SEQ);
}

// 인기 약 정의: ITEM_PERMIT_DATE 내림차순 정렬 top 2000
const sortedByDate = [...permits].sort((a, b) =>
  (b.ITEM_PERMIT_DATE ?? '').localeCompare(a.ITEM_PERMIT_DATE ?? '')
);
for (const p of sortedByDate.slice(0, 2000)) popularSeq.push(p.ITEM_SEQ);

// 최근 허가 약 (홈 페이지 "최근 허가 의약품" 섹션용)
// e약은요 없는 약도 포함 (drug page 가 permit fallback 으로 표시)
type RecentPermit = { seq: string; name: string; entp: string; date: string };
const recentPermits: RecentPermit[] = [];
for (const p of sortedByDate) {
  if (recentPermits.length >= 100) break;
  const name = drugNames[p.ITEM_SEQ] ?? p.ITEM_NAME;
  if (!name) continue; // permit 자체에 이름이 없으면 skip
  recentPermits.push({
    seq: p.ITEM_SEQ,
    name,
    entp: p.ENTP_NAME ?? '',
    date: p.ITEM_PERMIT_DATE ?? '',
  });
}
fs.writeFileSync(path.join(OUT_DIR, 'recent-permits.json'), JSON.stringify(recentPermits));

// 색인 저장
fs.writeFileSync(path.join(OUT_DIR, 'drug-names.json'), JSON.stringify(drugNames));
fs.writeFileSync(path.join(OUT_DIR, 'permit-meta.json'), JSON.stringify(permitMeta));
fs.writeFileSync(path.join(OUT_DIR, 'ingredient-idx.json'), JSON.stringify(ingredientIdx));
fs.writeFileSync(path.join(OUT_DIR, 'class-idx.json'), JSON.stringify(classIdx));
fs.writeFileSync(path.join(OUT_DIR, 'entp-idx.json'), JSON.stringify(entpIdx));
fs.writeFileSync(path.join(OUT_DIR, 'search-idx.json'), JSON.stringify(searchIdx));
fs.writeFileSync(path.join(OUT_DIR, 'popular-seq.json'), JSON.stringify(popularSeq));

const sizes = {
  'drug-names': fs.statSync(path.join(OUT_DIR, 'drug-names.json')).size,
  'permit-meta': fs.statSync(path.join(OUT_DIR, 'permit-meta.json')).size,
  'ingredient-idx': fs.statSync(path.join(OUT_DIR, 'ingredient-idx.json')).size,
  'class-idx': fs.statSync(path.join(OUT_DIR, 'class-idx.json')).size,
  'entp-idx': fs.statSync(path.join(OUT_DIR, 'entp-idx.json')).size,
  'search-idx': fs.statSync(path.join(OUT_DIR, 'search-idx.json')).size,
  'popular-seq': fs.statSync(path.join(OUT_DIR, 'popular-seq.json')).size,
  'recent-permits': fs.statSync(path.join(OUT_DIR, 'recent-permits.json')).size,
};
const totalKB = Object.values(sizes).reduce((a, b) => a + b, 0) / 1024;

console.log(`[build-index] 완료 ${(Date.now() - t0) / 1000}s, 합계 ${totalKB.toFixed(0)}KB`);
console.log('  파일:', JSON.stringify(Object.fromEntries(
  Object.entries(sizes).map(([k, v]) => [k, `${(v / 1024).toFixed(0)}KB`])
), null, 2));
