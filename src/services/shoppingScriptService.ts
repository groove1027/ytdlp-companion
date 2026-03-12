/**
 * Shopping Script Service — 딸깍 영상 제작
 *
 * 플로우:
 * 1. 원본 영상 오디오 추출 → 나레이션 전사 시도 (transcribeAudio 재활용)
 * 2-A. 나레이션 있음 → 전사 텍스트 + 프레임 → AI 프리셋 생성
 * 2-B. 나레이션 없음 → 프레임만으로 AI 프리셋 생성
 * 3. 프리셋 기반 v31.0 프롬프트로 대본 5개 생성
 *
 * 인프라: evolinkChat() (Gemini 3.1 Pro via Evolink)
 */

import { evolinkChat, type EvolinkChatMessage, type EvolinkContentPart } from './evolinkService';
import { transcribeAudio } from './transcriptionService';
import { logger } from './LoggerService';
import type { ShoppingProductAnalysis, ShoppingScript, ShoppingCTAPreset, CoupangCrawlResult } from '../types';

// ═══════════════════════════════════════════════════════════════
// v31.0 동적 타겟팅 기반 쇼핑형 대본 생성 지침서 (전문)
// ═══════════════════════════════════════════════════════════════

const V31_SYSTEM_PROMPT = `# <동적 타겟팅 기반 쇼핑형 대본 생성 지침서 v31.0>

이 지침서는 입력된 소재를 분석하여 **가장 구매 확률이 높은 '최적의 타겟'을 스스로 찾아내고**, 그들의 구매 욕구를 자극하는 쇼핑형 숏폼 대본 제작을 위한 절대 규칙이다.

---

### **[단계 0: DYNAMIC TARGETING 🎯 - 최적 타겟 자동 발굴]**

**최상위 목표:** 업로드된 영상/이미지/텍스트 소스를 분석하여, 해당 제품에 **가장 즉각적이고 폭발적인 구매 반응**을 보일 '최적의 타겟 페르소나'를 AI가 스스로 정의하고 선언한다.

**실행 프로세스:**
1.  **소재 매력도 스캔:** 제품의 기능, 디자인, 감성이 어떤 연령대/성별/관심사 그룹(예: 3040 남성, 1020 여성, 펫오너, 자취생 등)에게 '필수템'으로 인식될지 판단한다.
2.  **톤앤매너 매칭:** 제품이 주는 분위기(힙함, 귀여움, 웅장함, 실용적임)를 타겟의 소비 성향과 매칭한다.
3.  **최종 타겟 선언:** 대본 작성 전, 반드시 **[타겟 명칭]**과 **[그들이 이 제품을 사야 하는 핵심 이유]**를 먼저 선언한다.

---

### **[단계 1: 4단계 '구매 합리화' 프로토콜]**

단순한 제품 소개가 아닌, **[단계 0]에서 설정된 타겟**이 이 물건을 살 수밖에 없는 '명분'을 만들어주는 4단계 구조를 엄수한다.

**1단계: 타겟 본능 후킹 & 문제 종결 (0~5초)**
* **목표:** 설정된 타겟을 정확히 호출하고, 이 제품이 그들의 고질적인 문제나 갈증을 해결함을 선언한다.
* **패턴 (타겟에 따라 자동 변환):**
    * (타겟: 남성/덕후) \`와, 남자들 이거 보면 환장합니다.\` / \`이걸로 [고민] 끝입니다.\`
    * (타겟: 여성/감성) \`보자마자 소리 질렀어요.\` / \`이 분위기 진짜 미쳤죠?\`
    * (타겟: 주부/생활) \`살림은 장비빨이라더니.\` / \`이거 하나면 [집안일] 종결입니다.\`
* **내용:** 제품의 핵심 가치를 타겟의 언어로 한 문장 요약하여 선포한다.

**2단계: 기술적 명분 & 디테일 해부 (5~20초)**
* **목표:** 단순한 물건이 아님을 증명한다. 타겟이 중요하게 생각하는 포인트(스펙, 성분, 디자인, 맛 등)를 파고든다.
* **화법 (타겟 맞춤):**
    * **원리/성분:** \`내부의 [핵심요소]가 ~하게 작용하는데요\`
    * **디테일/마감:** \`단순한 ~이 아니라, ~까지 완벽하게 신경 썼죠\`
    * **효과/결과:** \`한 번만 써봐도 ~가 확 달라집니다\`

**3단계: 로망 실현 & 라이프스타일의 변화 (20~30초)**
* **목표:** 제품 사용 시 변하게 될 타겟의 '삶의 질'이나 '이미지'를 이상적으로 묘사한다.
* **필수 도입:** \`"게다가 ~"\`, \`"진짜 하이라이트는 여기죠."\`
* **내용:** 지루한 일상이나 불편했던 상황이 이 제품 하나로 인해 **[타겟이 꿈꾸는 이상적인 공간/상황]**으로 바뀌는 경험을 판매한다.
    * *예(남성): 책상이 화려한 서킷으로 변신 / 예(자취생): 3분 만에 미슐랭 식당으로 변신*

**4단계: 현실적 위트 & 사용 제안 (마무리)**
* **목표:** 로망에서 현실로 돌아오게 하며, 구체적인 사용 씬(Scene)이나 구매 팁, 귀여운 경고를 날린다.
* **화법:** \`~라고 하네요\`, \`~할지도 모르겠네요\`, \`~하기엔 이만한 게 없죠\`
* **내용:** 등짝 스매싱, 텅장 주의, 품절 대란, 선물용 추천 등 현실적인 멘트로 마무리한다.

---

### **[단계 2: 타겟 맞춤형 톤앤매너 적용]**

**[단계 0]에서 설정된 타겟**에게 가장 먹히는 페르소나를 장착한다.

* **전문가/에디터 톤 (남성/테크 타겟):** 분석적, 흥분, 자신감 (\`압도적인\`, \`괴물 같은 성능\`, \`솔직히 미쳤습니다\`)
* **찐친/공감 톤 (여성/1020 타겟):** 감성적, 호들갑, 공유 욕구 (\`대박\`, \`너무 영롱하죠\`, \`나만 알고 싶은데\`)
* **선배/정보통 톤 (주부/생활 타겟):** 신뢰, 실용성 강조, 솔직함 (\`확실히 다릅니다\`, \`후회 안 하실 거예요\`)

---

### **[단계 3: 출력 형식 (The Output Protocol)]**

위 원칙을 적용하여, **설정된 타겟을 공략하는 총 5개의 대본**을 생성한다.
**각 대본은 사용자가 편하게 복사할 수 있도록 반드시 별도의 코드 블록(Code Block) 안에 작성한다.**

**[분석 결과]**
* **타겟:** [AI가 분석한 타겟 명칭]
* **소구점:** [타겟을 낚을 핵심 포인트]

**1. 제목:** [본능/직관 자극형 제목]
\\\`\\\`\\\`text
(대본 내용 - 4단계 구조 적용)
\\\`\\\`\\\`
**2. 제목:** [기능/스펙/효과 강조형 제목]
\\\`\\\`\\\`text
(대본 내용 - 4단계 구조 적용)
\\\`\\\`\\\`
**3. 제목:** [감성/로망/인테리어 자극형 제목]
\\\`\\\`\\\`text
(대본 내용 - 4단계 구조 적용)
\\\`\\\`\\\`
**4. 제목:** [상황 제시/공감 유도형 제목]
\\\`\\\`\\\`text
(대본 내용 - 4단계 구조 적용)
\\\`\\\`\\\`
**5. 제목:** [가성비/선물 추천형 제목]
\\\`\\\`\\\`text
(대본 내용 - 4단계 구조 적용)
\\\`\\\`\\\``;

