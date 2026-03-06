/**
 * Smart Motion Matcher
 * 장면의 visualPrompt/scriptText를 분석하여 최적의 Pan/Zoom + Motion 프리셋을 자동 매칭
 */

// ── 타입 정의 ──

export interface SceneMotionInput {
  visualPrompt: string;    // 영어 AI 생성 비주얼 프롬프트
  scriptText: string;      // 한국어 나레이션 텍스트
  sceneType?: string;      // e.g., 'action', 'dialogue', 'establishing'
  // Scene 메타데이터 (구조화된 필드 → 텍스트 키워드보다 우선)
  castType?: string;       // MAIN | KEY_ENTITY | EXTRA | NOBODY
  shotSize?: string;       // close-up, medium, wide, etc.
  cameraAngle?: string;    // high, low, eye-level, bird's eye, etc.
  entityComposition?: string; // ENTITY_SOLO, ENTITY_WITH_MAIN, etc.
  characterPresent?: boolean;
  cameraMovement?: string; // AI 생성: "Static", "Pan Left", "Tilt Up", "Dolly In", etc.
}

export interface MotionMatch {
  panZoomPreset: string;
  motionEffect: string;
  confidence: number;      // 0-1, 매칭 신뢰도
  anchorX: number;         // 0-100%, 줌/팬 중심 X (50=센터)
  anchorY: number;         // 0-100%, 줌/팬 중심 Y (50=센터)
  anchorLabel: string;     // 사람이 읽을 수 있는 앵커 설명
}

// ── 키워드-프리셋 매핑 테이블 ──

interface KeywordRule {
  keywords: string[];
  panZoomPreset: string;
  motionEffect: string;
  priority: number;        // 높을수록 우선 (여러 규칙 충돌 시)
  anchorX: number;         // 0-100%, 줌/팬 중심 X
  anchorY: number;         // 0-100%, 줌/팬 중심 Y
  anchorLabel: string;     // 앵커 설명
}

