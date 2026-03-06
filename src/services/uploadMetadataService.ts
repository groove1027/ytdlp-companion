
import { evolinkChat } from './evolinkService';
import type { VideoMetadata, PolicyCheckResult } from '../types';

interface MetadataGenerationOptions {
  platforms?: string[];  // ['youtube', 'tiktok', 'instagram']
  language?: string;     // hint
}

/**
 * 대본 기반 AI 메타데이터 생성 — YouTube Shorts 마스터 지침서 적용
 * Steps 1-5: 대본 분석 → 정책 게이트키퍼 → 품질 검수 → 썸네일 → SEO 최적화
 */
export async function generateUploadMetadata(
  fullScript: string,
  sceneSummaries: string[],
  options: MetadataGenerationOptions = {}
): Promise<VideoMetadata> {
  const { language } = options;

  // Build scene context
  const sceneContext = sceneSummaries.length > 0
    ? `\n\n장면 구성 (${sceneSummaries.length}개):\n${sceneSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';

  const systemPrompt = `너는 유튜브 쇼츠 제작 완료 영상 분석 및 최적화 전문가다.
최상위 목표: Google/YouTube의 공식 가이드라인(커뮤니티 가이드, 광고주 친화적 콘텐츠 가이드)을 100% 준수하여 채널의 안전(삭제 방지)과 수익성(노란 딱지 방지)을 보장하고, 동시에 치밀한 SEO 전략으로 조회수와 수익을 극대화한다.

주어진 영상 대본을 분석하여 아래 5단계를 순서대로 실행하고, 결과를 JSON으로 반환하라.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1단계: 대본 정밀 분석 (Script Anatomy)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 등장하는 인물, 사물, 배경, 행동을 빠짐없이 파악
- 발화 내용과 맥락을 정밀 분석
- 표면적 내용뿐 아니라 내포된 의미와 흐름 파악
- 핵심 주제, 감정선, 타겟 시청자를 식별

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2단계: 정책 게이트키퍼 (Policy Gatekeeper) — 가장 중요
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
커뮤니티 가이드 체크:
- 스팸/기만: 현혹적 제목, 사기, 스팸 여부
- 아동 안전: 미성년자에게 위험/부적절한 요소
- 과도한 노출/성적 콘텐츠: 포르노, 성행위, 성적 만족 목적 노출
- 자살/자해: 조장하거나 충격적 묘사
- 괴롭힘/사이버폭력: 악의적 비방, 모욕
- 유해/위험 행동: 심각한 부상 초래 가능 행동 조장
- 규제 상품: 총기류, 불법 물품 등

광고주 친화 체크:
- 부적절한 언어(욕설/비속어), 폭력(유혈/시신/부상), 성인용(성적 농담/선정적)
- 충격적 콘텐츠(혐오/공포/불쾌), 유해 행위, 증오/차별, 마약, 총기
- 논란(정치 갈등/테러/전쟁), 민감한 사건, 부정직 행위 조장

판정: safetyLevel(safe/warning/danger), monetizationLevel(suitable/limited/unsuitable)
danger일 경우에도 나머지 단계는 계속 진행하되, 경고 메시지를 상세히 기술하라.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3단계: 제목 생성 (High CTR Titles)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 5개 다양한 스타일 (궁금증 유발, 숫자 활용, 감정 자극, 정보형, 트렌드형)
- 스크롤을 멈추게 하는 도파민 유발 제목
- 각 제목 50자 이내, 이모지 1-2개 자연스럽게 포함
- CTR 극대화 + 정책 안전 범위 내

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4단계: 썸네일 추천 (Thumbnail Suggestions)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
대본에서 정지 화면만으로도 호기심/도파민을 자극할 수 있는 핵심 장면 3개 추천.
각 추천에 장면 번호/내용 요약 + 추천 이유 포함.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5단계: SEO 최적화 (Explosive Traffic)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[설명(Description)] — 700자 내외, Educational Focus
- 지식 훅(Hook): 주제 관련 흥미로운 질문/놀라운 사실로 시작
- 핵심 요약: 핵심 정보를 1, 2, 3 단계로 번호 매겨 체계적+전문적 서술
- 단호한 마무리: 핵심 요약 끝나면 즉시 종료
  🚫 절대 금지: 구독/좋아요/알림설정 등 시청 유도 멘트
  🚫 절대 금지: 상투적 인사말(건강 유의 등)
- SEO 키워드 자연스럽게 녹여내고 줄바꿈+이모티콘으로 가독성 확보

[공개 해시태그(Public Hashtags)] — 설명란 최하단
- 정확히 5개
- 🚫 #shorts 절대 금지
- 🚫 문장형 태그 금지 (핵심 명사 위주)
- 영상 주제 100% 일치 + 검색량 최대 대형 키워드

[비공개 태그(Hidden Tags)] — YouTube Studio 태그 박스용
- 광역 어그로 70%: 오타/유의어 포함, 국가/이슈/감정/돈 관련 폭발적 검색량 키워드
- 🚫 영어 절대 금지 (DIY 제외). 한국어 트래픽 집중
- 한도 끝까지 꽉 채워서 작성 (최소 30개 이상)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JSON 출력 형식 (반드시 이 형식으로):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "titles": ["제목1", "제목2", "제목3", "제목4", "제목5"],
  "description": "700자 교육적 설명문 (줄바꿈 포함, 구독CTA 절대 금지)",
  "publicHashtags": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],
  "hiddenTags": ["한국어태그1", "한국어태그2", "한국어태그3", ...],
  "category": "YouTube 카테고리명",
  "language": "감지된 언어 코드",
  "policyCheck": {
    "safetyLevel": "safe|warning|danger",
    "monetizationLevel": "suitable|limited|unsuitable",
    "details": "상세 분석 내용"
  },
  "thumbnailSuggestions": ["장면1: 설명 + 이유", "장면2: 설명 + 이유", "장면3: 설명 + 이유"]
}`;

  const userPrompt = `다음 영상 대본을 분석하여 5단계 마스터 지침에 따라 메타데이터를 생성해주세요:

