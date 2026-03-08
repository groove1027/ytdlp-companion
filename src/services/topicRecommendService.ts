/**
 * 소재 추천 서비스
 * 본능 기제 + Google Search grounding → 5개 소재 추천
 * YouTube API 직접 호출 대신 Gemini의 Google Search 도구를 활용
 *
 * [FIX] Google Search grounding은 Google Native v1beta 엔드포인트에서만 동작.
 * Kie 등 OpenAI-compatible 프록시에서는 grounding 도구가 무시되므로,
 * Evolink(Google Native) 실패 시 grounding 도구를 제거하고 폴백 요청한다.
 */
import { requestGeminiProxy } from './gemini/geminiProxy';
import { requestEvolinkNative, getEvolinkKey } from './evolinkService';
import { buildSelectedInstinctPrompt } from '../data/instinctPromptUtils';
import { getMechanismById } from '../data/instinctData';
import type { TopicRecommendation } from '../types';
import { logger } from './LoggerService';

interface RecommendOptions {
  mechanismIds: string[];
  onProgress: (step: string, percent: number) => void;
  channelGuideline?: string;
  keyword?: string;  // optional keyword filter (e.g., "물건, 음식, 여행지")
}

export const recommendTopics = async (options: RecommendOptions): Promise<TopicRecommendation[]> => {
  const { mechanismIds, onProgress, channelGuideline, keyword } = options;

  onProgress('본능 기제 분석 중...', 10);
  const instinctPrompt = buildSelectedInstinctPrompt(mechanismIds);
  const mechanisms = mechanismIds.map(getMechanismById).filter(Boolean);
  const hookKeywords = mechanisms.flatMap(m => m?.hooks || []).slice(0, 5);

  onProgress('Google 검색으로 바이럴 트렌드 분석 중...', 30);

  // Build Google Native payload with Search grounding
  const systemText = `당신은 유튜브 바이럴 콘텐츠 기획 전문가입니다.
Google 검색을 활용하여 최신 바이럴 트렌드와 인기 유튜브 영상을 조사한 뒤,
사용자가 선택한 심리 본능 기제를 결합하여 폭발적 조회수가 예상되는 새로운 콘텐츠 소재 5개를 추천합니다.
반드시 JSON 배열로만 응답하세요. 마크다운 코드블록 없이 순수 JSON만.`;

  const userText = `[선택된 본능 기제]
${instinctPrompt}

[훅 키워드]
${hookKeywords.join(', ')}
${keyword ? `\n[사용자 지정 키워드]\n${keyword}` : ''}
${channelGuideline ? `\n[채널 가이드라인]\n${channelGuideline}` : ''}

[작업 지시]
1. 먼저 Google 검색으로 위 키워드와 관련된 최근 유튜브 바이럴 영상, 트렌드, 화제 주제를 조사하세요.
2. 조사 결과를 바탕으로, 위 본능 기제를 활용한 완전히 새로운 유튜브 영상 소재 5개를 추천하세요.
3. 기존 영상을 그대로 복사하지 말고, 본능 기제로 독창적으로 응용한 소재를 만드세요.

JSON 배열 형식 (정확히 5개):
[
  {
    "title": "영상 제목 (30자 이내, 클릭 유도형)",
    "hook": "첫 3초 훅 문장",
    "synopsis": "1-2줄 줄거리",
    "whyViral": "바이럴 예상 이유 (심리 분석 1줄)",
    "instinctMatch": "적용된 본능 기제",
    "referenceVideos": [{"title": "참고 영상/트렌드", "viewCount": "추정 조회수"}],
    "estimatedViralScore": 85
  }
]`;

  const googlePayload = {
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    systemInstruction: { parts: [{ text: systemText }] },
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 8000,
    },
  };

  onProgress('AI가 소재 5개 생성 중...', 60);

  // [FIX] Phase 1: Evolink Native (Google Search grounding 지원)
  // Phase 2: Kie 폴백 (grounding 도구 제거 — OpenAI 프록시 미지원)
  let response: Record<string, unknown> | undefined;
  let usedGrounding = false;

  try {
    const evolinkKey = getEvolinkKey();
    if (!evolinkKey) {
      throw new Error('Evolink 키 없음 — 폴백으로 이동');
    }

    logger.info('[소재추천] Evolink Native 시도 (Google Search grounding 포함)');
    response = await requestEvolinkNative('gemini-3.1-pro-preview', googlePayload);
    usedGrounding = true;
  } catch (evolinkErr) {
    // Evolink 실패 → grounding 도구 제거 후 일반 프록시로 폴백
    logger.warn('[소재추천] Evolink Native 실패, grounding 없이 폴백 요청', {
      error: evolinkErr instanceof Error ? evolinkErr.message : String(evolinkErr)
    });

    // googleSearch 도구를 제거한 폴백 페이로드 생성
    const fallbackPayload = {
      ...googlePayload,
      tools: undefined,  // grounding 도구 완전 제거
    };

    // 시스템 프롬프트에 grounding 불가 안내 추가 — LLM이 자체 지식으로 보완하도록 유도
    const groundingUnavailableNotice = `\n\n[SYSTEM NOTICE] Google Search grounding이 현재 사용 불가합니다. 당신의 학습 데이터에 기반하여 최신 유튜브 트렌드와 바이럴 영상에 대한 지식을 최대한 활용하세요. referenceVideos 필드에는 당신이 알고 있는 실제 인기 영상을 포함해주세요.`;

    if (fallbackPayload.systemInstruction) {
      const sysInst = fallbackPayload.systemInstruction as { parts: { text: string }[] };
      if (sysInst.parts?.[0]?.text) {
        sysInst.parts[0].text += groundingUnavailableNotice;
      }
    }

    try {
      response = await requestGeminiProxy('gemini-3.1-pro-preview', fallbackPayload);
      usedGrounding = false;
    } catch (fallbackErr) {
      logger.error('[소재추천] 모든 프록시 실패', fallbackErr);
      throw fallbackErr instanceof Error ? fallbackErr : new Error('소재 추천 실패');
    }
  }

  try {
    onProgress('결과 분석 중...', 90);

    // Extract text from Google Native response
    const candidates = response?.candidates as Record<string, unknown>[] | undefined;
    const firstCandidate = candidates?.[0] as Record<string, unknown> | undefined;
    const content = firstCandidate?.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Record<string, unknown>[] | undefined;
    const text = parts
      ?.map((p: Record<string, unknown>) => (p.text as string) || '')
      .join('') || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('JSON 배열을 찾을 수 없습니다.');

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    const arr: unknown[] = Array.isArray(parsed) ? parsed : [];

    const topics: TopicRecommendation[] = arr.slice(0, 5).map((item: unknown, i: number) => {
      const t = item as Record<string, unknown>;
      const refVideos = (t.referenceVideos || t.reference_videos) as Record<string, unknown>[] | undefined;
      return {
        id: `topic-${Date.now()}-${i}`,
        title: String(t.title || `소재 ${i + 1}`),
        hook: String(t.hook || ''),
        synopsis: String(t.synopsis || ''),
        whyViral: String(t.whyViral || t.why_viral || ''),
        instinctMatch: String(t.instinctMatch || t.instinct_match || ''),
        referenceVideos: Array.isArray(refVideos)
          ? refVideos.map((v: Record<string, unknown>) => ({
              title: String(v.title || ''),
              viewCount: String(v.viewCount || v.view_count || ''),
            }))
          : [],
        estimatedViralScore: Number(t.estimatedViralScore || t.estimated_viral_score || 70),
      };
    });

    topics.sort((a, b) => b.estimatedViralScore - a.estimatedViralScore);

    onProgress('소재 추천 완료!', 100);

    if (usedGrounding) {
      logger.success('[소재추천] Google Search grounding 완료', { count: topics.length });
    } else {
      logger.warn('[소재추천] grounding 없이 완료 (LLM 자체 지식 기반 — 정확도 낮을 수 있음)', { count: topics.length });
    }

    return topics;
  } catch (err) {
    logger.error('[소재추천] 응답 파싱 실패', err);
    throw err instanceof Error ? err : new Error('소재 추천 실패');
  }
};