const KEYWORD_RULES: KeywordRule[] = [
  // 항공/드론 샷 — 중앙 하단 (지면 피사체 향해)
  {
    keywords: ['aerial', 'drone', "bird's eye", 'birds eye', 'overhead', 'top-down', 'top down'],
    panZoomPreset: 'crane-up', motionEffect: 'slow', priority: 9,
    anchorX: 50, anchorY: 60, anchorLabel: '지면 피사체',
  },
  // 클로즈업/인물/디테일 — 상단 중앙 (얼굴/눈 위치)
  {
    keywords: ['close-up', 'closeup', 'close up', 'portrait', 'face', 'detail', 'macro', 'extreme close'],
    panZoomPreset: 'push-pull', motionEffect: 'micro', priority: 8,
    anchorX: 50, anchorY: 35, anchorLabel: '인물 얼굴',
  },
  // 풍경/파노라마 — 수평선 중앙 (상단 1/3)
  {
    keywords: ['landscape', 'panorama', 'wide shot', 'vista', 'horizon', 'wide angle', 'establishing shot'],
    panZoomPreset: 'parallax', motionEffect: 'pan', priority: 8,
    anchorX: 50, anchorY: 40, anchorLabel: '수평선',
  },
  // 액션/전투 — 중앙 약간 좌측 (동작 방향)
  {
    keywords: ['action', 'running', 'fight', 'explosion', 'battle', 'crash', 'combat', 'attack'],
    panZoomPreset: 'dynamic', motionEffect: 'shake', priority: 10,
    anchorX: 45, anchorY: 45, anchorLabel: '액션 중심',
  },
  // 야경/누아르 — 중앙 (실루엣/그림자)
  {
    keywords: ['night', 'dark', 'noir', 'shadow', 'mystery', 'moonlight', 'dim', 'silhouette'],
    panZoomPreset: 'dramatic', motionEffect: 'crossfade', priority: 7,
    anchorX: 50, anchorY: 45, anchorLabel: '실루엣 중심',
  },
  // 빈티지/레트로 — 중앙
  {
    keywords: ['vintage', 'retro', 'old', 'classic', 'historical', 'ancient', 'antique', 'nostalgic'],
    panZoomPreset: 'vintage', motionEffect: 'sepia', priority: 7,
    anchorX: 50, anchorY: 50, anchorLabel: '프레임 중심',
  },
  // 물/바다/흐름 — 하단 중앙 (수면)
  {
    keywords: ['ocean', 'water', 'wave', 'river', 'flow', 'sea', 'lake', 'waterfall', 'underwater'],
    panZoomPreset: 'dreamy', motionEffect: 'slow', priority: 7,
    anchorX: 50, anchorY: 55, anchorLabel: '수면/흐름',
  },
  // 도시/건축 — 상단 (건물 상부)
  {
    keywords: ['city', 'urban', 'street', 'building', 'architecture', 'skyscraper', 'downtown', 'metropolis'],
    panZoomPreset: 'cinematic', motionEffect: 'pan', priority: 6,
    anchorX: 50, anchorY: 38, anchorLabel: '건축물 상부',
  },
  // 자연/숲/산 — 중앙 상단 (산/나무 상부)
  {
    keywords: ['nature', 'forest', 'mountain', 'garden', 'tree', 'jungle', 'meadow', 'valley', 'wilderness'],
    panZoomPreset: 'documentary', motionEffect: 'slow', priority: 6,
    anchorX: 50, anchorY: 42, anchorLabel: '자연 포커스',
  },
  // 군중/축제 — 중앙 (군중 전체)
  {
    keywords: ['crowd', 'people', 'gathering', 'festival', 'celebration', 'concert', 'parade', 'audience'],
    panZoomPreset: 'fast', motionEffect: 'crossfade', priority: 6,
    anchorX: 50, anchorY: 45, anchorLabel: '군중 중심',
  },
  // 실내/인테리어 — 중앙 약간 아래 (가구 레벨)
  {
    keywords: ['interior', 'room', 'indoor', 'furniture', 'living room', 'bedroom', 'office', 'studio'],
    panZoomPreset: 'tilt-shift', motionEffect: 'micro', priority: 5,
    anchorX: 50, anchorY: 52, anchorLabel: '실내 중심',
  },
  // 우주/은하 — 정중앙
  {
    keywords: ['space', 'galaxy', 'cosmos', 'star', 'planet', 'nebula', 'orbit', 'universe', 'celestial'],
    panZoomPreset: 'spiral-in', motionEffect: 'rotate', priority: 7,
    anchorX: 50, anchorY: 50, anchorLabel: '은하 중심',
  },
  // 음식/요리 — 하단 중앙 (접시 위치)
  {
    keywords: ['food', 'dish', 'cuisine', 'restaurant', 'cooking', 'meal', 'recipe', 'delicious', 'plate'],
    panZoomPreset: 'zoom', motionEffect: 'micro', priority: 6,
    anchorX: 50, anchorY: 55, anchorLabel: '음식 중심',
  },
  // 차량/도로 — 중앙 약간 우측 (진행 방향)
  {
    keywords: ['car', 'vehicle', 'road', 'driving', 'highway', 'motorcycle', 'truck', 'traffic', 'speed'],
    panZoomPreset: 'diagonal-drift', motionEffect: 'pan', priority: 7,
    anchorX: 55, anchorY: 48, anchorLabel: '이동 방향',
  },
  // 텍스트/타이틀 — 정중앙
  {
    keywords: ['text', 'title', 'opening', 'ending', 'intro', 'credits', 'logo', 'typography'],
    panZoomPreset: 'reveal', motionEffect: 'fade', priority: 8,
    anchorX: 50, anchorY: 50, anchorLabel: '타이틀 중심',
  },
  // ── 추가 인물 키워드 (세분화) ──
  // 상반신/반신 — 얼굴+상체
  {
    keywords: ['upper body', 'half body', 'bust shot', 'medium close', 'shoulder', 'torso', 'waist up'],
    panZoomPreset: 'smooth', motionEffect: 'micro', priority: 8,
    anchorX: 50, anchorY: 38, anchorLabel: '인물 상반신',
  },
  // 전신 — 인물 중심 (약간 위)
  {
    keywords: ['full body', 'full shot', 'standing', 'walking', 'person', 'man', 'woman', 'girl', 'boy', 'child'],
    panZoomPreset: 'cinematic', motionEffect: 'fade', priority: 5,
    anchorX: 50, anchorY: 42, anchorLabel: '인물 전신',
  },
  // 2인 대화 — 3분의 1 법칙 (좌측 인물)
  {
    keywords: ['dialogue', 'conversation', 'talking', 'two people', 'couple', 'interview'],
    panZoomPreset: 'dolly-zoom', motionEffect: 'micro', priority: 7,
    anchorX: 40, anchorY: 38, anchorLabel: '대화 인물',
  },
  // 손/제품/디테일 — 하단 중앙
  {
    keywords: ['hand', 'holding', 'product', 'object', 'item', 'gadget', 'device', 'phone', 'book'],
    panZoomPreset: 'zoom', motionEffect: 'rotate-plus', priority: 6,
    anchorX: 50, anchorY: 55, anchorLabel: '피사체 디테일',
  },
  // 동물 — 상단 1/3 (눈 높이)
  {
    keywords: ['animal', 'dog', 'cat', 'bird', 'horse', 'pet', 'wildlife', 'creature'],
    panZoomPreset: 'smooth', motionEffect: 'slow', priority: 6,
    anchorX: 50, anchorY: 40, anchorLabel: '동물 눈높이',
  },
  // 꽃/식물 — 중앙 (피사체 중심)
  {
    keywords: ['flower', 'blossom', 'petal', 'bloom', 'rose', '꽃', '장미', 'floral'],
    panZoomPreset: 'orbit', motionEffect: 'micro', priority: 6,
    anchorX: 50, anchorY: 48, anchorLabel: '꽃 중심',
  },
  // 비/날씨 — 중앙 상단
  {
    keywords: ['rain', 'storm', 'thunder', 'lightning', 'weather', 'snowing', 'blizzard', '비', '폭풍', '번개'],
    panZoomPreset: 'dramatic', motionEffect: 'rain', priority: 7,
    anchorX: 50, anchorY: 40, anchorLabel: '날씨 중심',
  },
  // 옛날/세피아 톤 (sepia 프롬프트 분리)
  {
    keywords: ['sepia', 'faded', '바랜', 'aged photo', 'old photograph', '흑백', 'monochrome', 'grayscale'],
    panZoomPreset: 'vintage', motionEffect: 'film', priority: 7,
    anchorX: 50, anchorY: 50, anchorLabel: '회고 프레임',
  },
  // 네온/사이버펑크 — 중앙
  {
    keywords: ['neon', 'cyberpunk', 'futuristic', 'hologram', 'cyber', 'glitch', 'digital', 'matrix', 'hack'],
    panZoomPreset: 'fast', motionEffect: 'glitch', priority: 7,
    anchorX: 50, anchorY: 45, anchorLabel: '네온 중심',
  },
  // 고대비/강렬한 색감
  {
    keywords: ['contrast', 'vivid', 'saturated', 'intense', '강렬', '채도', 'bold color', 'dramatic light'],
    panZoomPreset: 'dynamic', motionEffect: 'high-contrast', priority: 6,
    anchorX: 50, anchorY: 45, anchorLabel: '강렬 포커스',
  },
  // 밝은/햇살/빛
  {
    keywords: ['bright', 'sunlight', 'sunshine', 'golden hour', 'glow', '빛', '햇살', '광채', 'radiant'],
    panZoomPreset: 'dreamy', motionEffect: 'multi-bright', priority: 6,
    anchorX: 50, anchorY: 40, anchorLabel: '빛 중심',
  },
  // 복고풍 필름
  {
    keywords: ['film grain', 'analog', 'celluloid', '필름', 'cinematic grain', '16mm', '35mm', 'film look'],
    panZoomPreset: 'documentary', motionEffect: 'vintage-style', priority: 7,
    anchorX: 50, anchorY: 48, anchorLabel: '필름 프레임',
  },
  // ── 새 프리셋 활용 키워드 규칙 ──
  // 비행/날다 — 궤도 이동
  {
    keywords: ['fly', 'flying', 'flight', '비행', '날다', '하늘을 날', 'soaring', 'glide', 'airborne'],
    panZoomPreset: 'orbit', motionEffect: 'pan', priority: 7,
    anchorX: 50, anchorY: 40, anchorLabel: '비행체 궤적',
  },
  // 도시/스카이라인 — 패럴랙스
  {
    keywords: ['skyline', '도시 전경', 'cityscape', 'panoramic city', '마천루', 'metropolitan'],
    panZoomPreset: 'parallax', motionEffect: 'slow', priority: 7,
    anchorX: 50, anchorY: 38, anchorLabel: '스카이라인',
  },
  // 꿈/환상 — 스파이럴
  {
    keywords: ['dream', '꿈', '환상', 'fantasy', 'surreal', 'hallucination', 'illusion', '몽환', 'ethereal'],
    panZoomPreset: 'spiral-in', motionEffect: 'crossfade', priority: 7,
    anchorX: 50, anchorY: 50, anchorLabel: '환상 중심',
  },
  // 추격/도주 — 대각 드리프트
  {
    keywords: ['chase', '추격', '도주', 'pursuit', 'fleeing', 'running away', '쫓기다', 'escape route'],
    panZoomPreset: 'diagonal-drift', motionEffect: 'shake', priority: 8,
    anchorX: 55, anchorY: 45, anchorLabel: '추격 방향',
  },
  // 호흡/긴장 — 푸시풀
  {
    keywords: ['breathing', '호흡', '긴장', 'tension', 'suspense', 'anxiety', '불안', 'heartbeat', 'pulse'],
    panZoomPreset: 'push-pull', motionEffect: 'fade', priority: 7,
    anchorX: 50, anchorY: 45, anchorLabel: '긴장 중심',
  },
  // 버티고/현기증 — 돌리줌
  {
    keywords: ['vertigo', '버티고', '현기증', '높이', 'dizziness', 'falling', 'cliff', 'abyss', 'height'],
    panZoomPreset: 'dolly-zoom', motionEffect: 'shake', priority: 8,
    anchorX: 50, anchorY: 50, anchorLabel: '버티고 포커스',
  },
  // 상승/라이즈 — 크레인업
  {
    keywords: ['rise', '상승', '올라', 'ascending', 'lifting', 'elevate', '떠오르다', 'launch', 'takeoff'],
    panZoomPreset: 'crane-up', motionEffect: 'fade', priority: 7,
    anchorX: 50, anchorY: 55, anchorLabel: '상승 기점',
  },
  // 미니어처/마을 — 틸트시프트
  {
    keywords: ['miniature', '미니어처', '마을', 'village', 'diorama', 'toy', 'model', 'tilt-shift', 'small town'],
    panZoomPreset: 'tilt-shift', motionEffect: 'slow', priority: 7,
    anchorX: 50, anchorY: 45, anchorLabel: '미니어처 뷰',
  },
  // 회전/소용돌이 — 스파이럴
  {
    keywords: ['spin', 'spinning', '회전', 'vortex', 'whirl', 'spiral', '소용돌이', 'tornado', 'cyclone'],
    panZoomPreset: 'spiral-in', motionEffect: 'rotate', priority: 8,
    anchorX: 50, anchorY: 50, anchorLabel: '회전 중심',
  },
  // 대결/배틀 — 푸시풀
  {
    keywords: ['versus', '대결', 'showdown', 'confrontation', '결투', 'face-off', 'standoff', 'rivalry'],
    panZoomPreset: 'push-pull', motionEffect: 'glitch', priority: 7,
    anchorX: 50, anchorY: 45, anchorLabel: '대결 중심',
  },
  // 탐험/여정 — 대각 드리프트
  {
    keywords: ['explore', '탐험', 'journey', '여정', 'adventure', 'expedition', 'discovery', '모험', 'trek'],
    panZoomPreset: 'diagonal-drift', motionEffect: 'rotate', priority: 6,
    anchorX: 55, anchorY: 48, anchorLabel: '탐험 방향',
  },
  // 고요/평화 — 크레인업
  {
    keywords: ['calm', '고요', '평화', 'peaceful', 'serene', 'tranquil', 'stillness', '정적', 'silent'],
    panZoomPreset: 'crane-up', motionEffect: 'crossfade', priority: 6,
    anchorX: 50, anchorY: 42, anchorLabel: '평화로운 풍경',
  },
];