// ═══════════════════════════════════════════════════════════════
// 오디오 추출 (비디오 → 오디오 Blob)
// ═══════════════════════════════════════════════════════════════

/**
 * 비디오 Blob에서 오디오 트랙 추출 (MediaRecorder 활용)
 */
export const extractAudioFromVideo = async (videoBlob: Blob): Promise<Blob | null> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const _audioSrcUrl = URL.createObjectURL(videoBlob);
    logger.registerBlobUrl(_audioSrcUrl, 'video', 'shoppingScriptService:extractAudioFromVideo');
    video.src = _audioSrcUrl;
    video.muted = false;
    video.volume = 1;

    video.onloadedmetadata = async () => {
      try {
        // @ts-expect-error captureStream is not in standard types
        const stream: MediaStream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
        const audioTracks = stream.getAudioTracks();

        if (audioTracks.length === 0) {
          logger.info('[ShoppingScript] 영상에 오디오 트랙 없음');
          logger.unregisterBlobUrl(_audioSrcUrl);
          URL.revokeObjectURL(_audioSrcUrl);
          resolve(null);
          return;
        }

        const audioStream = new MediaStream(audioTracks);
        const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
          logger.unregisterBlobUrl(_audioSrcUrl);
          URL.revokeObjectURL(_audioSrcUrl);
          if (chunks.length === 0) { resolve(null); return; }
          resolve(new Blob(chunks, { type: 'audio/webm' }));
        };

        recorder.start();
        video.play();

        // 최대 60초만 녹음 (숏폼이므로)
        const maxDuration = Math.min(video.duration, 60) * 1000;
        setTimeout(() => {
          recorder.stop();
          video.pause();
        }, maxDuration + 500);

        video.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
      } catch {
        logger.unregisterBlobUrl(_audioSrcUrl);
        URL.revokeObjectURL(_audioSrcUrl);
        resolve(null);
      }
    };

    video.onerror = () => {
      logger.unregisterBlobUrl(_audioSrcUrl);
      URL.revokeObjectURL(_audioSrcUrl);
      resolve(null);
    };
  });
};

