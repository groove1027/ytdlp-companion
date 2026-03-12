import { evolinkChat } from './evolinkService';
import { logger } from './LoggerService';
import type { ShoppingTag } from '../types';

/**
 * 대본에서 제품/브랜드/서비스 쇼핑 태그 추출 — 마스터 지침서 6단계 적용
 * 쿠팡 파트너스/쇼핑 연계: 비주얼 일치 우선, 검색 키워드 추천
 */
export async function extractShoppingTags(
  fullScript: string,
  sceneSummaries: string[] = []
): Promise<ShoppingTag[]> {
  if (!fullScript.trim()) return [];

  const systemPrompt = `너는 쿠팡 파트너스 및 콘텐츠 커머스 전문가다.
영상 대본을 분석하여 수익화(Monetization)를 위한 쇼핑 태그를 추출하라.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6단계: 쿠팡 파트너스/쇼핑 연계 (Monetization)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
목표: 대본 속 언급된 제품과 가장 유사한 상품을 매칭하여 구매 전환 유도.

매칭 우선순위:
1. 비주얼 일치 (최우선): 키워드가 달라도 대본에서 묘사된 제품과 시각적으로 가장 똑같은 제품
2. 키워드/유사성: 기능이나 형태가 유사한 대체 제품
3. 관련 소비재: 대본 주제와 관련된 소비 가능한 제품/서비스

추출 규칙:
- 대본에서 명시적으로 언급되거나 시각적으로 묘사된 제품/브랜드만 추출
- 일반 명사 아닌 구체적 제품/브랜드명 우선 (예: "애플 맥북 프로 M3" → O, "노트북" → X)
- 각 제품에 쿠팡 검색 최적화 키워드 제공 (실제 검색했을 때 해당 제품이 나올 키워드)
- 카테고리별로 분류하여 정리
- 최대 15개

반드시 다음 JSON 형식으로 응답:
{
  "shoppingTags": [
    {
      "keyword": "제품명/브랜드명 (구체적)",
      "category": "카테고리",
      "searchKeyword": "쿠팡 검색 최적화 키워드",
      "matchReason": "비주얼일치|키워드유사|관련소비재"
    }
  ]
}

카테고리 종류: 전자제품, 패션, 식품, 뷰티, 생활, 도서, 여행, 자동차, 건강, 교육, 소프트웨어, 가전, 유아, 스포츠, 기타`;

  const sceneContext = sceneSummaries.length > 0
    ? `\n\n장면별 비주얼 묘사:\n${sceneSummaries.slice(0, 20).map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';

  const userPrompt = `다음 대본에서 쿠팡 파트너스 연계용 쇼핑 태그를 추출해주세요.
비주얼 일치를 최우선으로, 실제 쿠팡에서 검색 가능한 키워드로 제공해주세요:

${fullScript.slice(0, 6000)}${sceneContext}`;

  const response = await evolinkChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      temperature: 0.3,
      maxTokens: 2048,
      responseFormat: { type: 'json_object' },
    }
  );

  const content = response.choices?.[0]?.message?.content || '';

  try {
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    const tags = Array.isArray(parsed.shoppingTags) ? parsed.shoppingTags : [];

    return tags
      .filter((t: Record<string, unknown>) => t && typeof t.keyword === 'string' && t.keyword.trim())
      .map((t: Record<string, unknown>) => ({
        keyword: String(t.keyword).trim(),
        category: typeof t.category === 'string' ? t.category : '기타',
      }))
      .slice(0, 15);
  } catch (e) {
    logger.trackSwallowedError('shoppingTagService:extractShoppingTags', e);
    return [];
  }
}
