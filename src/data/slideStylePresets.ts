/**
 * PPT 마스터 — 슬라이드 스타일 프리셋
 *
 * 콘텐츠 구조화 스타일 (AI가 텍스트를 분석·재구성하는 방식) +
 * 디자인 스타일 (Nanobanana 2로 생성하는 슬라이드 배경/일러스트 비주얼)
 */

// ─── 콘텐츠 구조화 스타일 ───

export interface ContentStyle {
  id: string;
  label: string;
  description: string;
  icon: string;
  systemPrompt: string;
  /** 슬라이드당 권장 글자수 범위 */
  charRange: [number, number];
  /** 이미지 생성 시 슬라이드 레이아웃 지시 (영문) */
  layoutHint: string;
}

export const CONTENT_STYLES: ContentStyle[] = [
  {
    id: 'steve-jobs',
    label: '스티브 잡스',
    description: '극강의 단순함과 임팩트. 슬라이드 한 장에 오직 하나의 메시지.',
    icon: '🍎',
    systemPrompt: `당신은 스티브 잡스 스타일의 커뮤니케이션 전문가입니다. 모든 복잡한 분석 내용을 '단 하나의 문장'과 '세 개의 키워드'로 압축하세요. 슬라이드 한 장에는 오직 하나의 메시지만 담겨야 합니다. 전문 용어 대신 'Magic', 'Incredible' 같은 감성적인 단어를 적절히 섞어 청중의 기대감을 고조시키는 톤으로 작성하세요.`,
    charRange: [20, 80],
    layoutHint: 'One single large phrase or keyword centered on the slide with vast empty whitespace around it. Extreme minimalism. No bullet points, no sub-text — just one bold statement filling the center.',
  },
  {
    id: 'toss-blue',
    label: '토스 블루 럭스',
    description: '토스 스타일 극강의 직관성. 초등학생도 이해할 수 있는 간결함.',
    icon: '💙',
    systemPrompt: `모든 답변을 토스(Toss)의 디자인 철학인 '간결함'에 맞추어 재구성하세요. 전문 용어는 초등학생도 이해할 만큼 쉽게 풀이하고, 내용은 불렛포인트 3개 이내로 요약하세요. 마지막에는 '한 줄 요약'을 배치하여 사용자가 즉시 실행할 수 있는 행동 지침을 제시하세요. 복잡한 문장은 단문으로 쪼개어 가독성을 극대화하세요.`,
    charRange: [30, 120],
    layoutHint: 'Clean vertical layout with 2-3 short bullet points spaced generously apart. Large title at top, bullet points centered below. Maximum whitespace between elements. One-line summary at bottom.',
  },
  {
    id: 'kinfolk-serif',
    label: '킨포크 세리프',
    description: '킨포크 매거진 감성. 따뜻한 대화와 사유의 여백.',
    icon: '🍂',
    systemPrompt: `당신은 킨포크 매거진의 에디터입니다. 정보를 단순히 나열하지 말고, 마치 따뜻한 차 한 잔을 마시며 나누는 대화처럼 서술하세요. '사유의 여백'이라는 섹션을 만들어 이 정보가 우리 삶에 주는 의미를 감성적으로 짚어주세요. 명조체 느낌의 문어체를 사용하고, 서두에 오늘의 무드를 설명하는 짧은 문장을 포함하세요.`,
    charRange: [60, 200],
    layoutHint: 'Editorial magazine page layout with elegant serif typography. A short mood sentence at top in small italic text, main body text in the center with generous margins, and a reflective pull-quote highlighted.',
  },
  {
    id: 'bento-bold',
    label: '벤토 볼드',
    description: '벤토 그리드 구조적 큐레이션. 4구획 모듈형 박스 정리.',
    icon: '🍱',
    systemPrompt: `모든 정보를 '모듈형 박스' 구조로 구조화하세요. 1. 핵심 개념, 2. 근거 데이터, 3. 연결된 아이디어, 4. 향후 과제라는 4개의 명확한 구획으로 나누어 답변하세요. 각 구획은 서로 독립적이면서도 유기적으로 연결되어야 하며, 시각적으로 격자 무늬 안에 담긴 것처럼 정갈하게 번호를 매겨 정리하세요.`,
    charRange: [80, 250],
    layoutHint: 'Bento grid layout: 4 distinct rectangular sections arranged in a 2x2 grid. Each box has a bold number label (1-4) and short text. Title spans the full width above the grid. Clean borders separate each module.',
  },
  {
    id: 'neo-brutalism',
    label: '네오 브루탈리즘',
    description: '파격과 직설. Bullshit-free 요약으로 본질만 남기기.',
    icon: '🔥',
    systemPrompt: `격식을 차리지 말고 직설적이고 파격적으로 핵심을 찌르세요. 'Bullshit-free Summary' 섹션을 최상단에 배치하여 본질만 남기고 나머지는 과감히 삭제하세요. 굵고 강렬한 단어를 사용하고, 기존의 관습적인 해석을 뒤엎는 'Provocative Point(도발적 관점)'를 반드시 하나 이상 포함하세요.`,
    charRange: [30, 100],
    layoutHint: 'Bold oversized title text dominating the top half. One provocative pull-quote in a highlighted box below. Thick heavy typography, raw and punchy layout. Minimal decoration — text IS the design.',
  },
  {
    id: 'classic-magazine',
    label: '클래식 매거진',
    description: '보그 커버 스토리 스타일. 감각적인 헤드라인과 에디터스 노트.',
    icon: '📰',
    systemPrompt: `이 분석 자료를 이번 달 호 커버 스토리로 기획하세요. 상단에는 영문과 국문을 섞은 감각적인 '메인 헤드라인'을 뽑고, 본문은 '에디터스 노트' 형식으로 아주 짧고 매혹적으로 작성하세요. 비주얼 배치를 위해 '이 페이지에서 가장 크게 강조할 단어 한 가지'를 명시하고, 그 아래 아주 작은 글씨의 주석을 다는 형태로 구성하세요.`,
    charRange: [50, 180],
    layoutHint: 'Magazine cover layout. One oversized hero keyword in dramatic typography at center. Sleek headline above it, tiny editorial footnotes below. Fashion editorial aesthetic with strong visual hierarchy.',
  },
  {
    id: 'consultant',
    label: '컨설턴트 로직트리',
    description: '맥킨지 전략 컨설턴트. Problem-Solution-Impact 구조.',
    icon: '📊',
    systemPrompt: `당신은 맥킨지 출신의 전략 컨설턴트입니다. 소스를 분석하여 [Problem - Solution - Impact] 구조로 정리하세요. 모든 주장에는 '숫자'나 '구체적 근거'를 출처와 함께 제시하세요. 서술형 문장보다는 상호 배타적이고 전체적으로 포괄적인(MECE) 방식의 항목별 요약(Bullet points)을 사용해 논리적 빈틈이 없게 하세요.`,
    charRange: [60, 200],
    layoutHint: 'Structured consulting slide: title at top, three labeled sections below (Problem / Solution / Impact) arranged horizontally or vertically. Each section has a bold heading and 2-3 data-backed bullet points. Clean professional business aesthetic.',
  },
];