// ═══════════════════════════════════════════════════════════════
// 나레이션 감지 + 전사
// ═══════════════════════════════════════════════════════════════

/**
 * 원본 영상에서 나레이션 감지 → 전사 시도
 * 성공 시 전사 텍스트 반환, 실패/무음 시 null
 */
export const detectNarration = async (
  videoBlob: Blob,
  onProgress?: (msg: string) => void,
): Promise<string | null> => {
  onProgress?.('오디오 트랙 추출 중...');
  logger.info('[ShoppingScript] 나레이션 감지 시작');

  try {
    const audioBlob = await extractAudioFromVideo(videoBlob);
    if (!audioBlob || audioBlob.size < 5000) {
      logger.info('[ShoppingScript] 오디오 없거나 너무 짧음, 나레이션 없는 것으로 판단');
      return null;
    }

    onProgress?.('나레이션 전사 중...');
    const result = await transcribeAudio(audioBlob, {
      onProgress: (msg) => onProgress?.(msg),
    });

    // 전사 결과가 너무 짧으면 배경음으로 판단
    if (!result.text || result.text.trim().length < 10) {
      logger.info('[ShoppingScript] 전사 결과 너무 짧음 — 나레이션 없는 것으로 판단', { text: result.text });
      return null;
    }

    logger.success('[ShoppingScript] 나레이션 감지 완료', {
      language: result.language,
      length: result.text.length,
    });

    return result.text;
  } catch (e) {
    logger.warn('[ShoppingScript] 나레이션 감지 실패 (영상 프레임만으로 진행)', { error: (e as Error).message });
    return null;
  }
};

// ═══════════════════════════════════════════════════════════════
// 상품 분석 (프리셋 생성)
// ═══════════════════════════════════════════════════════════════