// ── 대체 프리셋 맵 (연속 중복 회피용) ──
// 특정 panZoomPreset이 연속으로 나올 때 대체할 차선 프리셋 목록
const ALTERNATIVE_PRESETS: Record<string, string[]> = {
  cinematic: ['documentary', 'smooth', 'dramatic'],
  smooth: ['cinematic', 'dreamy', 'documentary'],
  documentary: ['cinematic', 'smooth', 'vintage'],
  dynamic: ['fast', 'cinematic', 'dramatic'],
  dramatic: ['cinematic', 'dynamic', 'dreamy'],
  dreamy: ['smooth', 'cinematic', 'documentary'],
  fast: ['dynamic', 'cinematic', 'vlog'],
  vintage: ['documentary', 'cinematic', 'dreamy'],
  timelapse: ['cinematic', 'documentary', 'dreamy'],
  zoom: ['smooth', 'cinematic', 'reveal'],
  reveal: ['dramatic', 'cinematic', 'zoom'],
  vlog: ['fast', 'smooth', 'dynamic'],
  noir: ['dramatic', 'vintage', 'cinematic'],
  'diagonal-drift': ['parallax', 'orbit', 'cinematic'],
  orbit: ['diagonal-drift', 'dreamy', 'spiral-in'],
  parallax: ['diagonal-drift', 'documentary', 'crane-up'],
  'tilt-shift': ['crane-up', 'smooth', 'documentary'],
  'spiral-in': ['orbit', 'dreamy', 'dolly-zoom'],
  'push-pull': ['dramatic', 'dolly-zoom', 'dynamic'],
  'dolly-zoom': ['push-pull', 'dramatic', 'spiral-in'],
  'crane-up': ['tilt-shift', 'reveal', 'parallax'],
};