// ─── 디자인 스타일 (Nanobanana 2 이미지 생성용) ───

export interface DesignStyle {
  id: string;
  label: string;
  description: string;
  /** Nanobanana 2 이미지 생성 프롬프트 (영문) */
  prompt: string;
  /** 슬라이드 배경 CSS (이미지 생성 전 placeholder) */
  bgColor: string;
  accentColor: string;
}

export const DESIGN_STYLES: DesignStyle[] = [
  {
    id: 'neo-brutalism',
    label: '네오 브루탈리즘',
    description: '강렬한 검정 테두리와 원색. 힙하고 파격적인 디자인.',
    prompt: 'Infographic slide design, Neo-brutalism style, bold black outlines, high contrast vibrant colors, thick typography, floating document icons and AI symbols, edgy and modern tech aesthetic, white background.',
    bgColor: '#FFFFFF',
    accentColor: '#FF6B35',
  },
  {
    id: 'clean-minimal',
    label: '클린 미니멀리즘',
    description: 'Apple 스타일 여백의 미. 깔끔하고 우아한 전문가적 디자인.',
    prompt: 'Minimalist infographic slide, Apple-style clean aesthetics, thin grey lines, vast negative space, soft blue accents, simple vector icons, elegant and professional presentation design.',
    bgColor: '#FFFFFF',
    accentColor: '#007AFF',
  },
  {
    id: 'glassmorphism',
    label: '글래스모피즘',
    description: '반투명 유리 카드가 겹쳐진 입체적이고 세련된 디자인.',
    prompt: 'Futuristic UI infographic slide, Glassmorphism style, semi-transparent frosted glass cards, soft background blur, glowing pastel gradients, 3D floating digital elements, high-end software presentation look.',
    bgColor: '#E8E0F0',
    accentColor: '#8B5CF6',
  },
  {
    id: 'bento-grid',
    label: '벤토 그리드',
    description: '도시락 통처럼 칸이 나뉜 일목요연한 정보 레이아웃.',
    prompt: 'Bento grid layout infographic slide, organized rectangular sections, clean UI elements in each box, summary icons, modern web design trend, structured data visualization, soft shadows, rounded corners.',
    bgColor: '#F8F9FA',
    accentColor: '#2563EB',
  },
  {
    id: 'claymorphism',
    label: '클레이모피즘',
    description: '찰흙처럼 말랑말랑한 3D 캐릭터. 친근하고 귀여운 스타일.',
    prompt: 'Claymorphism style infographic slide, cute 3D soft plastic textures, rounded inflated shapes, friendly pastel colors, 3D characters interacting with data elements, playful and accessible presentation design.',
    bgColor: '#FFF5F5',
    accentColor: '#F472B6',
  },
  {
    id: 'dark-tech',
    label: '다크 모드 하이테크',
    description: '어두운 배경에 네온 빛. 전문가적 사이버 분위기.',
    prompt: 'Dark mode tech infographic slide, deep charcoal background, neon cyan and violet glowing lines, data stream visualizations, futuristic HUD elements, sophisticated AI neural network icons, high-tech presentation.',
    bgColor: '#1A1A2E',
    accentColor: '#00D9FF',
  },
  {
    id: 'gradient-mesh',
    label: '그라디언트 메시',
    description: '몽환적으로 섞이는 색감. 창의적인 그라데이션 배경.',
    prompt: 'Infographic slide with vibrant mesh gradient background, organic flowing shapes, soft transitions of blue and purple, minimalist white text area, abstract representation of flowing ideas and information.',
    bgColor: '#667EEA',
    accentColor: '#764BA2',
  },
  {
    id: 'hand-drawn',
    label: '핸드 드로잉 스케치',
    description: '펜으로 직접 그린 듯한 인간적인 손그림 디자인.',
    prompt: 'Creative brainstorming infographic slide, hand-drawn sketch style, scribbled arrows, doodle icons of lightbulbs and papers, human touch, organic and lively, paper texture background, presentation layout.',
    bgColor: '#FFFBEB',
    accentColor: '#D97706',
  },
  {
    id: 'node-link',
    label: '데이터 노드 네트워크',
    description: '지식의 연결망. 점과 선으로 논리적 관계를 시각화.',
    prompt: 'Complex knowledge graph infographic slide, interconnected nodes and lines, connecting the dots concept, professional data science visualization, blue and silver color palette, presentation design.',
    bgColor: '#0F172A',
    accentColor: '#38BDF8',
  },
  {
    id: 'retro-modern',
    label: '레트로 모던',
    description: '80년대 컴퓨터 감성과 현대적 감각의 독특한 결합.',
    prompt: 'Retro-modern 80s tech infographic slide, grainy texture, vintage muted colors, geometric shapes, old computer aesthetic meets modern AI, unique and nostalgic presentation design.',
    bgColor: '#2D1B69',
    accentColor: '#FF6B9D',
  },
  {
    id: 'toss-style',
    label: '토스 스타일',
    description: '순백색 배경에 토스 블루 포인트. 극도의 간결함과 3D 아이콘.',
    prompt: 'Toss-style clean infographic slide, iconic 3D glossy icons, vivid Toss Blue accents on pure white background, extremely simple and friendly layout, soft shadows under cards, premium mobile app UI aesthetic.',
    bgColor: '#FFFFFF',
    accentColor: '#3182F6',
  },
];