/**
 * 영상 프레임 + (선택) 나레이션 텍스트 → Gemini Vision → 상품 프리셋 생성
 * 나레이션이 있으면 원본 내용을 기반으로 더 정확한 분석
 */
export const analyzeVideoProduct = async (
  frameBase64List: string[],
  narrationText?: string | null,
): Promise<ShoppingProductAnalysis> => {
  logger.info('[ShoppingScript] 상품 분석 시작', {
    frameCount: frameBase64List.length,
    hasNarration: !!narrationText,
  });

  const imageContent: EvolinkContentPart[] = frameBase64List.slice(0, 6).map(b64 => ({
    type: 'image_url' as const,
    image_url: { url: b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}` },
  }));

  const narrationContext = narrationText
    ? `\n\n## 원본 영상 나레이션 (전사 텍스트)\n원본 영상에 포함된 나레이션입니다. 이 텍스트를 상품 분석의 핵심 소스로 활용하세요:\n\`\`\`\n${narrationText}\n\`\`\``
    : '';

  const messages: EvolinkChatMessage[] = [
    {
      role: 'system',
      content: `당신은 해외 쇼핑 영상 전문 분석가입니다.
영상 프레임${narrationText ? '과 원본 나레이션 텍스트' : ''}을 보고 상품 정보를 정확히 분석하세요.
${narrationText ? '나레이션 텍스트가 제공된 경우, 이를 최우선 정보 소스로 활용하여 상품 기능/매력 포인트를 정확히 파악하세요.' : ''}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "productName": "상품명 (한국어)",
  "category": "카테고리 (전자제품/패션/뷰티/식품/생활/기타)",
  "targetAudience": "최적 타겟 고객층 (예: 3040 여성, 테크 덕후 남성, 자취생, 펫오너 등)",
  "keyFeatures": ["핵심 기능 1", "핵심 기능 2", "핵심 기능 3", ...],
  "appealPoints": ["매력 포인트 1", "매력 포인트 2", "매력 포인트 3", ...]
}${narrationContext}`,
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: narrationText
            ? '위 나레이션 텍스트와 영상 프레임을 종합 분석하여, 상품 프리셋을 생성해주세요.'
            : '이 영상의 상품을 분석해주세요. 영상에서 보이는 상품의 이름, 카테고리, 타겟 고객, 핵심 기능, 매력 포인트를 파악해주세요.',
        },
        ...imageContent,
      ],
    },
  ];

  const response = await evolinkChat(messages, {
    temperature: 0.3,
    maxTokens: 2048,
  });

  const text = response.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('상품 분석 결과를 파싱할 수 없습니다.');

  const analysis = JSON.parse(jsonMatch[0]) as ShoppingProductAnalysis;
  logger.success('[ShoppingScript] 상품 프리셋 생성 완료', { productName: analysis.productName });
  return analysis;
};

// ═══════════════════════════════════════════════════════════════
// 대본 생성 (v31.0 프롬프트 전문 적용)
// ═══════════════════════════════════════════════════════════════

/**
 * 상품 프리셋 → v31.0 지침서 기반 대본 5개 생성
 */
export const generateShoppingScripts = async (
  analysis: ShoppingProductAnalysis,
  duration: number,
  ctaPreset: ShoppingCTAPreset,
  narrationText?: string | null,
): Promise<ShoppingScript[]> => {
  logger.info('[ShoppingScript] v31.0 대본 생성 시작', {
    product: analysis.productName,
    duration,
    hasNarration: !!narrationText,
  });

  const ctaGuide: Record<ShoppingCTAPreset, string> = {
    comment: '댓글로 구매 링크 보내드려요',
    profile: '프로필 링크에서 확인하세요',
    link: '하단 링크 클릭',
  };

  const targetDuration = Math.max(15, Math.min(60, Math.round(duration)));

  const narrationRef = narrationText
    ? `\n\n## 원본 나레이션 참고\n원본 영상의 나레이션입니다. 이 톤과 내용을 참고하되, 한국어 쇼핑 숏폼에 맞게 재창작하세요:\n\`\`\`\n${narrationText}\n\`\`\``
    : '';

  const messages: EvolinkChatMessage[] = [
    {
      role: 'system',
      content: `${V31_SYSTEM_PROMPT}

## 추가 지시사항
- CTA 문구: "${ctaGuide[ctaPreset]}" 를 4단계 마무리에 자연스럽게 삽입
- 약 ${targetDuration}초 분량 (한국어 기준 초당 3~4글자)
- 한국어 구어체 (반말 + ~요체 자연스럽게 혼합)
- 감탄사, 의성어 적극 활용

## 출력 형식 (반드시 JSON 배열로)
[
  {
    "id": "script-1",
    "title": "대본 접근법 이름",
    "sections": {
      "hooking": "1단계 후킹 텍스트",
      "detail": "2단계 디테일 텍스트",
      "romance": "3단계 로망 텍스트",
      "wit": "4단계 위트+CTA 텍스트"
    },
    "fullText": "전체 나레이션 텍스트 (4단계 합본, 자연스럽게 이어지도록)",
    "estimatedDuration": ${targetDuration}
  }
]

5개를 생성하세요.${narrationRef}`,
    },
    {
      role: 'user',
      content: `[분석 결과 — 프리셋]
- 상품명: ${analysis.productName}
- 카테고리: ${analysis.category}
- 최적 타겟: ${analysis.targetAudience}
- 핵심 기능: ${analysis.keyFeatures.join(', ')}
- 매력 포인트: ${analysis.appealPoints.join(', ')}

위 프리셋을 기반으로 v31.0 지침서의 동적 타겟팅 + 4단계 구매 합리화 프로토콜을 적용한 쇼핑 숏폼 대본 5개를 생성해주세요.`,
    },
  ];

  const response = await evolinkChat(messages, {
    temperature: 0.8,
    maxTokens: 6144,
  });

  const text = response.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('대본 생성 결과를 파싱할 수 없습니다.');

  const scripts = JSON.parse(jsonMatch[0]) as ShoppingScript[];
  logger.success('[ShoppingScript] v31.0 대본 생성 완료', { count: scripts.length });

  return scripts.map((s, i) => ({
    ...s,
    id: s.id || `script-${i + 1}`,
    estimatedDuration: s.estimatedDuration || targetDuration,
  }));
};

// ═══════════════════════════════════════════════════════════════
// 쿠팡 크롤링 데이터 기반 분석 (영상 없이)
// ═══════════════════════════════════════════════════════════════

/**
 * 쿠팡 크롤링 데이터 → 상품 프리셋 생성
 * 영상 프레임 대신 크롤링된 텍스트/이미지 데이터를 활용
 */
export const analyzeCoupangProduct = async (
  crawlResult: CoupangCrawlResult,
): Promise<ShoppingProductAnalysis> => {
  const { product, topPositiveReviews, topNegativeReviews, photoReviewKeywords } = crawlResult;

  logger.info('[ShoppingScript] 쿠팡 상품 분석 시작', {
    name: product.productName,
    reviewCount: crawlResult.reviews.length,
  });

  // 상품 이미지가 있으면 Vision 분석에 포함
  const imageContent: EvolinkContentPart[] = product.mainImageUrl
    ? [{ type: 'image_url' as const, image_url: { url: product.mainImageUrl } }]
    : [];

  const messages: EvolinkChatMessage[] = [
    {
      role: 'system',
      content: `당신은 쿠팡 상품 데이터 전문 분석가입니다.
크롤링된 상품 정보와 리뷰 데이터를 분석하여 최적의 쇼핑 숏폼 프리셋을 생성하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "productName": "상품명 (한국어, 간결하게)",
  "category": "카테고리",
  "targetAudience": "최적 타겟 고객층",
  "keyFeatures": ["핵심 기능 1", ...],
  "appealPoints": ["매력 포인트 1", ...]
}`,
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `## 쿠팡 크롤링 데이터
- 상품명: ${product.productName}
- 가격: ${product.price.toLocaleString()}원${product.originalPrice ? ` (정가 ${product.originalPrice.toLocaleString()}원, ${product.discountRate} 할인)` : ''}
- 카테고리: ${product.category}
- 별점: ${product.rating} (${product.reviewCount.toLocaleString()}개)
- 로켓배송: ${product.isRocketDelivery ? '예' : '아니오'}
- 상세 설명: ${product.description}

## 긍정 리뷰 TOP 5
${topPositiveReviews.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## 부정 리뷰 TOP 3
${topNegativeReviews.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## 포토리뷰 키워드
${photoReviewKeywords.join(', ')}

위 데이터를 종합 분석하여 쇼핑 숏폼 프리셋을 생성해주세요.
리뷰에서 실제 구매자들이 어떤 점을 좋아하는지, 어떤 타겟이 주로 구매하는지 파악하세요.`,
        },
        ...imageContent,
      ],
    },
  ];

  const response = await evolinkChat(messages, {
    temperature: 0.3,
    maxTokens: 2048,
  });

  const text = response.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('쿠팡 상품 분석 결과를 파싱할 수 없습니다.');

  const analysis = JSON.parse(jsonMatch[0]) as ShoppingProductAnalysis;

  // 쿠팡 전용 확장 필드 추가
  analysis.price = product.price;
  analysis.originalPrice = product.originalPrice;
  analysis.discountRate = product.discountRate;
  analysis.rating = product.rating;
  analysis.reviewCount = product.reviewCount;
  analysis.isRocketDelivery = product.isRocketDelivery;

  logger.success('[ShoppingScript] 쿠팡 상품 프리셋 생성 완료', { productName: analysis.productName });
  return analysis;
};

