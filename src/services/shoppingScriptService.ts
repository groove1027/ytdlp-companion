/**
 * Shopping Script Service — 딸깍 영상 제작
 *
 * 플로우:
 * 1. 원본 영상 오디오 추출 → 나레이션 전사 시도 (transcribeAudio 재활용)
 * 2-A. 나레이션 있음 → 전사 텍스트 + 프레임 → AI 프리셋 생성
 * 2-B. 나레이션 없음 → 프레임만으로 AI 프리셋 생성
 * 3. 프리셋 기반 v36.0 프롬프트로 대본 5개 생성
 *
 * 인프라: evolinkChat() (Gemini 3.1 Pro via Evolink)
 */

import { evolinkChat, type EvolinkChatMessage, type EvolinkContentPart } from './evolinkService';
import { transcribeAudio } from './transcriptionService';
import { logger } from './LoggerService';
import type { ShoppingProductAnalysis, ShoppingScript, ShoppingCTAPreset, CoupangCrawlResult } from '../types';
import {
  SHOPPING_SCRIPT_GUIDELINE,
  SHOPPING_SCRIPT_GUIDELINE_TITLE,
  SHOPPING_SCRIPT_GUIDELINE_VERSION,
} from '../data/shoppingScriptGuideline';

// ═══════════════════════════════════════════════════════════════
// v36.0 동적 타겟팅 기반 쇼핑형 대본 생성 지침서 (전문)
// ═══════════════════════════════════════════════════════════════

const SHOPPING_SYSTEM_PROMPT = SHOPPING_SCRIPT_GUIDELINE;

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
      } catch (e) {
        logger.trackSwallowedError('shoppingScriptService:audioCapture', e);
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
// 대본 생성 (v36.0 프롬프트 전문 적용)
// ═══════════════════════════════════════════════════════════════

/**
 * 상품 프리셋 → v36.0 지침서 기반 대본 5개 생성
 */
export const generateShoppingScripts = async (
  analysis: ShoppingProductAnalysis,
  duration: number,
  ctaPreset: ShoppingCTAPreset,
  narrationText?: string | null,
): Promise<ShoppingScript[]> => {
  logger.info(`[ShoppingScript] ${SHOPPING_SCRIPT_GUIDELINE_VERSION} 대본 생성 시작`, {
    product: analysis.productName,
    duration,
    hasNarration: !!narrationText,
  });

  const ctaGuide: Record<ShoppingCTAPreset, string> = {
    comment: '댓글로 구매 링크 보내드려요',
    profile: '프로필 링크에서 확인하세요',
    link: '하단 링크 클릭',
  };

  // 소스 영상 총 길이의 ~90%로 설정 (편집 여유분 확보, 최소 15초)
  const targetDuration = Math.max(15, Math.round(duration * 0.9));

  const narrationRef = narrationText
    ? `\n\n## 원본 나레이션 참고\n원본 영상의 나레이션입니다. 이 톤과 내용을 참고하되, 한국어 쇼핑 숏폼에 맞게 재창작하세요:\n\`\`\`\n${narrationText}\n\`\`\``
    : '';

  const messages: EvolinkChatMessage[] = [
    {
      role: 'system',
      content: `${SHOPPING_SYSTEM_PROMPT}

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

위 프리셋을 기반으로 ${SHOPPING_SCRIPT_GUIDELINE_TITLE}의 동적 타겟팅 + 4단계 구매 합리화 프로토콜을 적용한 쇼핑 숏폼 대본 5개를 생성해주세요.`,
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
  logger.success(`[ShoppingScript] ${SHOPPING_SCRIPT_GUIDELINE_VERSION} 대본 생성 완료`, { count: scripts.length });

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
 * 쿠팡 상품 프리셋 → v36.0 지침서 기반 대본 5개 생성
 * 크롤링 데이터의 가격/리뷰/할인 정보를 대본에 직접 반영
 */
export const generateCoupangShoppingScripts = async (
  analysis: ShoppingProductAnalysis,
  crawlResult: CoupangCrawlResult,
  ctaPreset: ShoppingCTAPreset,
): Promise<ShoppingScript[]> => {
  logger.info(`[ShoppingScript] 쿠팡 ${SHOPPING_SCRIPT_GUIDELINE_VERSION} 대본 생성 시작`, {
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
      content: `${SHOPPING_SYSTEM_PROMPT}

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

위 프리셋과 리뷰를 기반으로 ${SHOPPING_SCRIPT_GUIDELINE_TITLE}의 동적 타겟팅 + 4단계 구매 합리화 프로토콜을 적용한 쇼핑 숏폼 대본 5개를 생성해주세요.`,
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
  logger.success(`[ShoppingScript] 쿠팡 ${SHOPPING_SCRIPT_GUIDELINE_VERSION} 대본 생성 완료`, { count: scripts.length });

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
 * ★ WebCodecs VideoDecoder 우선 → Canvas 폴백
 */
export const extractFramesForAnalysis = async (
  videoBlob: Blob,
  frameCount: number = 6,
): Promise<string[]> => {
  // ── WebCodecs 정밀 추출 우선 ──
  try {
    const { webcodecExtractFrames, isVideoDecoderSupported } =
      await import('./webcodecs/videoDecoder');

    if (isVideoDecoderSupported()) {
      // duration 계산을 위한 임시 video 요소
      const dur = await getVideoDurationFromBlob(videoBlob);
      if (dur && dur > 0.5) {
        const timestamps: number[] = [];
        for (let i = 0; i < frameCount; i++) {
          timestamps.push((dur / (frameCount + 1)) * (i + 1));
        }
        const frames = await webcodecExtractFrames(videoBlob, timestamps, { thumbWidth: 768, thumbQuality: 0.8 });
        if (frames.length > 0) {
          console.log(`[ShoppingScript] ✅ WebCodecs 정밀 추출: ${frames.length}개`);
          return frames.map(f => f.url);
        }
      }
    }
  } catch (e) {
    console.warn('[ShoppingScript] WebCodecs 실패 → canvas 폴백:', e);
  }

  // ── Canvas 폴백 (기존 방식) ──
  return extractFramesForAnalysisLegacy(videoBlob, frameCount);
};

/** Blob → duration 조회 */
function getVideoDurationFromBlob(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    const url = URL.createObjectURL(blob);
    video.src = url;
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(video.duration) ? video.duration : null); };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    setTimeout(() => { URL.revokeObjectURL(url); resolve(null); }, 5000);
  });
}

/** [레거시] Canvas 기반 프레임 추출 — WebCodecs 폴백용 */
const extractFramesForAnalysisLegacy = (
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
