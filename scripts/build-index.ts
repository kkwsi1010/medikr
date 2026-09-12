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
//
// 짧은 장애로 매일 빌드가 통째로 죽지 않도록, 규모 미달이면 몇 분 쉬고 통째로 다시 수집한다.
// (2026-08-18 06:20 KST 사고: apis.data.go.kr 연결이 2분 넘게 안 돼 3개 서비스 전부
//  'fetch failed'. mfds 재시도 창이 3초뿐이라 1차와 자동재실행이 같은 장애 구간에 걸려 죽었다.)
// 재수집으로도 못 채우면 아래 '빈 데이터 배포 차단' 게이트가 빌드를 종료시킨다.
const MIN_SIZE = { permits: 20000, drugs: 2000, pills: 10000 };
const RECOLLECT_WAIT_MS = [2 * 60_000, 5 * 60_000];

async function collect() {
  const [drugs, pills, permits] = await Promise.all([
    fetchAll<EasyDrug>('DrbEasyDrugInfoService', 'getDrbEasyDrugList', {}, 500),
    fetchAll<PillIdent>('MdcinGrnIdntfcInfoService03', 'getMdcinGrnIdntfcInfoList03', {}, 500),
    fetchAll<DrugPermit>('DrugPrdtPrmsnInfoService07', 'getDrugPrdtPrmsnInq07', {}, 600),
  ]);
  console.log(`  e약은요 ${drugs.length}, 낱알 ${pills.length}, 허가 ${permits.length}`);
  return { drugs, pills, permits };
}

function isShort(c: Awaited<ReturnType<typeof collect>>): boolean {
  return (
    c.permits.length < MIN_SIZE.permits ||
    c.drugs.length < MIN_SIZE.drugs ||
    c.pills.length < MIN_SIZE.pills
  );
}

// 워크플로우의 actions/cache 가 빌드 전에 직전 성공 색인을 복원해 둔다.
// 그것이 쓸 만한지 본다. 약 수가 기준 이상이고 D1 seed, sitemap, 샘플까지
// 갖춰져 있어야 그대로 배포해도 사이트가 멀쩡하다.
function snapshotDrugCount(): number {
  try {
    const raw = fs.readFileSync(path.join(OUT_DIR, 'drug-names.json'), 'utf-8');
    return Object.keys(JSON.parse(raw) as Record<string, string>).length;
  } catch {
    return 0;
  }
}
function hasUsableSnapshot(): boolean {
  const required = [
    path.join(process.cwd(), 'migrations', 'seed-drugs.sql'),
    path.join(process.cwd(), 'public', 'sitemap.xml'),
    path.join(OUT_DIR, 'prefetch-sample.json'),
    path.join(OUT_DIR, 'drug-index.json'),
  ];
  if (required.some((f) => !fs.existsSync(f))) return false;
  return snapshotDrugCount() >= MIN_SIZE.permits;
}

let collected = await collect();
for (const waitMs of RECOLLECT_WAIT_MS) {
  if (!isShort(collected)) break;
  console.warn(`[build-index] 수집 부족. ${waitMs / 60_000}분 뒤 재수집`);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  collected = await collect();
}

// 수집이 끝내 실패했는데 직전 성공 색인이 남아 있으면 그것으로 배포한다.
// 식약처 API 는 GitHub 러너에서 간헐적으로 막힌다 (2026-08-18 약 2분,
// 09-08 약 18분, 09-09 60분 이상). 허가 목록은 하루 이틀 묵어도 되는
// 데이터라, 배포를 통째로 멈추는 것보다 어제 색인으로 내보내는 편이 낫다.
// 빈 데이터를 막는다는 원래 목적은 그대로다. 스냅샷이 없거나 규모 미달이면
// 아래 '빈 데이터 배포 차단' 게이트가 그대로 빌드를 죽인다.
if (isShort(collected) && hasUsableSnapshot()) {
  console.warn('[build-index] 수집 실패. 직전 성공 색인을 그대로 사용한다.');
  console.warn(`  색인 약 ${snapshotDrugCount()} 종. 재생성 없이 astro build 로 넘어간다.`);
  console.warn('  데이터만 묵은 것이고 사이트는 정상 배포된다.');
  process.exit(0);
}

const { drugs, pills, permits } = collected;