/**
 * 쿠팡 상품 프리셋 → v31.0 지침서 기반 대본 5개 생성
 * 크롤링 데이터의 가격/리뷰/할인 정보를 대본에 직접 반영
 */
export const generateCoupangShoppingScripts = async (
  analysis: ShoppingProductAnalysis,
  crawlResult: CoupangCrawlResult,
  ctaPreset: ShoppingCTAPreset,
): Promise<ShoppingScript[]> => {
  logger.info('[ShoppingScript] 쿠팡 v31.0 대본 생성 시작', {
    product: analysis.productName,
  });

  const ctaGuide: Record<ShoppingCTAPreset, string> = {
    comment: '댓글로 구매 링크 보내드려요',
    profile: '프로필 링크에서 확인하세요',
    link: '하단 링크 클릭',
  };

  const { product, topPositiveReviews } = crawlResult;
  const priceInfo = product.discountRate
    ? `${product.price.toLocaleString()}원 (${product.discountRate} 할인)`
    : `${product.price.toLocaleString()}원`;

  const messages: EvolinkChatMessage[] = [
    {
      role: 'system',
      content: `${V31_SYSTEM_PROMPT}

## 추가 지시사항 — 쿠팡 쇼핑 콘텐츠 전용
- CTA 문구: "${ctaGuide[ctaPreset]}" 를 4단계 마무리에 자연스럽게 삽입
- 약 25~35초 분량 (한국어 기준 초당 3~4글자)
- 한국어 구어체 (반말 + ~요체 자연스럽게 혼합)
- 감탄사, 의성어 적극 활용
- **가격 임팩트**: 할인율/가성비를 반드시 강조
- **사회적 증거**: 별점 ${product.rating}, 리뷰 ${product.reviewCount.toLocaleString()}개를 자연스럽게 녹여라
- **실사용 후기**: 리뷰 내용을 대본에 "실제 구매자" 느낌으로 인용해라
${product.isRocketDelivery ? '- **로켓배송 멘트**: "내일 바로 도착" 느낌을 넣어라' : ''}
- 절대 설명형 리뷰 영상 금지! Hook-first 바이럴 콘텐츠만!

## 출력 형식 (반드시 JSON 배열로)
[
  {
    "id": "script-1",
    "title": "대본 접근법 이름",
    "sections": {
      "hooking": "1단계 후킹 텍스트",
      "detail": "2단계 디테일 텍스트",
      "romance": "3단계 로망 텍스트",
      "wit": "4단계 위트+CTA 텍스트"
    },
    "fullText": "전체 나레이션 텍스트 (4단계 합본)",
    "estimatedDuration": 30
  }
]

5개를 생성하세요.`,
    },
    {
      role: 'user',
      content: `[쿠팡 상품 분석 결과 — 프리셋]
- 상품명: ${analysis.productName}
- 카테고리: ${analysis.category}
- 가격: ${priceInfo}
- 최적 타겟: ${analysis.targetAudience}
- 핵심 기능: ${analysis.keyFeatures.join(', ')}
- 매력 포인트: ${analysis.appealPoints.join(', ')}
- 별점: ${product.rating} (리뷰 ${product.reviewCount.toLocaleString()}개)
${product.isRocketDelivery ? '- 로켓배송 지원' : ''}

[실제 구매 리뷰 발췌]
${topPositiveReviews.slice(0, 3).map((r, i) => `${i + 1}. "${r}"`).join('\n')}

위 프리셋과 리뷰를 기반으로 v31.0 지침서의 동적 타겟팅 + 4단계 구매 합리화 프로토콜을 적용한 쇼핑 숏폼 대본 5개를 생성해주세요.`,
    },
  ];

  const response = await evolinkChat(messages, {
    temperature: 0.8,
    maxTokens: 6144,
  });

  const text = response.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('대본 생성 결과를 파싱할 수 없습니다.');

  const scripts = JSON.parse(jsonMatch[0]) as ShoppingScript[];
  logger.success('[ShoppingScript] 쿠팡 v31.0 대본 생성 완료', { count: scripts.length });

  return scripts.map((s, i) => ({
    ...s,
    id: s.id || `script-${i + 1}`,
    estimatedDuration: s.estimatedDuration || 30,
  }));
};