// 특정 motionEffect가 연속으로 나올 때 대체할 차선 모션 목록
const ALTERNATIVE_MOTIONS: Record<string, string[]> = {
  slow: ['micro', 'crossfade', 'pan', 'rotate'],
  micro: ['slow', 'fade', 'rotate-plus', 'pan'],
  pan: ['rotate', 'slow', 'crossfade', 'micro'],
  fade: ['crossfade', 'micro', 'slow', 'film'],
  shake: ['glitch', 'rotate', 'pan', 'micro'],
  film: ['sepia', 'vintage-style', 'crossfade', 'fade'],
  none: ['fade', 'micro', 'slow', 'crossfade'],
  crossfade: ['fade', 'film', 'slow', 'multi-bright'],
  rotate: ['rotate-plus', 'pan', 'shake', 'micro'],
  sepia: ['film', 'vintage-style', 'fade', 'slow'],
  static: ['micro', 'fade', 'slow', 'crossfade'],
  glitch: ['shake', 'rotate-plus', 'film', 'pan'],
  'rotate-plus': ['rotate', 'pan', 'glitch', 'shake'],
  'high-contrast': ['multi-bright', 'film', 'fade', 'crossfade'],
  'multi-bright': ['high-contrast', 'crossfade', 'fade', 'slow'],
  rain: ['slow', 'crossfade', 'fade', 'film'],
  'vintage-style': ['sepia', 'film', 'fade', 'slow'],
};

