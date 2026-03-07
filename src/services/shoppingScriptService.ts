/**
 * Shopping Script Service — 딸깍 영상 제작
 * AI 상품 분석 + 쇼핑 대본 생성 (v31.0 프롬프트)
 *
 * 인프라: evolinkChat() (Gemini 3.1 Pro)
 */

import { evolinkChat, type EvolinkChatMessage, type EvolinkContentPart } from './evolinkService';
import { logger } from './LoggerService';
import type { ShoppingProductAnalysis, ShoppingScript, ShoppingCTAPreset } from '../types';

/**
 * 프레임 이미지 → Gemini Vision → 상품 분석
 */
export const analyzeVideoProduct = async (
  frameBase64List: string[],
): Promise<ShoppingProductAnalysis> => {
  logger.info('[ShoppingScript] 상품 분석 시작', { frameCount: frameBase64List.length });

  const imageContent: EvolinkContentPart[] = frameBase64List.slice(0, 6).map(b64 => ({
    type: 'image_url' as const,
    image_url: { url: b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}` },
  }));

  const messages: EvolinkChatMessage[] = [
    {
      role: 'system',
      content: `당신은 해외 쇼핑 영상 전문 분석가입니다.
영상 프레임을 보고 상품 정보를 정확히 분석하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "productName": "상품명 (한국어)",
  "category": "카테고리 (전자제품/패션/뷰티/식품/생활/기타)",
  "targetAudience": "타겟 고객층",
  "keyFeatures": ["핵심 기능 1", "핵심 기능 2", ...],
  "appealPoints": ["매력 포인트 1", "매력 포인트 2", ...]
}`,
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: '이 영상의 상품을 분석해주세요. 영상에서 보이는 상품의 이름, 카테고리, 타겟 고객, 핵심 기능, 매력 포인트를 파악해주세요.' },
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
  logger.success('[ShoppingScript] 상품 분석 완료', { productName: analysis.productName });
  return analysis;
};

/**
 * 상품 분석 → 쇼핑 대본 5개 생성 (v31.0 구매 합리화 4단계)
 */
export const generateShoppingScripts = async (
  analysis: ShoppingProductAnalysis,
  duration: number,
  ctaPreset: ShoppingCTAPreset,
): Promise<ShoppingScript[]> => {
  logger.info('[ShoppingScript] 대본 생성 시작', { product: analysis.productName, duration });

  const ctaGuide: Record<ShoppingCTAPreset, string> = {
    comment: '"댓글로 구매 링크 보내드려요" 유도',
    profile: '"프로필 링크에서 확인하세요" 유도',
    link: '"하단 링크 클릭" 유도',
  };

  const targetDuration = Math.max(15, Math.min(60, Math.round(duration)));

  const messages: EvolinkChatMessage[] = [
    {
      role: 'system',
      content: `당신은 한국 쇼핑 숏폼 대본 전문가입니다. v31.0 구매 합리화 4단계 공식으로 대본을 작성합니다.

## 4단계 구매 합리화 구조

### 1단계: 타겟 본능 후킹 (0~5초)
- "이거 안 사면 진짜 후회해요"
- "지금 난리 난 그 제품"
- 시청자의 본능적 호기심/FOMO 자극

### 2단계: 기술적 명분 & 디테일 (5~20초)
- 상품의 핵심 기능을 구체적 수치로 설명
- "소재가 XX라서 XX가 가능한 건데요"
- 구매를 합리화할 논리적 근거 제공

### 3단계: 로망 실현 (20~30초)
- "이거 쓰면 진짜 XX 된 기분이에요"
- 이상적인 사용 시나리오를 감성적으로 묘사
- 소유 욕구 자극

### 4단계: 현실적 위트 & CTA (마무리)
- 가벼운 유머로 구매 결정 압박 완화
- ${ctaGuide[ctaPreset]}
- "진짜 이 가격에 이 퀄리티면 안 살 이유가 없어요"

## 규칙
- 한국어 구어체 (반말 + ~요체 자연스럽게 혼합)
- 감탄사, 의성어 적극 활용
- 각 대본은 서로 다른 톤 (큐티/시크/언니/열정/차분)
- 약 ${targetDuration}초 분량으로 작성

## 출력 형식 (JSON)
[
  {
    "id": "script-1",
    "title": "톤 이름 (예: 큐티 엔젤)",
    "sections": {
      "hooking": "후킹 텍스트",
      "detail": "디테일 텍스트",
      "romance": "로망 텍스트",
      "wit": "위트+CTA 텍스트"
    },
    "fullText": "전체 나레이션 텍스트 (섹션 합본)",
    "estimatedDuration": ${targetDuration}
  },
  ...
]

5개를 생성하세요.`,
    },
    {
      role: 'user',
      content: `상품 정보:
- 상품명: ${analysis.productName}
- 카테고리: ${analysis.category}
- 타겟: ${analysis.targetAudience}
- 핵심 기능: ${analysis.keyFeatures.join(', ')}
- 매력 포인트: ${analysis.appealPoints.join(', ')}

위 상품에 대한 쇼핑 숏폼 대본 5개를 생성해주세요.`,
    },
  ];

  const response = await evolinkChat(messages, {
    temperature: 0.8,
    maxTokens: 4096,
  });

  const text = response.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('대본 생성 결과를 파싱할 수 없습니다.');

  const scripts = JSON.parse(jsonMatch[0]) as ShoppingScript[];
  logger.success('[ShoppingScript] 대본 생성 완료', { count: scripts.length });

  // id가 없는 경우 보정
  return scripts.map((s, i) => ({
    ...s,
    id: s.id || `script-${i + 1}`,
    estimatedDuration: s.estimatedDuration || targetDuration,
  }));
};

/**
 * 프레임 추출 헬퍼 — Blob/File → base64 프레임 배열
 */
export const extractFramesForAnalysis = async (
  videoBlob: Blob,
  frameCount: number = 6,
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(videoBlob);
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
      URL.revokeObjectURL(objectUrl);
      reject(new Error('프레임 추출 실패'));
    };
  });
};
