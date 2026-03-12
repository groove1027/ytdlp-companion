import { evolinkChat } from './evolinkService';
import type { EvolinkChatMessage } from './evolinkService';
import { generateEvolinkImageWrapped, generateKieImage, createApimartVeoTask, pollApimartVeoTask, createPortableGrokTask, pollKieTask } from './VideoGenService';
import { uploadMediaToHosting } from './uploadService';
import { generateShoppingScripts } from './shoppingScriptService';
import { useCostStore } from '../stores/costStore';
import { logger } from './LoggerService';
import type {
  ShoppingProductAnalysis,
  ShoppingChannelScene,
  ShoppingCharacterConfig,
  ShoppingCharacterPreset,
  ShoppingSceneTemplate,
  ShoppingScript,
  ShoppingCTAPreset,
  AspectRatio,
} from '../types';
import { AspectRatio as AR } from '../types';

// === CHARACTER PRESETS ===

const CHARACTER_PRESETS: Record<ShoppingCharacterPreset, { name: string; prompt: string }> = {
  'friendly-sister': {
    name: '친근한 언니',
    prompt: 'A friendly, approachable young Korean woman in her late 20s with warm smile, casual chic fashion, speaking directly to camera like talking to a close friend',
  },
  'expert-reviewer': {
    name: '전문 리뷰어',
    prompt: 'A professional Korean product reviewer in their 30s, clean minimal background, confident posture, wearing smart casual outfit, analytical and trustworthy expression',
  },
  'aesthetic-vlogger': {
    name: '감성 브이로거',
    prompt: 'A stylish Korean aesthetic vlogger, soft natural lighting, minimal warm-toned background, dreamy atmosphere, holding product elegantly with gentle expression',
  },
  'trusted-expert': {
    name: '신뢰 전문가',
    prompt: 'A mature Korean expert in their 40s, wearing professional attire, clean studio background, authoritative yet warm demeanor, gesturing while explaining product details',
  },
};

const SCENE_SECTIONS: ShoppingChannelScene['section'][] = ['hooking', 'detail', 'romance', 'wit', 'cta'];

const SECTION_LABELS: Record<ShoppingChannelScene['section'], string> = {
  hooking: '후킹 (시선 사로잡기)',
  detail: '디테일 (제품 상세)',
  romance: '로망 (감성 어필)',
  wit: '위트 (재치/공감)',
  cta: 'CTA (행동 유도)',
};

// ═══════════════════════════════════════════════════════════════
// 1. 제품 사진 분석
// ═══════════════════════════════════════════════════════════════