const DEFAULT_PAN_ZOOM = 'smooth';
const DEFAULT_MOTION = 'fade';

// 폴백/저신뢰도 장면을 위한 순환 프리셋 풀 (다양성 보장)
const DIVERSE_PAN_ZOOM_POOL = [
  'smooth', 'cinematic', 'documentary', 'dreamy', 'dramatic', 'vintage',
  'zoom', 'reveal', 'dynamic', 'fast', 'timelapse', 'vlog', 'noir',
  'diagonal-drift', 'orbit', 'parallax', 'tilt-shift',
  'spiral-in', 'push-pull', 'dolly-zoom', 'crane-up',
];
const DIVERSE_MOTION_POOL = [
  'fade', 'micro', 'slow', 'pan', 'crossfade', 'film',
  'rotate', 'shake', 'sepia', 'glitch', 'rotate-plus',
  'high-contrast', 'multi-bright', 'rain', 'vintage-style',
];

// ── cameraMovement → 프리셋 매핑 (AI 생성 카메라 움직임 → 최적 프리셋) ──

function mapCameraMovementToPreset(movement: string): { panZoomPreset: string; motionEffect: string } | null {
  const m = (movement || '').toLowerCase().trim();
  if (!m || m === 'static' || m === 'fixed') return { panZoomPreset: 'smooth', motionEffect: 'micro' };
  if (m.includes('tilt up') || m.includes('crane up') || m.includes('crane')) return { panZoomPreset: 'crane-up', motionEffect: 'reveal' };
  if (m.includes('tilt down')) return { panZoomPreset: 'tilt-shift', motionEffect: 'slow' };
  if (m.includes('pan left')) return { panZoomPreset: 'timelapse', motionEffect: 'pan' };
  if (m.includes('pan right')) return { panZoomPreset: 'documentary', motionEffect: 'pan' };
  if (m.includes('pan')) return { panZoomPreset: 'parallax', motionEffect: 'pan' };
  if (m.includes('dolly in') || m.includes('push in')) return { panZoomPreset: 'push-pull', motionEffect: 'micro' };
  if (m.includes('dolly out') || m.includes('pull out') || m.includes('dolly')) return { panZoomPreset: 'dolly-zoom', motionEffect: 'fade' };
  if (m.includes('orbit') || m.includes('arc')) return { panZoomPreset: 'orbit', motionEffect: 'dynamic' };
  if (m.includes('tracking') || m.includes('follow')) return { panZoomPreset: 'parallax', motionEffect: 'pan' };
  if (m.includes('handheld') || m.includes('shake') || m.includes('shaky')) return { panZoomPreset: 'dynamic', motionEffect: 'shake' };
  if (m.includes('zoom in')) return { panZoomPreset: 'zoom', motionEffect: 'micro' };
  if (m.includes('zoom out')) return { panZoomPreset: 'cinematic', motionEffect: 'slow' };
  if (m.includes('spiral') || m.includes('rotate')) return { panZoomPreset: 'spiral-in', motionEffect: 'rotate' };
  if (m.includes('reveal')) return { panZoomPreset: 'reveal', motionEffect: 'fade' };
  if (m.includes('diagonal')) return { panZoomPreset: 'diagonal-drift', motionEffect: 'pan' };
  return null;
}

// ── 핵심 함수 ──

/**
 * 단일 장면에 대해 최적의 모션 프리셋을 매칭
 * 우선순위: cameraMovement(최우선) → 키워드 매칭 → 메타데이터 폴백 → 텍스트 폴백
 */
