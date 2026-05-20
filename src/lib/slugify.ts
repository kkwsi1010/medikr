// URL slug 변환 — 파일 시스템·GitHub artifact·HTTP 모두에서 안전한 문자만
// 한글은 유지 (Astro 가 URL encode), 영문 콜론·따옴표·특수문자는 _
export function slugify(s: string): string {
  return s
    .trim()
    .replace(/[\/\?#&:*<>\|"'\\,;@!$%^=`~()[\]{}]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/_+/g, '_')
    .replace(/^[-_]+|[-_]+$/g, '')
    .substring(0, 80);
}