export const analyzeProductPhotos = async (
  imageBase64List: string[],
  productName?: string,
  productDescription?: string,
): Promise<ShoppingProductAnalysis> => {
  logger.info('[ShoppingChannel] 제품 사진 분석 시작', { imageCount: imageBase64List.length });

  const imageContent = imageBase64List.slice(0, 3).map(b64 => ({
    type: 'image_url' as const,
    image_url: { url: b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}` },
  }));

  const extraContext = [
    productName && `제품명: ${productName}`,
    productDescription && `설명: ${productDescription}`,
  ].filter(Boolean).join('\n');

  const messages: EvolinkChatMessage[] = [
    {
      role: 'system',
      content: `당신은 쇼핑 제품 사진 전문 분석가입니다.
제품 사진을 보고 상품 정보를 정확히 분석하세요.
${extraContext ? `\n사용자 제공 정보:\n${extraContext}` : ''}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "productName": "상품명 (한국어)",
  "category": "카테고리 (전자제품/패션/뷰티/식품/생활/기타)",
  "targetAudience": "최적 타겟 고객층",
  "keyFeatures": ["핵심 기능 1", "핵심 기능 2", "핵심 기능 3"],
  "appealPoints": ["매력 포인트 1", "매력 포인트 2", "매력 포인트 3"]
}`,
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: '이 제품 사진을 분석해주세요. 상품의 이름, 카테고리, 타겟 고객, 핵심 기능, 매력 포인트를 파악해주세요.' },
        ...imageContent,
      ],
    },
  ];

  const response = await evolinkChat(messages, { temperature: 0.3, maxTokens: 2048 });
  const text = response.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('제품 분석 결과를 파싱할 수 없습니다.');

  const analysis = JSON.parse(jsonMatch[0]) as ShoppingProductAnalysis;
  useCostStore.getState().addCost(0.02, 'analysis');
  logger.success('[ShoppingChannel] 제품 분석 완료', { productName: analysis.productName });
  return analysis;
};

// ═══════════════════════════════════════════════════════════════
// 2. 대본 생성 (기존 generateShoppingScripts 재사용)
// ═══════════════════════════════════════════════════════════════

export const generateChannelScripts = async (
  analysis: ShoppingProductAnalysis,
  ctaPreset: ShoppingCTAPreset,
): Promise<ShoppingScript[]> => {
  logger.info('[ShoppingChannel] 대본 생성 시작');
  // duration 45초 기준 (채널용 리뷰 영상)
  const scripts = await generateShoppingScripts(analysis, 45, ctaPreset);
  logger.success('[ShoppingChannel] 대본 생성 완료', { count: scripts.length });
  return scripts;
};

// ═══════════════════════════════════════════════════════════════
// 3. 장면별 비주얼 프롬프트 생성
// ═══════════════════════════════════════════════════════════════

export const generateScenePrompts = async (
  analysis: ShoppingProductAnalysis,
  script: ShoppingScript,
  characterConfig: ShoppingCharacterConfig,
  template: ShoppingSceneTemplate,
  ratio: AspectRatio,
): Promise<ShoppingChannelScene[]> => {
  logger.info('[ShoppingChannel] 장면 프롬프트 생성 시작');

  const preset = CHARACTER_PRESETS[characterConfig.presetId];
  const characterDesc = characterConfig.customDescription || preset.prompt;

  const templateGuide: Record<ShoppingSceneTemplate, string> = {
    'general-review': '일반 리뷰: 캐릭터가 제품을 직접 사용하며 소개하는 자연스러운 리뷰 구성',
    'unboxing': '언박싱: 택배 수령 → 개봉 → 첫인상 → 사용 → 만족의 흐름',
    'comparison': '비교 리뷰: 다른 제품과 비교하며 장점을 부각하는 구성',
  };

  const sectionTexts = {
    hooking: script.sections.hooking,
    detail: script.sections.detail,
    romance: script.sections.romance,
    wit: script.sections.wit,
    cta: script.fullText.slice(-50),
  };

  const messages: EvolinkChatMessage[] = [
    {
      role: 'system',
      content: `당신은 쇼핑 리뷰 영상의 비주얼 프롬프트 전문가입니다.
제품 정보, 대본, 캐릭터 설정을 바탕으로 5개 장면의 영상 생성용 프롬프트를 만들어주세요.

## 캐릭터 설명
${characterDesc}

## 제품 정보
- 제품명: ${analysis.productName}
- 카테고리: ${analysis.category}
- 핵심 기능: ${analysis.keyFeatures.join(', ')}

## 영상 구성
${templateGuide[template]}

## 화면 비율
${ratio === AR.PORTRAIT ? '9:16 (세로형, 숏폼/릴스 최적화)' : '16:9 (가로형, 유튜브 최적화)'}

## 규칙
- 각 프롬프트는 영어로 작성
- 캐릭터의 외형/의상/표정을 일관되게 유지
- 제품이 항상 화면에 보이도록 구성
- 조명, 배경, 카메라 앵글 구체적으로 명시
- [CRITICAL: Preserve exact art style] [Consistent visual identity] 태그 포함

반드시 아래 JSON 배열로만 응답하세요:
[
  { "section": "hooking", "visualPrompt": "영어 프롬프트" },
  { "section": "detail", "visualPrompt": "영어 프롬프트" },
  { "section": "romance", "visualPrompt": "영어 프롬프트" },
  { "section": "wit", "visualPrompt": "영어 프롬프트" },
  { "section": "cta", "visualPrompt": "영어 프롬프트" }
]`,
    },
    {
      role: 'user',
      content: `대본 내용:
- 후킹: ${sectionTexts.hooking}
- 디테일: ${sectionTexts.detail}
- 로망: ${sectionTexts.romance}
- 위트: ${sectionTexts.wit}
- CTA: ${sectionTexts.cta}

위 대본을 기반으로 5개 장면의 비주얼 프롬프트를 생성해주세요.`,
    },
  ];

  const response = await evolinkChat(messages, { temperature: 0.4, maxTokens: 3000 });
  const text = response.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('장면 프롬프트를 파싱할 수 없습니다.');

  const prompts = JSON.parse(jsonMatch[0]) as { section: string; visualPrompt: string }[];
  useCostStore.getState().addCost(0.05, 'analysis');

  const scenes: ShoppingChannelScene[] = SCENE_SECTIONS.map((section, i) => {
    const matched = prompts.find(p => p.section === section);
    return {
      id: `scene-${section}-${Date.now()}`,
      sceneIndex: i,
      section,
      scriptText: sectionTexts[section] || '',
      visualPrompt: matched?.visualPrompt || '',
      imageUrl: null,
      videoUrl: null,
      isGeneratingImage: false,
      isGeneratingVideo: false,
      imageError: null,
      videoError: null,
      progress: 0,
      videoEngine: null,
    };
  });

  logger.success('[ShoppingChannel] 장면 프롬프트 생성 완료', { count: scenes.length });
  return scenes;
};

// ═══════════════════════════════════════════════════════════════
// 4. 장면 이미지 생성
// ═══════════════════════════════════════════════════════════════

export const generateSceneImage = async (
  scene: ShoppingChannelScene,
  productImageUrls: string[],
  characterImageUrl: string | null,
  ratio: AspectRatio,
): Promise<string> => {
  logger.info('[ShoppingChannel] 이미지 생성', { section: scene.section });

  const refImages = [...productImageUrls];
  if (characterImageUrl) refImages.push(characterImageUrl);

  try {
    const url = await generateEvolinkImageWrapped(
      scene.visualPrompt,
      ratio,
      refImages.length > 0 ? refImages : undefined,
    );
    useCostStore.getState().addCost(0.08, 'image');
    return url;
  } catch (err) {
    logger.warn('[ShoppingChannel] Evolink 이미지 실패, Kie 폴백', { error: err });
    const url = await generateKieImage(
      scene.visualPrompt,
      ratio,
      refImages.length > 0 ? refImages : undefined,
    );
    useCostStore.getState().addCost(0.06, 'image');
    return url;
  }
};

// ═══════════════════════════════════════════════════════════════
// 5. 장면 영상 생성
// ═══════════════════════════════════════════════════════════════

export const generateSceneVideo = async (
  scene: ShoppingChannelScene,
  videoModel: 'veo' | 'grok',
  ratio: AspectRatio,
  signal?: AbortSignal,
  onProgress?: (percent: number) => void,
): Promise<string> => {
  logger.info('[ShoppingChannel] 영상 생성', { section: scene.section, model: videoModel });

  if (!scene.imageUrl) throw new Error('이미지가 없습니다. 먼저 이미지를 생성해주세요.');

  if (videoModel === 'veo') {
    const taskId = await createApimartVeoTask(scene.visualPrompt, scene.imageUrl, ratio);
    const videoUrl = await pollApimartVeoTask(taskId, signal, onProgress);
    useCostStore.getState().addCost(0.17, 'video');
    return videoUrl;
  } else {
    const taskId = await createPortableGrokTask(scene.visualPrompt, scene.imageUrl, ratio);
    const videoUrl = await pollKieTask(taskId, signal, onProgress);
    useCostStore.getState().addCost(0.15, 'video');
    return videoUrl;
  }
};

// ═══════════════════════════════════════════════════════════════
// 6. 파이프라인 오케스트레이터
// ═══════════════════════════════════════════════════════════════

export const runPipeline = async (
  scenes: ShoppingChannelScene[],
  productImageUrls: string[],
  characterImageUrl: string | null,
  videoModel: 'veo' | 'grok',
  ratio: AspectRatio,
  signal: AbortSignal | undefined,
  onSceneUpdate: (id: string, patch: Partial<ShoppingChannelScene>) => void,
  onPhase: (phase: string) => void,
): Promise<void> => {
  logger.info('[ShoppingChannel] 파이프라인 시작', { sceneCount: scenes.length });

  // Phase 1: 이미지 병렬 생성
  onPhase('generating-images');
  await Promise.all(
    scenes.map(async (scene) => {
      if (signal?.aborted) return;
      onSceneUpdate(scene.id, { isGeneratingImage: true, imageError: null });
      try {
        const imageUrl = await generateSceneImage(scene, productImageUrls, characterImageUrl, ratio);
        onSceneUpdate(scene.id, { imageUrl, isGeneratingImage: false });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '이미지 생성 실패';
        onSceneUpdate(scene.id, { isGeneratingImage: false, imageError: msg });
      }
    }),
  );

  if (signal?.aborted) return;

  // Phase 2: 영상 2개씩 병렬 생성
  onPhase('generating-videos');
  const scenesWithImages = scenes.filter(s => {
    const store = useShoppingChannelStoreRef();
    const updated = store.find(sc => sc.id === s.id);
    return updated?.imageUrl != null;
  });

  for (let i = 0; i < scenesWithImages.length; i += 2) {
    if (signal?.aborted) return;
    const batch = scenesWithImages.slice(i, i + 2);
    await Promise.all(
      batch.map(async (scene) => {
        const store = useShoppingChannelStoreRef();
        const current = store.find(sc => sc.id === scene.id);
        if (!current?.imageUrl) return;

        onSceneUpdate(scene.id, { isGeneratingVideo: true, videoError: null, videoEngine: videoModel });
        try {
          const videoUrl = await generateSceneVideo(
            { ...scene, imageUrl: current.imageUrl },
            videoModel,
            ratio,
            signal,
            (percent) => onSceneUpdate(scene.id, { progress: percent }),
          );
          onSceneUpdate(scene.id, { videoUrl, isGeneratingVideo: false, progress: 100 });
        } catch (err) {
          const msg = err instanceof Error ? err.message : '영상 생성 실패';
          onSceneUpdate(scene.id, { isGeneratingVideo: false, videoError: msg });
        }
      }),
    );
  }

  onPhase('done');
  logger.success('[ShoppingChannel] 파이프라인 완료');
};

// Helper: 스토어에서 최신 scenes 참조
function useShoppingChannelStoreRef(): ShoppingChannelScene[] {
  // Dynamic import를 피하기 위해 직접 zustand store에 접근
  try {
    const { useShoppingChannelStore } = require('../stores/shoppingChannelStore');
    return useShoppingChannelStore.getState().scenes;
  } catch (e) {
    logger.trackSwallowedError('shoppingChannelService:useShoppingChannelStoreRef', e);
    return [];
  }
}

// === EXPORTS FOR UI ===
export { CHARACTER_PRESETS, SECTION_LABELS, SCENE_SECTIONS };