export function matchMotionToContent(input: SceneMotionInput): MotionMatch {
  // Scene 메타데이터에서 앵커 추론 (구조화된 데이터 → 텍스트보다 정확)
  const metadataAnchor = inferAnchorFromMetadata(input);

  // [최우선] cameraMovement 직접 매핑 (AI가 분석한 카메라 움직임)
  if (input.cameraMovement) {
    const cmPreset = mapCameraMovementToPreset(input.cameraMovement);
    if (cmPreset) {
      const anchor = metadataAnchor || inferAnchorFromText(
        (input.visualPrompt || '') + ' ' + (input.scriptText || '')
      );
      return {
        ...cmPreset,
        confidence: 0.85, // cameraMovement 매칭은 높은 신뢰도
        ...anchor,
      };
    }
  }

  const prompt = (input.visualPrompt || '').toLowerCase();
  const script = (input.scriptText || '').toLowerCase();
  const combined = prompt + ' ' + script;

  let bestMatch: { rule: KeywordRule; matchCount: number } | null = null;

  for (const rule of KEYWORD_RULES) {
    let matchCount = 0;

    for (const kw of rule.keywords) {
      // visualPrompt에서 매칭되면 가중치 2, scriptText에서만 매칭되면 가중치 1
      if (prompt.includes(kw)) {
        matchCount += 2;
      } else if (combined.includes(kw)) {
        matchCount += 1;
      }
    }

    if (matchCount === 0) continue;

    // 우선순위와 매칭 수를 조합한 점수로 비교
    const score = matchCount * rule.priority;
    const bestScore = bestMatch ? bestMatch.matchCount * bestMatch.rule.priority : 0;

    if (score > bestScore) {
      bestMatch = { rule, matchCount };
    }
  }

  if (bestMatch) {
    // 신뢰도: 매칭된 키워드 비율 * 우선순위 가중치 (0~1로 정규화)
    const maxPossibleScore = bestMatch.rule.keywords.length * 2; // 모든 키워드가 prompt에서 매칭
    const rawConfidence = bestMatch.matchCount / maxPossibleScore;
    const confidence = Math.min(1, Math.max(0.3, rawConfidence * (bestMatch.rule.priority / 10)));

    // 메타데이터 앵커가 있으면 텍스트 키워드 앵커 대신 사용 (더 정확)
    const anchor = metadataAnchor || {
      anchorX: bestMatch.rule.anchorX,
      anchorY: bestMatch.rule.anchorY,
      anchorLabel: bestMatch.rule.anchorLabel,
    };

    return {
      panZoomPreset: bestMatch.rule.panZoomPreset,
      motionEffect: bestMatch.rule.motionEffect,
      confidence: Math.round(confidence * 100) / 100,
      ...anchor,
    };
  }

  // 메타데이터 폴백 → 텍스트 폴백
  const anchor = metadataAnchor || inferAnchorFromText(combined);

  return {
    panZoomPreset: DEFAULT_PAN_ZOOM,
    motionEffect: DEFAULT_MOTION,
    confidence: 0.1,
    ...anchor,
  };
}

/**
 * Scene 메타데이터(castType, shotSize, cameraAngle)에서 앵커 포인트를 추론
 * 텍스트 키워드보다 신뢰도가 높음 (구조화된 AI 분석 결과)
 */
function inferAnchorFromMetadata(input: SceneMotionInput): { anchorX: number; anchorY: number; anchorLabel: string } | null {
  const { castType, shotSize, cameraAngle, entityComposition, characterPresent } = input;
  if (!castType && !shotSize && !cameraAngle) return null;

  let ax = 50, ay = 45, label = '프레임 중심';
  const shot = (shotSize || '').toLowerCase();
  const angle = (cameraAngle || '').toLowerCase();

  // 1. castType 기반 기본 위치
  if (castType === 'KEY_ENTITY') {
    // 유명인/브랜드/장소 — 화면 중심~약간 위
    ax = 50; ay = 40; label = '핵심 피사체';
    if (entityComposition === 'ENTITY_WITH_MAIN') { ax = 55; label = '핵심 피사체 (우측)'; }
    else if (entityComposition === 'MAIN_FG_ENTITY_BG') { ax = 55; ay = 45; label = '배경 피사체'; }
    else if (entityComposition === 'ENTITY_FG_MAIN_BG') { ax = 45; ay = 38; label = '전경 피사체'; }
    else if (entityComposition === 'MAIN_OBSERVING') { ax = 60; ay = 42; label = '관찰 대상'; }
  } else if (castType === 'MAIN' && characterPresent) {
    ax = 50; ay = 40; label = '주인공';
  } else if (castType === 'NOBODY') {
    ax = 50; ay = 50; label = '배경 풍경';
  }

  // 2. shotSize로 세밀 조정
  if (shot.includes('close') || shot.includes('클로즈')) {
    ay = 35; label = characterPresent ? '인물 얼굴' : '클로즈업';
  } else if (shot.includes('extreme close') || shot.includes('익스트림')) {
    ay = 33; label = '극접사';
  } else if (shot.includes('medium close') || shot.includes('bust')) {
    ay = 38; label = '상반신';
  } else if (shot.includes('medium') || shot.includes('미디엄')) {
    ay = 42; label = characterPresent ? '인물 중심' : '중간 샷';
  } else if (shot.includes('wide') || shot.includes('와이드') || shot.includes('full')) {
    ay = 48; label = characterPresent ? '인물 전신' : '전경';
  } else if (shot.includes('extreme wide') || shot.includes('establishing')) {
    ay = 50; label = '전체 풍경';
  }

  // 3. cameraAngle로 수직 위치 보정
  if (angle.includes('high') || angle.includes('하이') || angle.includes('bird')) {
    ay = Math.min(ay + 10, 65); label += ' (부감)';
  } else if (angle.includes('low') || angle.includes('로우') || angle.includes('worm')) {
    ay = Math.max(ay - 8, 25); label += ' (앙감)';
  } else if (angle.includes('dutch') || angle.includes('tilt')) {
    ax = 55; label += ' (기울기)';
  }

  return { anchorX: ax, anchorY: ay, anchorLabel: label };
}