// ═══════════════════════════════════════════════════════════════
// 프레임 추출 헬퍼
// ═══════════════════════════════════════════════════════════════

/**
 * 프레임 추출 — Blob/File → base64 프레임 배열
 */
export const extractFramesForAnalysis = async (
  videoBlob: Blob,
  frameCount: number = 6,
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(videoBlob);
    logger.registerBlobUrl(objectUrl, 'video', 'shoppingScriptService:extractFramesForAnalysis');
    video.preload = 'auto';
    video.muted = true;
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const timestamps: number[] = [];
      for (let i = 0; i < frameCount; i++) {
        timestamps.push((duration / (frameCount + 1)) * (i + 1));
      }

      const frames: string[] = [];
      let currentIndex = 0;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const captureNext = () => {
        if (currentIndex >= timestamps.length) {
          logger.unregisterBlobUrl(objectUrl);
          URL.revokeObjectURL(objectUrl);
          resolve(frames);
          return;
        }
        video.currentTime = timestamps[currentIndex];
      };

      video.onseeked = () => {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const scale = Math.min(1, 768 / vw, 768 / vh);
        canvas.width = Math.round(vw * scale);
        canvas.height = Math.round(vh * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.8));
        currentIndex++;
        captureNext();
      };

      captureNext();
    };

    video.onerror = () => {
      logger.unregisterBlobUrl(objectUrl);
      URL.revokeObjectURL(objectUrl);
      reject(new Error('프레임 추출 실패'));
    };
  });
};
