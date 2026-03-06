// 이미지 생성 프롬프트 콘텐츠 필터
// API 전송 전 금칙어를 제거하여 생성 실패를 방지

const BLOCKED_TERMS: Record<string, string[]> = {
  sexual: [
    'nude', 'naked', 'topless', 'bottomless', 'nsfw', 'pornographic',
    'erotic', 'sexually explicit', 'genitalia', 'breasts exposed',
    'sexual intercourse', 'orgasm', 'masturbat', 'hentai', 'lolicon',
    'bikini model', 'stripclub', 'stripper', 'escort',
    'lingerie model', 'bdsm', 'fetish', 'sex toy',
    '누드', '알몸', '성행위', '야동', '포르노', '에로틱',
    '성인물', '자위', '노출', '벗은',
  ],
  violence: [
    'gore', 'dismember', 'decapitat', 'mutilat', 'disembowel',
    'torture scene', 'graphic violence', 'blood splatter', 'severed head',
    'mass shooting', 'execution', 'suicide method', 'self-harm',
    'child abuse', 'animal cruelty', 'snuff',
    '참수', '고문', '학대', '자해 방법', '살인 방법',
    '총기 난사', '자살 방법', '시체 훼손',
  ],
  political: [
    'nazi symbol', 'swastika', 'isis flag', 'terrorist attack',
    'white supremacy', 'kkk', 'ethnic cleansing', 'genocide glorif',
    'hate symbol', 'confederate flag',
    '나치', '테러 공격', '인종 청소',
  ],
  childSafety: [
    'child pornograph', 'minor sexuali', 'underage', 'loli',
    'shotacon', 'child exploit', 'pedophil',
    '아동 성', '미성년 성', '아청법',
  ],
};

// 모든 금칙어를 하나의 배열로 flat
const ALL_BLOCKED = Object.values(BLOCKED_TERMS).flat();

// 각 금칙어에 대해 word-boundary 정규식 생성 (대소문자 무시)
const BLOCKED_PATTERNS = ALL_BLOCKED.map(term => ({
  term,
  regex: new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
}));

export interface FilterResult {
  cleanedPrompt: string;
  wasFiltered: boolean;
  removedTerms: string[];
}

/**
 * 프롬프트에서 금칙어를 제거하고 결과를 반환
 */
export function filterPromptContent(prompt: string): FilterResult {
  if (!prompt) return { cleanedPrompt: '', wasFiltered: false, removedTerms: [] };

  let cleaned = prompt;
  const removedTerms: string[] = [];

  for (const { term, regex } of BLOCKED_PATTERNS) {
    if (regex.test(cleaned)) {
      removedTerms.push(term);
      cleaned = cleaned.replace(regex, '');
      // regex lastIndex reset
      regex.lastIndex = 0;
    }
  }

  if (removedTerms.length === 0) {
    return { cleanedPrompt: prompt, wasFiltered: false, removedTerms: [] };
  }

  // 연속 공백/쉼표 정리
  cleaned = cleaned
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*,\s*/, '')
    .replace(/\s*,\s*$/, '')
    .trim();

  return { cleanedPrompt: cleaned, wasFiltered: true, removedTerms };
}