=== 대본 ===
${fullScript.slice(0, 8000)}
${sceneContext}
=== 끝 ===`;

  const response = await evolinkChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      temperature: 0.5,
      maxTokens: 4096,
      responseFormat: { type: 'json_object' },
    }
  );

  const content = response.choices?.[0]?.message?.content || '';

  // Parse JSON response
  let parsed: Record<string, unknown>;
  try {
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');
  }

  // Extract titles
  const titles = Array.isArray(parsed.titles) ? parsed.titles.map(String) : ['제목 없음'];

  // Extract description (educational, no CTA)
  const description = typeof parsed.description === 'string' ? parsed.description : '';

  // Extract public hashtags (exactly 5, no #shorts)
  let publicHashtags: string[] = [];
  if (Array.isArray(parsed.publicHashtags)) {
    publicHashtags = parsed.publicHashtags
      .map(String)
      .map(h => h.replace(/^#/, ''))  // strip leading #
      .filter(h => h.toLowerCase() !== 'shorts' && h.trim().length > 0)
      .slice(0, 5);
  }

  // Extract hidden tags (Korean only, full capacity)
  let hiddenTags: string[] = [];
  if (Array.isArray(parsed.hiddenTags)) {
    hiddenTags = parsed.hiddenTags.map(String).filter(t => t.trim().length > 0);
  }

  // Category
  const category = typeof parsed.category === 'string' ? parsed.category : '교육';
  const detectedLanguage = typeof parsed.language === 'string' ? parsed.language : language || 'ko';

  // Policy check
  let policyCheck: PolicyCheckResult | undefined;
  if (parsed.policyCheck && typeof parsed.policyCheck === 'object') {
    const pc = parsed.policyCheck as Record<string, unknown>;
    policyCheck = {
      safetyLevel: (['safe', 'warning', 'danger'].includes(String(pc.safetyLevel))
        ? String(pc.safetyLevel) : 'safe') as PolicyCheckResult['safetyLevel'],
      monetizationLevel: (['suitable', 'limited', 'unsuitable'].includes(String(pc.monetizationLevel))
        ? String(pc.monetizationLevel) : 'suitable') as PolicyCheckResult['monetizationLevel'],
      details: typeof pc.details === 'string' ? pc.details : '',
    };
  }

  // Thumbnail suggestions
  const thumbnailSuggestions = Array.isArray(parsed.thumbnailSuggestions)
    ? parsed.thumbnailSuggestions.map(String)
    : [];

  return {
    titles,
    selectedTitle: titles[0] || '제목 없음',
    description,
    publicHashtags,
    hiddenTags,
    tags: hiddenTags, // backward compat
    category,
    language: detectedLanguage,
    policyCheck,
    thumbnailSuggestions,
    generatedAt: Date.now(),
  };
}