// ─── 세부 정보 수준 ───

export type DetailLevel = 'concise' | 'standard' | 'detailed';

export const DETAIL_LEVELS: { id: DetailLevel; label: string; description: string }[] = [
  { id: 'concise', label: '간결', description: '핵심만 압축. 키워드와 한 줄 요약 중심.' },
  { id: 'standard', label: '표준', description: '균형잡힌 분량. 설명과 요약의 조화.' },
  { id: 'detailed', label: '상세', description: '풍부한 설명. 근거와 예시까지 포함.' },
];

// ─── Gemini 슬라이드 생성 프롬프트 빌더 ───

export function buildSlideGenerationPrompt(
  contentStyle: ContentStyle,
  detailLevel: DetailLevel,
  slideCount: number,
): string {
  const detailInstruction = detailLevel === 'concise'
    ? '각 슬라이드는 핵심 키워드 3개와 한 줄 요약만 포함하세요. 최소한의 텍스트로 임팩트를 극대화하세요.'
    : detailLevel === 'standard'
      ? '각 슬라이드에 제목, 본문 2~3줄, 핵심 포인트 1~2개를 포함하세요.'
      : '각 슬라이드에 제목, 상세 설명 3~5줄, 근거 데이터, 보충 설명을 포함하세요. 청중이 슬라이드만으로 내용을 완전히 이해할 수 있게 하세요.';

  return `${contentStyle.systemPrompt}

## 슬라이드 생성 지시사항

사용자가 입력한 텍스트를 분석하여 정확히 ${slideCount}장의 프레젠테이션 슬라이드로 재구성하세요.

### 세부 정보 수준
${detailInstruction}

### 출력 형식 (반드시 JSON 배열)
\`\`\`json
[
  {
    "slideNumber": 1,
    "title": "슬라이드 제목",
    "body": "본문 텍스트",
    "keyPoints": ["포인트1", "포인트2"],
    "visualHint": "이 슬라이드에 어울리는 비주얼 설명 (영문, 이미지 생성용)",
    "speakerNote": "발표자 노트 (선택사항)"
  }
]
\`\`\`

### 규칙
1. 첫 번째 슬라이드는 반드시 타이틀 슬라이드 (제목 + 부제목)
2. 마지막 슬라이드는 핵심 요약 또는 Call-to-Action
3. visualHint는 영문으로 작성 (이미지 생성 AI에 전달됨)
4. 한국어로 작성하되, 콘텐츠 스타일에 맞는 톤과 구조를 엄격히 준수
5. JSON만 출력하세요. 다른 텍스트 없이 순수 JSON 배열만 반환하세요.`;
}
