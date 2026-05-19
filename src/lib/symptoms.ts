export type Symptom = {
  slug: string;
  label: string;
  keywords: string[];
};

export const SYMPTOMS: Symptom[] = [
  { slug: 'gamgi', label: '감기', keywords: ['감기', '기침', '콧물', '인후통'] },
  { slug: 'duto', label: '두통', keywords: ['두통', '편두통'] },
  { slug: 'wijang', label: '소화·위장', keywords: ['소화', '위장', '속쓰림', '식욕', '구역', '구토'] },
  { slug: 'baltyeol', label: '발열·해열', keywords: ['발열', '열', '해열'] },
  { slug: 'tongjeung', label: '통증', keywords: ['통증', '진통', '근육통', '관절통', '월경통'] },
  { slug: 'almreugi', label: '알레르기', keywords: ['알레르기', '두드러기', '비염'] },
  { slug: 'byunbi', label: '변비', keywords: ['변비', '배변'] },
  { slug: 'seolssa', label: '설사', keywords: ['설사', '장염'] },
  { slug: 'sumyeon', label: '수면', keywords: ['수면', '불면'] },
  { slug: 'pibu', label: '피부', keywords: ['피부', '가려움', '습진', '여드름'] },
];