// ─── 빈 데이터 배포 차단 ──────────────────────────────────
// 식약처 API 가 실패해도 fetchAll 은 빈 배열을 돌려주므로 빌드가 그냥 통과한다.
// 그대로 두면 (1) sitemap 이 43,229 → 0 으로 덮이고 (2) D1 seed 가 기존 행을
// NULL 로 INSERT OR REPLACE 해서 멀쩡한 캐시까지 망가진다. (2026-08 실제 사고)
// → 데이터가 정상 규모가 아니면 여기서 빌드를 죽여 배포 자체를 막는다.
{
  const MIN = { permits: 20000, drugs: 2000, pills: 10000 };
  const actual = { permits: permits.length, drugs: drugs.length, pills: pills.length };
  const short = (Object.keys(MIN) as Array<keyof typeof MIN>).filter((k) => actual[k] < MIN[k]);
  if (short.length > 0) {
    console.error('[build-index] 중단 — 식약처 데이터가 정상 규모가 아닙니다.');
    for (const k of short) console.error(`  ${k}: ${actual[k]} (최소 ${MIN[k]})`);
    console.error('  위 [mfds] FAIL 로그에서 원인(키 만료/트래픽 초과 등)을 확인하세요.');
    console.error('  이대로 배포하면 사이트맵과 D1 캐시가 빈 값으로 덮어써집니다.');
    process.exit(1);
  }
}

// 진단: 받은 permits 의 ITEM_PERMIT_DATE 분포 (최근 누락 여부 확인)
{
  const dates = permits.map((p) => p.ITEM_PERMIT_DATE ?? '').filter(Boolean).sort();
  const max = dates[dates.length - 1];
  const min = dates[0];
  const after2026 = dates.filter((d) => d >= '20260101').length;
  const after2025h2 = dates.filter((d) => d >= '20250701').length;
  console.log(`  [permits diag] date ${min}~${max} / 2025-07+:${after2025h2} / 2026+:${after2026}`);
}

const drugMap = new Map(drugs.map((d) => [d.itemSeq, d]));
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

// 홈, 검색, RSS 가 쓰는 500 약 샘플.
// 예전에는 이 세 페이지가 빌드 중에 prefetchAll() 로 식약처 API 를 다시 불렀다.
// 그러면 API 가 죽은 날 검색 페이지가 빈 목록으로 배포된다. 직전 색인을
// 재사용하는 의미가 없어지므로 여기서 파일로 떨궈 빌드가 API 에 의존하지 않게 한다.
// 내용과 순서는 prefetchAll() 이 주던 것과 같다 (e약은요 앞에서 500개).
const prefetchSample = drugs.slice(0, 500).map((d) => ({
  seq: d.itemSeq,
  name: d.itemName,
  entp: d.entpName,
  ingr: permitMap.get(d.itemSeq)?.ITEM_INGR_NAME ?? '',
  date: permitMap.get(d.itemSeq)?.ITEM_PERMIT_DATE ?? '',
  efcy: (d.efcyQesitm ?? '').slice(0, 300),
}));
fs.writeFileSync(path.join(OUT_DIR, 'prefetch-sample.json'), JSON.stringify(prefetchSample));

// 헤더 검색 자동완성용 e약은요 전체 목록.
// /api/drug-index.json 은 output:'static' 이라 빌드 때 구워진다. 예전에는 그
// 엔드포인트가 prefetchAll() 을 불렀는데, API 가 죽은 날 빈 배열이 구워져서
// 모든 페이지의 헤더 검색이 조용히 죽는다. 여기서 파일로 떨군다.
const drugIndex = drugs.map((d) => ({ s: d.itemSeq, n: d.itemName, e: d.entpName }));
fs.writeFileSync(path.join(OUT_DIR, 'drug-index.json'), JSON.stringify(drugIndex));

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