/**
 * 텍스트에서 인물/피사체 위치를 추론하여 앵커 포인트 반환
 * 1차 키워드 매칭이 실패했을 때의 2차 폴백
 */
function inferAnchorFromText(text: string): { anchorX: number; anchorY: number; anchorLabel: string } {
  // 인물/얼굴 관련
  if (/face|portrait|인물|얼굴|표정|눈|미소|smile|gaze|looking|staring/i.test(text)) {
    return { anchorX: 50, anchorY: 35, anchorLabel: '인물 얼굴' };
  }
  // 서 있는 사람
  if (/standing|서\s?있|전신|full body|person|사람|남자|여자|아이|소녀|소년/i.test(text)) {
    return { anchorX: 50, anchorY: 42, anchorLabel: '인물 중심' };
  }
  // 하늘/위쪽
  if (/sky|하늘|구름|cloud|sun|moon|해|달|별|star/i.test(text)) {
    return { anchorX: 50, anchorY: 30, anchorLabel: '하늘' };
  }
  // 바닥/아래쪽
  if (/floor|ground|바닥|땅|도로|road|path|길/i.test(text)) {
    return { anchorX: 50, anchorY: 65, anchorLabel: '지면' };
  }
  // 좌측 피사체
  if (/left|왼쪽|좌측/i.test(text)) {
    return { anchorX: 35, anchorY: 45, anchorLabel: '좌측 피사체' };
  }
  // 우측 피사체
  if (/right|오른쪽|우측/i.test(text)) {
    return { anchorX: 65, anchorY: 45, anchorLabel: '우측 피사체' };
  }
  // 기본: 약간 위 (대부분의 피사체는 프레임 상단 1/3에 위치)
  return { anchorX: 50, anchorY: 45, anchorLabel: '프레임 중심' };
}

/**
 * 여러 장면에 대해 스마트 모션 매칭 + 연속 중복 회피
 * 인접 장면이 동일한 panZoomPreset 또는 motionEffect를 받으면 차선 대안으로 교체
 */
