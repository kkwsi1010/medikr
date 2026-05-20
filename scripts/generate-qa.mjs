// 매주 Claude API 로 새 의약품 Q&A 5건 생성 → src/lib/qa-seed.ts 에 추가
// GitHub Actions weekly cron 에서 실행 (CLAUDE_API_KEY secret 필요)

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'node:fs';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log('[generate-qa] ANTHROPIC_API_KEY not set, skipping');
  process.exit(0);
}

const client = new Anthropic({ apiKey });

const SEED_PATH = 'src/lib/qa-seed.ts';
const seed = readFileSync(SEED_PATH, 'utf-8');

// 기존 slug + question 추출 (중복 방지)
const existingSlugs = Array.from(seed.matchAll(/slug:\s*'([^']+)'/g)).map((m) => m[1]);
const existingQs = Array.from(seed.matchAll(/q:\s*'([^']+)'/g)).map((m) => m[1]);

const prompt = `당신은 한국 의약품 정보 사이트 medikr.kr 의 콘텐츠 작가입니다.

일반인이 실제로 자주 궁금해할 의약품·복용·안전 관련 질문 5건을 새로 작성하세요.

**기존 Q&A (중복 금지)**:
${existingQs.map((q) => `- ${q}`).join('\n')}

**규칙**:
1. 일반인이 검색할 만한 실제 질문 (예: "약 먹고 운전해도 되나요?")
2. 의료 행위/진단/처방 정보가 아닌 일반 정보만
3. 항상 "의사·약사 상담" 권유 포함
4. 답변은 1000-1500자, **마크다운 강조** + 단락 구분 (\\n\\n)
5. 카테고리: 진통제/감기/위장/알레르기/항생제/임신/노인/소아/안전/복용법/보관/심혈관/만성질환/수면/피부/눈 중 선택

**출력 형식 (JSON, 순수 JSON만, 마크다운 코드블록 X)**:
{"items": [
  {"slug": "kebab-case-english-slug", "q": "질문 (한국어)", "a": "답변 (한국어, 마크다운-lite)", "category": "카테고리", "related": ["관련 약 키워드 또는 빈 배열"]}
]}

오늘은 ${new Date().toISOString().slice(0, 10)} 입니다. 5건 작성:`;

console.log('[generate-qa] calling Claude API...');
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 8192,
  messages: [{ role: 'user', content: prompt }],
});

const text = response.content[0].type === 'text' ? response.content[0].text : '';
let parsed;
try {
  // JSON 추출 (Claude 가 마크다운 코드블록으로 감싸도 처리)
  const m = text.match(/\{[\s\S]*"items"[\s\S]*\}/);
  parsed = JSON.parse(m ? m[0] : text);
} catch (e) {
  console.error('[generate-qa] JSON parse error:', e.message);
  console.error(text);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const newItems = parsed.items
  .filter((it) => !existingSlugs.includes(it.slug))
  .map((it) => ({
    slug: it.slug,
    q: it.q,
    a: it.a,
    category: it.category,
    related: it.related || [],
    updated: today,
  }));

if (newItems.length === 0) {
  console.log('[generate-qa] no new unique items');
  process.exit(0);
}

// qa-seed.ts 의 마지막 ] 앞에 삽입
const inserts = newItems
  .map((it) => `  {
    slug: ${JSON.stringify(it.slug)},
    q: ${JSON.stringify(it.q)},
    a: \`${it.a.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    category: ${JSON.stringify(it.category)},
    related: ${JSON.stringify(it.related)},
    updated: ${JSON.stringify(it.updated)},
  },`)
  .join('\n');

const updated = seed.replace(/^\];$/m, `${inserts}\n];`);
writeFileSync(SEED_PATH, updated);

console.log(`[generate-qa] added ${newItems.length} new Q&A items`);
for (const it of newItems) console.log(`  - ${it.slug}: ${it.q}`);