// ─── 약 sitemap 분할 (정적 파일) ─────────────────────────
// 단일 5.66MB sitemap 은 Google 이 '가져올 수 없음' → 15,000개씩 정적 파일로 분할.
// SSR 동적 라우트는 파일/디렉토리 이름 충돌로 불안정 → public/ 정적 파일로 생성.
// public/sitemap.xml(index) 이 정적 8페이지(sitemap-0.xml) + 약 분할들을 가리킴.
{
  const PER = 15000;
  const PUB = path.join(process.cwd(), 'public');
  const chunks = Math.ceil(searchIdx.length / PER);
  const indexEntries = ['  <sitemap><loc>https://medikr.kr/sitemap-0.xml</loc></sitemap>'];
  for (let i = 0; i < chunks; i++) {
    const slice = searchIdx.slice(i * PER, (i + 1) * PER);
    const urls = slice
      .map(([seq]) => `  <url><loc>https://medikr.kr/drug/${seq}/</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`)
      .join('\n');
    fs.writeFileSync(
      path.join(PUB, `sitemap-drugs-${i}.xml`),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
    );
    indexEntries.push(`  <sitemap><loc>https://medikr.kr/sitemap-drugs-${i}.xml</loc></sitemap>`);
  }
  fs.writeFileSync(
    path.join(PUB, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexEntries.join('\n')}\n</sitemapindex>`
  );
  console.log(`[build-index] sitemap: ${chunks} 분할 (${searchIdx.length} 약) → public/sitemap.xml + sitemap-drugs-0..${chunks - 1}.xml`);
}

// ─── D1 seed SQL ─────────────────────────────────────────
// drug 페이지가 식약처 API(3-7s) 대신 D1 조회(ms)하도록 약 상세를 tb_drug_cache 에 적재.
// 허가(43k) 기준 + e약은요 텍스트 + 낱알 외형 통합. wrangler d1 execute --file 로 적재(build.yml).
function sqlStr(s: string | undefined | null): string {
  if (s == null || s === '') return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}
const COLS =
  'item_seq,item_name,entp_name,eng_name,efcy,use_method,atpn_warn,atpn,intrc,se,deposit,item_image,shape,color,print_mark,class_name,otc,form,pill_image,permit_date,spclty,prdct_type,prmisn_no,ingr_name';
function seedRow(seq: string, name: string): string {
  const d = drugMap.get(seq);
  const pill = pillMap.get(seq);
  const p = permitMap.get(seq);
  const vals = [
    sqlStr(seq), sqlStr(name), sqlStr(p?.ENTP_NAME ?? d?.entpName), sqlStr(p?.ITEM_ENG_NAME),
    sqlStr(d?.efcyQesitm), sqlStr(d?.useMethodQesitm), sqlStr(d?.atpnWarnQesitm), sqlStr(d?.atpnQesitm),
    sqlStr(d?.intrcQesitm), sqlStr(d?.seQesitm), sqlStr(d?.depositMethodQesitm), sqlStr(d?.itemImage),
    sqlStr(pill?.DRUG_SHAPE), sqlStr([pill?.COLOR_CLASS1, pill?.COLOR_CLASS2].filter(Boolean).join(', ')),
    sqlStr([pill?.PRINT_FRONT, pill?.PRINT_BACK].filter(Boolean).join(' / ')),
    sqlStr(pill?.CLASS_NAME), sqlStr(pill?.ETC_OTC_NAME), sqlStr(pill?.FORM_CODE_NAME), sqlStr(pill?.ITEM_IMAGE),
    sqlStr(p?.ITEM_PERMIT_DATE), sqlStr(p?.SPCLTY_PBLC), sqlStr(p?.PRDUCT_TYPE), sqlStr(p?.PRDUCT_PRMISN_NO), sqlStr(p?.ITEM_INGR_NAME),
  ];
  return `INSERT OR REPLACE INTO tb_drug_cache (${COLS}) VALUES (${vals.join(',')});`;
}

const seedLines: string[] = [];
const seededSeqs = new Set<string>();
for (const p of permits) {
  if (!p.ITEM_SEQ || seededSeqs.has(p.ITEM_SEQ)) continue;
  const name = drugMap.get(p.ITEM_SEQ)?.itemName ?? p.ITEM_NAME;
  if (!name) continue;
  seededSeqs.add(p.ITEM_SEQ);
  seedLines.push(seedRow(p.ITEM_SEQ, name));
}
// 허가에 없고 e약은요에만 있는 약 (드묾)
for (const d of drugs) {
  if (seededSeqs.has(d.itemSeq)) continue;
  seededSeqs.add(d.itemSeq);
  seedLines.push(seedRow(d.itemSeq, d.itemName));
}
const seedPath = path.join(process.cwd(), 'migrations', 'seed-drugs.sql');
fs.writeFileSync(seedPath, seedLines.join('\n'));
console.log(`[build-index] D1 seed: ${seedLines.length} rows, ${(fs.statSync(seedPath).size / 1024 / 1024).toFixed(1)}MB → ${seedPath}`);