export function assignSmartMotions(scenes: SceneMotionInput[]): MotionMatch[] {
  if (scenes.length === 0) return [];

  // 1단계: 각 장면 개별 매칭
  const matches: MotionMatch[] = scenes.map((scene) => matchMotionToContent(scene));

  // 1.5단계: 저신뢰도(폴백) 장면에 순환 프리셋 할당 (다양성 보장)
  // 키워드 매칭이 안 되어 기본값만 받은 장면들에게 풀에서 순환 분배
  let pzPoolIdx = 0;
  let motionPoolIdx = 0;
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].confidence <= 0.1) {
      // 앞 장면과 겹치지 않는 프리셋 선택
      const prevPZ = i > 0 ? matches[i - 1].panZoomPreset : '';
      const prevMotion = i > 0 ? matches[i - 1].motionEffect : '';

      // panZoom 순환: 앞 장면과 같으면 다음 풀 항목으로 넘김
      let pzAttempts = 0;
      while (DIVERSE_PAN_ZOOM_POOL[pzPoolIdx % DIVERSE_PAN_ZOOM_POOL.length] === prevPZ && pzAttempts < DIVERSE_PAN_ZOOM_POOL.length) {
        pzPoolIdx++;
        pzAttempts++;
      }
      matches[i].panZoomPreset = DIVERSE_PAN_ZOOM_POOL[pzPoolIdx % DIVERSE_PAN_ZOOM_POOL.length];
      pzPoolIdx++;

      // motion 순환: 앞 장면과 같으면 다음 풀 항목으로 넘김
      let motionAttempts = 0;
      while (DIVERSE_MOTION_POOL[motionPoolIdx % DIVERSE_MOTION_POOL.length] === prevMotion && motionAttempts < DIVERSE_MOTION_POOL.length) {
        motionPoolIdx++;
        motionAttempts++;
      }
      matches[i].motionEffect = DIVERSE_MOTION_POOL[motionPoolIdx % DIVERSE_MOTION_POOL.length];
      motionPoolIdx++;

      matches[i].confidence = 0.15; // 순환 할당이므로 약간 상향
    }
  }

  // 2단계: panZoomPreset 연속 중복 회피
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].panZoomPreset === matches[i - 1].panZoomPreset) {
      const currentPreset = matches[i].panZoomPreset;
      const alternatives = ALTERNATIVE_PRESETS[currentPreset] || ['cinematic', 'smooth', 'documentary'];

      // 앞/뒤 장면과 겹치지 않는 대안 찾기
      const prevPreset = matches[i - 1].panZoomPreset;
      const nextPreset = i + 1 < matches.length ? matches[i + 1]?.panZoomPreset : null;

      const bestAlternative = alternatives.find(
        (alt) => alt !== prevPreset && alt !== nextPreset
      ) || alternatives[0];

      matches[i] = {
        ...matches[i],
        panZoomPreset: bestAlternative,
        confidence: Math.max(0.2, matches[i].confidence - 0.1), // 대안이므로 신뢰도 약간 감소
      };
    }
  }

  // 3단계: motionEffect 연속 중복 회피 (panZoom과 독립적으로 처리)
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].motionEffect === matches[i - 1].motionEffect) {
      const currentMotion = matches[i].motionEffect;
      const alternatives = ALTERNATIVE_MOTIONS[currentMotion] || ['micro', 'fade', 'pan'];

      // 앞/뒤 장면과 겹치지 않는 대안 찾기
      const prevMotion = matches[i - 1].motionEffect;
      const nextMotion = i + 1 < matches.length ? matches[i + 1]?.motionEffect : null;

      const bestAlternative = alternatives.find(
        (alt) => alt !== prevMotion && alt !== nextMotion
      ) || alternatives[0];

      matches[i] = {
        ...matches[i],
        motionEffect: bestAlternative,
        confidence: Math.max(0.2, matches[i].confidence - 0.1),
      };
    }
  }

  return matches;
}

// ── AI Vision 기반 초점 자동 감지 ──

/**
 * 실제 이미지를 AI Vision(Gemini)으로 분석하여 주 피사체의 위치를 반환
 * 텍스트 휴리스틱보다 훨씬 정확 — 실제 이미지 내 인물/객체/랜드마크 위치를 감지
 */
export async function detectImageFocalPoint(imageUrl: string): Promise<{
  anchorX: number;
  anchorY: number;
  anchorLabel: string;
}> {
  const { evolinkChat } = await import('./evolinkService');

  const imageContent = imageUrl.startsWith('data:')
    ? imageUrl
    : imageUrl.startsWith('blob:')
      ? await blobUrlToDataUrl(imageUrl)
      : imageUrl;

  const messages = [
    {
      role: 'system' as const,
      content: 'You analyze images and return the focal point coordinates as JSON. Respond ONLY with valid JSON.',
    },
    {
      role: 'user' as const,
      content: [
        { type: 'image_url' as const, image_url: { url: imageContent } },
        {
          type: 'text' as const,
          text: `Analyze this image and find the MAIN focal subject (person's face, key object, landmark, etc.).
Return JSON: {"x": number, "y": number, "label": "brief Korean description"}
- x: 0=left edge, 50=center, 100=right edge
- y: 0=top edge, 50=center, 100=bottom edge
- label: e.g. "인물 얼굴", "건물 중심", "동물", "제품"
Focus on the SINGLE most visually prominent element. If a person is present, prioritize their face/upper body.`,
        },
      ],
    },
  ];

  const response = await evolinkChat(messages, {
    temperature: 0.1,
    maxTokens: 200,
  });

  const raw = response.choices[0]?.message?.content || '';
  // JSON 추출 (```json ... ``` 래핑 처리)
  const jsonMatch = raw.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    return { anchorX: 50, anchorY: 45, anchorLabel: 'AI 감지 실패' };
  }

  const result = JSON.parse(jsonMatch[0]);
  return {
    anchorX: Math.max(5, Math.min(95, Math.round(result.x ?? 50))),
    anchorY: Math.max(5, Math.min(95, Math.round(result.y ?? 45))),
    anchorLabel: result.label || 'AI 감지',
  };
}

/** Blob URL → data URL 변환 (Vision API는 data URL 필요) */
async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
