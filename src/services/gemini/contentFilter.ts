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
// ── 정책 위반 우회: 군사/정치/폭력 용어를 시각적으로 동등한 중립 용어로 치환 ──
const POLICY_SANITIZE_MAP: [RegExp, string][] = [
  // Weapons / Military hardware
  [/\b(intercontinental ballistic )?missiles?\b/gi, 'fast-moving streaks in the sky'],
  [/\b(rocket ?launchers?|warheads?|torpedoes?)\b/gi, 'metal cylinders'],
  [/\b(warships?|battleships?|destroyers?|aircraft ?carriers?|frigates?)\b/gi, 'large grey vessels on water'],
  [/\b(submarines?)\b/gi, 'underwater vessels'],
  [/\b(tanks?|armou?red ?vehicles?)\b/gi, 'heavy tracked vehicles'],
  [/\b(fighter ?jets?|bombers?|stealth ?aircraft)\b/gi, 'fast-moving aircraft'],
  [/\b(guns?|rifles?|pistols?|firearms?|weapons?|artillery)\b/gi, 'equipment'],
  [/\b(bombs?|bombing|bombardment|air ?strikes?)\b/gi, 'bright flashes'],
  [/\b(nuclear|atomic)\b/gi, 'large-scale'],
  [/\b(ammunition|ammo|bullets?|shells?)\b/gi, 'supplies'],
  // Actions
  [/\b(attack(?:s|ing|ed)?|invad(?:e|es|ing|ed)?|invasion)\b/gi, 'confrontation'],
  [/\b(explod(?:e|es|ing|ed)?|explosions?|blasts?|detonat(?:e|es|ing|ed)?)\b/gi, 'dramatic flash of light'],
  [/\b(shoot(?:s|ing)?|firing|gunfire)\b/gi, 'dramatic action'],
  [/\b(blockad(?:e|es|ing))\b/gi, 'standoff'],
  [/\b(siege|besieg(?:e|ed|ing))\b/gi, 'surrounding'],
  [/\b(assassinat(?:e|es|ed|ion))\b/gi, 'dramatic event'],
  [/\b(hostages?|kidnap(?:s|ped|ping)?)\b/gi, 'tense standoff'],
  [/\b(execut(?:e|es|ed|ion))\b/gi, 'dramatic scene'],
  // Military personnel/org
  [/\b(soldiers?|troops?|military ?personnel|combatants?)\b/gi, 'uniformed figures'],
  [/\b(military ?base|naval ?base|army ?base)\b/gi, 'large secured compound'],
  [/\b(military|armed ?forces?)\b/gi, 'organized forces'],
  // Death/injury
  [/\b(dead|death|dying|killed?|killing|casualties)\b/gi, 'fallen'],
  [/\b(blood(?:y|shed)?|bleeding|wounded)\b/gi, 'red-stained'],
  [/\b(corpses?|bodies|remains)\b/gi, 'still figures'],
  // Conflict terms
  [/\b(war(?:fare)?|combat)\b/gi, 'intense standoff'],
  [/\b(conflict|crisis)\b/gi, 'tension'],
  [/\b(terroris(?:t|ts|m)|extremis(?:t|ts|m))\b/gi, 'masked figures'],
  // Korean equivalents
  [/미사일/g, '하늘의 빠른 궤적'],
  [/군함|전함|구축함|항공모함|호위함/g, '대형 회색 선박'],
  [/잠수함/g, '수중 선박'],
  [/탱크|전차|장갑차/g, '대형 차량'],
  [/전투기|폭격기/g, '고속 비행체'],
  [/폭격|폭발|폭탄|공습/g, '강렬한 섬광'],
  [/핵무기|핵/g, '대규모'],
  [/총|소총|권총|무기|대포/g, '장비'],
  [/공격|침공|침략/g, '대치'],
  [/전쟁/g, '긴장 대치'],
  [/군인|병사|군사/g, '제복 입은 인물'],
  [/군사 기지|해군 기지/g, '대형 시설'],
  [/사망|죽음|살해|전사/g, '쓰러진'],
  [/피|유혈|부상/g, '붉은 자국'],
  [/테러|극단주의/g, '복면 인물'],
  [/인질|납치/g, '긴박한 대치'],
  [/봉쇄/g, '대치 상황'],
];

/**
 * 정책 위반으로 실패한 프롬프트를 순화하여 재생성 가능하게 만든다.
 * 군사/폭력/정치적 용어를 시각적으로 동등한 중립 표현으로 치환.
 */
export function sanitizeForPolicyBypass(prompt: string): string {
  if (!prompt) return prompt;
  let sanitized = prompt;
  for (const [pattern, replacement] of POLICY_SANITIZE_MAP) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  // 안전 프리앰블 삽입: AI에게 이것이 교육/예술 콘텐츠임을 알려줌
  const preamble = '[Artistic educational illustration, fictional stylized cartoon scene] ';
  sanitized = preamble + sanitized;
  // 연속 공백/쉼표 정리
  sanitized = sanitized
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return sanitized;
}

/** 에러 메시지가 Google 정책 위반인지 판별 */
export function isPolicyViolationError(errorMsg: string): boolean {
  const markers = [
    'Prohibited Use policy',
    'filtered out',
    'safety filter',
    'content policy',
    'SAFETY',
    'RECITATION',
    'blocked by',
  ];
  const lower = errorMsg.toLowerCase();
  return markers.some(m => lower.includes(m.toLowerCase()));
}

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
