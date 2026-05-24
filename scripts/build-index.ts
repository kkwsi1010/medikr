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

// 색인 1: itemSeq → itemName (룩업용)
const drugNames: Record<string, string> = {};
for (const d of drugs) drugNames[d.itemSeq] = d.itemName;

// 색인 2: ingredient → itemSeq[]
const ingredientIdx: Record<string, string[]> = {};
// 색인 3: class → itemSeq[]
const classIdx: Record<string, string[]> = {};
// 색인 4: entp → itemSeq[]
const entpIdx: Record<string, string[]> = {};
// 색인 5: 검색용 모든 약 [seq, name, entp]
const searchIdx: Array<[string, string, string]> = [];
// 색인 6: 인기 약 itemSeq (prerender 대상 후보)
const popularSeq: string[] = [];

for (const d of drugs) {
  const permit = permitMap.get(d.itemSeq);
  const pill = pillMap.get(d.itemSeq);
  if (permit?.ITEM_INGR_NAME) {
    for (const ing of permit.ITEM_INGR_NAME.split('/').map((s) => s.trim()).filter(Boolean)) {
      (ingredientIdx[ing] ??= []).push(d.itemSeq);
    }
  }
  if (pill?.CLASS_NAME) {
    (classIdx[pill.CLASS_NAME] ??= []).push(d.itemSeq);
  }
  if (d.entpName) {
    (entpIdx[d.entpName] ??= []).push(d.itemSeq);
  }
  searchIdx.push([d.itemSeq, d.itemName, d.entpName ?? '']);
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
fs.writeFileSync(path.join(OUT_DIR, 'ingredient-idx.json'), JSON.stringify(ingredientIdx));
fs.writeFileSync(path.join(OUT_DIR, 'class-idx.json'), JSON.stringify(classIdx));
fs.writeFileSync(path.join(OUT_DIR, 'entp-idx.json'), JSON.stringify(entpIdx));
fs.writeFileSync(path.join(OUT_DIR, 'search-idx.json'), JSON.stringify(searchIdx));
fs.writeFileSync(path.join(OUT_DIR, 'popular-seq.json'), JSON.stringify(popularSeq));

const sizes = {
  'drug-names': fs.statSync(path.join(OUT_DIR, 'drug-names.json')).size,
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
