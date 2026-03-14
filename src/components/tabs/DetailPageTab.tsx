import React, { useState, useCallback, Suspense, lazy } from 'react';
import { evolinkChat, evolinkGenerateImage } from '../../services/evolinkService';
import { uploadMediaToHosting } from '../../services/uploadService';
import { showToast } from '../../stores/uiStore';
import { logger } from '../../services/LoggerService';
import { useElapsedTimer, formatElapsed } from '../../hooks/useElapsedTimer';
import { useAuthGuard } from '../../hooks/useAuthGuard';
import type { DetailImageSegment, PageLength } from '../../types';
import type { EvolinkChatMessage } from '../../services/evolinkService';

const ShoppingShortContent = lazy(() => import('./ShoppingShortTab'));
const ShoppingChannelContent = lazy(() => import('./ShoppingChannelTab'));

// --- Sub-tab type ---
type SubTab = 'detail' | 'thumbnail' | 'shopping-short' | 'shopping-channel';
type Step = 1 | 2 | 3;

// --- Constants ---

const CATEGORIES = [
  { id: 'fashion', label: '패션/의류' },
  { id: 'food', label: '식품/건강' },
  { id: 'beauty', label: '뷰티/화장품' },
  { id: 'electronics', label: '전자/가전' },
  { id: 'home', label: '생활/홈' },
  { id: 'kids', label: '유아/키즈' },
  { id: 'sports', label: '스포츠/레저' },
  { id: 'pet', label: '반려동물' },
  { id: 'other', label: '기타' },
];

const PAGE_LENGTHS: { id: PageLength; label: string; desc: string }[] = [
  { id: 'auto', label: 'Auto', desc: 'AI가 상품 특성에 맞춰 판단' },
  { id: 5, label: '5장', desc: '저관여/저가 (핵심 집중)' },
  { id: 7, label: '7장', desc: '일반 구성 (리뷰/디테일)' },
  { id: 9, label: '9장', desc: '고관여 (브랜드/비교)' },
  { id: 'custom', label: '직접 입력', desc: '원하는 장수 지정' },
];

const GENDERS = ['남성', '여성', '전체'];
const AGE_RANGES = ['10대', '20대', '30대', '40대', '50대', '60대+'];

const DETAIL_STEPS: { id: Step; label: string }[] = [
  { id: 1, label: '정보 입력' },
  { id: 2, label: '전략 기획' },
  { id: 3, label: '이미지 생성' },
];

// Thumbnail styles
const THUMB_STYLES = [
  { id: 'clean', label: '깔끔한', desc: '화이트/미니멀 배경' },
  { id: 'lifestyle', label: '라이프스타일', desc: '실생활 사용 장면' },
  { id: 'creative', label: '창의적', desc: '독특한 각도/연출' },
];

const THUMB_ELEMENTS = [
  { id: 'none', label: '제품만' },
  { id: 'hand', label: '손 모델 포함' },
  { id: 'person', label: '인물 모델 포함' },
];

const THUMB_TEXT_POSITIONS = [
  { id: 'none', label: '텍스트 없음' },
  { id: 'top', label: '상단' },
  { id: 'center', label: '중앙' },
  { id: 'bottom', label: '하단' },
];

// --- Helper ---

function extractJsonArray(text: string): DetailImageSegment[] | null {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return null;
    return arr.map((item: Record<string, unknown>, idx: number) => ({
      id: `seg_${Date.now()}_${idx}`,
      title: String(item.title || `Section ${idx + 1}`),
      logicalSections: Array.isArray(item.logicalSections) ? item.logicalSections.map(String) : [],
      keyMessage: String(item.keyMessage || ''),
      visualPrompt: String(item.visualPrompt || ''),
    }));
  } catch (e) {
    logger.trackSwallowedError('DetailPageTab:parseSegments', e);
    return null;
  }
}

// --- Empty state placeholder for steps ---
const EmptyStepPreview: React.FC<{ step: Step }> = ({ step }) => {
  if (step === 2) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-gray-800/40 border border-gray-700/50 border-dashed rounded-xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700/50 text-gray-500 text-sm font-bold border border-gray-600/30 shrink-0">{i}</span>
              <div className="flex-1">
                <div className="h-4 w-40 bg-gray-700/40 rounded mb-2" />
                <div className="flex gap-1">
                  <span className="px-2 py-0.5 bg-gray-700/30 text-gray-600 rounded text-xs border border-gray-600/20">Hook</span>
                  <span className="px-2 py-0.5 bg-gray-700/30 text-gray-600 rounded text-xs border border-gray-600/20">Solution</span>
                </div>
              </div>
            </div>
            <div className="h-10 bg-gray-700/20 rounded-lg mb-2" />
            <div className="h-3 w-32 bg-gray-700/20 rounded" />
          </div>
        ))}
        <p className="text-center text-sm text-gray-600 mt-4">Step 1에서 상품 정보를 입력하면 AI가 판매 전략 기획안을 생성합니다</p>
      </div>
    );
  }
  // step === 3
  return (
    <div className="max-w-md mx-auto space-y-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="w-full aspect-[9/16] bg-gray-800/30 border border-gray-700/50 border-dashed rounded-lg flex flex-col items-center justify-center gap-2">
          <div className="w-12 h-12 rounded-lg bg-gray-700/30 flex items-center justify-center">
            <span className="text-2xl text-gray-600">{i}</span>
          </div>
          <div className="h-3 w-24 bg-gray-700/30 rounded" />
          <div className="h-2 w-16 bg-gray-700/20 rounded" />
        </div>
      ))}
      <p className="text-center text-sm text-gray-600 mt-4">기획안이 확정되면 9:16 세로 이미지를 순차적으로 생성합니다</p>
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

const DetailPageTab: React.FC = () => {
  const { requireAuth } = useAuthGuard();
  const [subTab, setSubTab] = useState<SubTab>('detail');
  const [step, setStep] = useState<Step>(1);

  // --- Shared state ---
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('fashion');
  const [price, setPrice] = useState('');
  const [promo, setPromo] = useState('');
  const [features, setFeatures] = useState<string[]>(['']);
  const [gender, setGender] = useState('전체');
  const [ageRanges, setAgeRanges] = useState<string[]>(['20대', '30대']);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  // --- Detail page state ---
  const [pageLength, setPageLength] = useState<PageLength>('auto');
  const [customCount, setCustomCount] = useState(6);
  const [segments, setSegments] = useState<DetailImageSegment[]>([]);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isSuggestingFeatures, setIsSuggestingFeatures] = useState(false);

  // --- Thumbnail state ---
  const [thumbStyle, setThumbStyle] = useState('clean');
  const [thumbElement, setThumbElement] = useState('none');
  const [thumbTextPosition, setThumbTextPosition] = useState('bottom');
  const [thumbTextOverlay, setThumbTextOverlay] = useState('');
  const [thumbResults, setThumbResults] = useState<string[]>([]);
  const [isGeneratingThumb, setIsGeneratingThumb] = useState(false);
  const [thumbCount, setThumbCount] = useState(4);

  const elapsed = useElapsedTimer(isPlanning || isGeneratingAll || isGeneratingThumb);

  // ============================================================
  // Shared handlers
  // ============================================================

  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (newFiles.length === 0) return;
    const newPreviews = newFiles.map(f => URL.createObjectURL(f));
    setPreviewUrls(prev => [...prev, ...newPreviews]);
    setReferenceFiles(prev => [...prev, ...newFiles]);
    setIsUploadingImages(true);
    try {
      const urls = await Promise.all(newFiles.map(f => uploadMediaToHosting(f)));
      setReferenceUrls(prev => [...prev, ...urls]);
    } catch (e) {
      logger.trackSwallowedError('DetailPageTab:uploadReferenceImages', e);
      showToast('이미지 업로드 실패. 다시 시도해주세요.');
    } finally {
      setIsUploadingImages(false);
    }
  }, []);

  const removeImage = useCallback((idx: number) => {
    setPreviewUrls(prev => prev.filter((_, i) => i !== idx));
    setReferenceFiles(prev => prev.filter((_, i) => i !== idx));
    setReferenceUrls(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // ============================================================
  // Detail page handlers
  // ============================================================

  const handleSuggestFeatures = useCallback(async () => {
    if (!requireAuth('AI 기능 추천')) return;
    if (!productName.trim()) { showToast('상품명을 먼저 입력해주세요.'); return; }
    setIsSuggestingFeatures(true);
    try {
      const categoryLabel = CATEGORIES.find(c => c.id === category)?.label || category;
      const messages: EvolinkChatMessage[] = [
        { role: 'system', content: '당신은 이커머스 상품 분석 전문가입니다. 간결하게 답변하세요.' },
        { role: 'user', content: `다음 상품의 소비자가 중요하게 생각하는 핵심 특징(USP) 5가지를 한 줄씩 추천해주세요.\n카테고리: ${categoryLabel}\n상품명: ${productName}\n\n형식: 각 줄에 하나씩, 번호 없이, 설명만.` }
      ];
      const response = await evolinkChat(messages, { temperature: 0.8, maxTokens: 500 });
      const text = response.choices[0]?.message?.content || '';
      const lines = text.split('\n').map(l => l.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 5);
      if (lines.length > 0) setFeatures(lines);
    } catch (e) {
      showToast(`특징 추천 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSuggestingFeatures(false);
    }
  }, [requireAuth, productName, category]);

  const handlePlan = useCallback(async () => {
    if (!requireAuth('AI 레이아웃 계획')) return;
    if (!productName.trim()) { showToast('상품명을 입력해주세요.'); return; }
    setIsPlanning(true);
    try {
      const categoryLabel = CATEGORIES.find(c => c.id === category)?.label || category;
      const effectiveLength = pageLength === 'custom' ? customCount : pageLength;
      const validFeatures = features.filter(f => f.trim());
      const lengthInstruction = effectiveLength === 'auto'
        ? '상품 특성에 맞게 적절한 장수(5~9)를 AI가 판단하여 결정하세요.'
        : `정확히 ${effectiveLength}개의 섹션으로 구성하세요.`;

      const systemPrompt = `당신은 한국 스마트스토어/쿠팡 상세페이지 전문 전략가입니다.
입력된 상품 정보를 바탕으로 "팔리는 논리"가 적용된 상세페이지 기획안을 JSON 배열로 출력하세요.

판매 논리 구조 (Seller Winning Logic):
- Hook(후킹): 고객의 시선을 사로잡는 강렬한 첫인상
- Solution(해결): 이 상품이 어떤 문제를 해결하는지
- Clarity(스펙/비교): 크기, 소재, 성분 등 명확한 정보
- Social Proof(입증): 리뷰, 판매량, 수상 등 사회적 증거
- Detail(디테일): 세부 사항, 사용법, 활용 팁
- Service(서비스): 배송, AS, 교환/환불 정책
- Risk Reversal(신뢰): 브랜드 신뢰도, 보증, 인증
- Brand Story(브랜드): 브랜드 철학과 스토리
- Comparison(차별화): 경쟁 제품 대비 우위

5장 기본: Hook -> Solution -> Clarity -> Service -> Risk Reversal
7장 추가: + Social Proof, Detail Deep Dive
9장 추가: + Brand Story, Comparison

중요 제약사항:
1. keyMessage는 반드시 자연스러운 한국어로만 작성하라. 영어 헤드라인(Premium, Best 등)을 절대 사용하지 마라.
2. visualPrompt는 영어로 작성하며, 9:16 세로 비율의 이커머스 상세페이지 이미지에 적합한 상세한 시각 묘사를 포함하라.
3. visualPrompt에 "Render the following Korean text prominently and aesthetically: [keyMessage 내용]"을 반드시 포함하라.
4. 각 섹션이 어떤 판매 논리 전략을 사용하는지 logicalSections에 태그로 명시하라.

출력 형식 (JSON 배열만 출력, 다른 텍스트 없이):
[{"title":"이미지 1 (후킹)","logicalSections":["Hook"],"keyMessage":"한글 카피","visualPrompt":"A high-quality 9:16 vertical e-commerce banner..."}]`;

      const userPrompt = `상품명: ${productName}\n카테고리: ${categoryLabel}\n${price ? `가격: ${price}\n` : ''}${promo ? `프로모션: ${promo}\n` : ''}핵심 특징: ${validFeatures.length > 0 ? validFeatures.join(', ') : '(없음)'}\n타겟 성별: ${gender}\n타겟 연령: ${ageRanges.join(', ')}\n${lengthInstruction}`;

      const response = await evolinkChat(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { temperature: 0.7, maxTokens: 8192 }
      );
      const parsed = extractJsonArray(response.choices[0]?.message?.content || '');
      if (!parsed || parsed.length === 0) throw new Error('AI 응답에서 기획안을 파싱할 수 없습니다.');
      setSegments(parsed);
      setStep(2);
    } catch (e) {
      showToast(`기획 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsPlanning(false);
    }
  }, [requireAuth, productName, category, price, promo, features, gender, ageRanges, pageLength, customCount]);

  const handleGenerateAll = useCallback(async () => {
    if (!requireAuth('상세페이지 생성')) return;
    if (segments.length === 0) return;
    setIsGeneratingAll(true);
    setGenerationProgress(0);
    const imageUrls = referenceUrls.length > 0 ? referenceUrls : undefined;
    let completed = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      setSegments(prev => prev.map((s, idx) => idx === i ? { ...s, isGenerating: true, generationStatus: '생성 중...' } : s));
      try {
        const fullPrompt = `High-quality vertical 9:16 e-commerce product detail page image. ${seg.visualPrompt}. The product is "${productName}". Render Korean text "${seg.keyMessage}" prominently with clean, modern typography. Professional commercial photography style with clean background.`;
        const resultUrl = await evolinkGenerateImage(fullPrompt, '9:16', '2K', imageUrls);
        completed++;
        setGenerationProgress(Math.round((completed / segments.length) * 100));
        setSegments(prev => prev.map((s, idx) => idx === i ? { ...s, imageUrl: resultUrl, isGenerating: false, generationStatus: undefined } : s));
      } catch (e) {
        completed++;
        setGenerationProgress(Math.round((completed / segments.length) * 100));
        const msg = e instanceof Error ? e.message : String(e);
        setSegments(prev => prev.map((s, idx) => idx === i ? { ...s, isGenerating: false, generationStatus: `실패: ${msg.substring(0, 60)}` } : s));
      }
    }
    setIsGeneratingAll(false);
    showToast('이미지 생성 완료!');
  }, [requireAuth, segments, referenceUrls, productName]);

  const handleRegenerateOne = useCallback(async (segIdx: number) => {
    const seg = segments[segIdx];
    if (!seg) return;
    setSegments(prev => prev.map((s, idx) => idx === segIdx ? { ...s, isGenerating: true, generationStatus: '재생성 중...' } : s));
    try {
      const imageUrls = referenceUrls.length > 0 ? referenceUrls : undefined;
      const fullPrompt = `High-quality vertical 9:16 e-commerce product detail page image. ${seg.visualPrompt}. The product is "${productName}". Render Korean text "${seg.keyMessage}" prominently with clean, modern typography. Professional commercial photography style.`;
      const resultUrl = await evolinkGenerateImage(fullPrompt, '9:16', '2K', imageUrls);
      setSegments(prev => prev.map((s, idx) => idx === segIdx ? { ...s, imageUrl: resultUrl, isGenerating: false, generationStatus: undefined } : s));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSegments(prev => prev.map((s, idx) => idx === segIdx ? { ...s, isGenerating: false, generationStatus: `실패: ${msg.substring(0, 60)}` } : s));
    }
  }, [segments, referenceUrls, productName]);

  // ============================================================
  // Thumbnail handlers
  // ============================================================

  const handleGenerateThumbnails = useCallback(async () => {
    if (!requireAuth('썸네일 생성')) return;
    if (!productName.trim()) { showToast('상품명을 입력해주세요.'); return; }
    setIsGeneratingThumb(true);
    setThumbResults([]);
    const imageUrls = referenceUrls.length > 0 ? referenceUrls : undefined;

    const styleLabel = THUMB_STYLES.find(s => s.id === thumbStyle)?.label || thumbStyle;
    const elementLabel = THUMB_ELEMENTS.find(e => e.id === thumbElement)?.label || '';
    const textPart = thumbTextPosition !== 'none' && thumbTextOverlay.trim()
      ? `Render Korean text "${thumbTextOverlay}" at the ${thumbTextPosition} of the image with bold, legible typography.`
      : 'No text overlay needed.';

    const results: string[] = [];
    for (let i = 0; i < thumbCount; i++) {
      try {
        const prompt = `A high-quality 1:1 square e-commerce product thumbnail image. Style: ${styleLabel}, modern and appealing. Product: "${productName}". ${elementLabel !== '제품만' ? `Include ${elementLabel} interacting with the product.` : 'Focus only on the product.'} ${textPart} Variation ${i + 1} of ${thumbCount}. Professional commercial photography, bright lighting, clean composition.`;
        const url = await evolinkGenerateImage(prompt, '1:1', '2K', imageUrls);
        results.push(url);
        setThumbResults([...results]);
      } catch (e) {
        logger.trackSwallowedError('DetailPageTab:generateThumbnail', e);
        results.push('');
        setThumbResults([...results]);
      }
    }
    setIsGeneratingThumb(false);
    showToast('썸네일 생성 완료!');
  }, [requireAuth, productName, thumbStyle, thumbElement, thumbTextPosition, thumbTextOverlay, thumbCount, referenceUrls]);

  // ============================================================
  // Common helpers
  // ============================================================

  const handleDownloadOne = useCallback(async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
  }, []);

  const handleDownloadAll = useCallback(() => {
    segments.forEach((seg, idx) => {
      if (seg.imageUrl) {
        setTimeout(() => handleDownloadOne(seg.imageUrl!, `detail_${idx + 1}_${productName || 'page'}.png`), idx * 300);
      }
    });
  }, [segments, productName, handleDownloadOne]);

  const updateFeature = (idx: number, value: string) => setFeatures(prev => prev.map((f, i) => i === idx ? value : f));
  const addFeature = () => setFeatures(prev => [...prev, '']);
  const removeFeature = (idx: number) => setFeatures(prev => prev.filter((_, i) => i !== idx));
  const toggleAge = (age: string) => setAgeRanges(prev => prev.includes(age) ? prev.filter(a => a !== age) : [...prev, age]);

  const canProceedStep1 = productName.trim().length > 0;
  const allImagesGenerated = segments.length > 0 && segments.every(s => s.imageUrl);

  // ============================================================
  // Render: Image Upload (shared)
  // ============================================================

  const renderImageUpload = () => (
    <div>
      <label className="block text-sm font-bold text-gray-300 mb-1.5">
        제품 레퍼런스 이미지
        {isUploadingImages && <span className="ml-2 text-teal-400 text-xs font-normal">(업로드 중...)</span>}
      </label>
      <div className="flex flex-wrap gap-3 mb-2">
        {previewUrls.map((url, idx) => (
          <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-700 group">
            <img src={url} alt={`ref-${idx}`} className="w-full h-full object-cover" />
            <button onClick={() => removeImage(idx)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">x</button>
          </div>
        ))}
        <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center cursor-pointer hover:border-teal-500/50 transition-colors">
          <span className="text-2xl text-gray-500">+</span>
          <input type="file" accept="image/*" multiple onChange={e => handleImageUpload(e.target.files)} className="hidden" />
        </label>
      </div>
      <p className="text-xs text-gray-500">제품 사진 업로드 시 Img2Img로 제품 외형이 반영됩니다</p>
    </div>
  );

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="animate-fade-in max-w-6xl mx-auto pt-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white text-lg font-bold shadow-lg">🛒</div>
          <div>
            <h1 className="text-2xl font-bold text-white">쇼핑콘텐츠</h1>
            <p className="text-sm text-gray-400">상세페이지 · 썸네일 · 숏폼 · 쇼핑 채널</p>
          </div>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-gray-700 pb-0">
        <button
          onClick={() => setSubTab('detail')}
          className={`px-5 py-2.5 text-sm font-bold rounded-t-lg transition-all ${
            subTab === 'detail'
              ? 'bg-gray-800 text-teal-400 border-b-2 border-teal-500'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          상세페이지 제작
        </button>
        <button
          onClick={() => setSubTab('thumbnail')}
          className={`px-5 py-2.5 text-sm font-bold rounded-t-lg transition-all ${
            subTab === 'thumbnail'
              ? 'bg-gray-800 text-teal-400 border-b-2 border-teal-500'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          썸네일 제작
        </button>
        <button
          onClick={() => setSubTab('shopping-short')}
          className={`px-5 py-2.5 text-sm font-bold rounded-t-lg transition-all ${
            subTab === 'shopping-short'
              ? 'bg-gray-800 text-lime-400 border-b-2 border-lime-500'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          쇼핑 숏폼 자동화
        </button>
        <button
          onClick={() => setSubTab('shopping-channel')}
          className={`px-5 py-2.5 text-sm font-bold rounded-t-lg transition-all ${
            subTab === 'shopping-channel'
              ? 'bg-gray-800 text-cyan-400 border-b-2 border-cyan-500'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          쇼핑 채널 AI
        </button>
      </div>

      {/* ============================================================ */}
      {/* Sub-tab: Detail Page */}
      {/* ============================================================ */}
      {subTab === 'detail' && (
        <div>
          {/* Step Indicator — always clickable */}
          <div className="flex items-center gap-2 mb-6">
            {DETAIL_STEPS.map((s, idx) => {
              const isCurrent = s.id === step;
              const isCompleted = s.id < step;
              return (
                <React.Fragment key={s.id}>
                  {idx > 0 && <div className={`flex-1 h-px max-w-[60px] ${isCompleted ? 'bg-teal-500/60' : 'bg-gray-700'}`} />}
                  <button
                    onClick={() => setStep(s.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      isCurrent ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30'
                        : isCompleted ? 'text-teal-400/70 hover:text-teal-300'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'
                    }`}
                  >
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                      isCurrent ? 'bg-teal-500 text-white' : isCompleted ? 'bg-teal-500/50 text-white' : 'bg-gray-700 text-gray-500'
                    }`}>{isCompleted ? '✓' : s.id}</span>
                    {s.label}
                  </button>
                </React.Fragment>
              );
            })}
            {(isPlanning || isGeneratingAll) && (
              <span className="ml-auto text-xs text-gray-500 font-mono">{formatElapsed(elapsed)}</span>
            )}
          </div>

          {/* ---- Step 1: Info Input ---- */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-300 mb-1.5">상품명 *</label>
                  <input type="text" value={productName} onChange={e => setProductName(e.target.value)} placeholder="예: 프리미엄 히알루론산 세럼 30ml" className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-300 mb-1.5">카테고리</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-teal-500 focus:outline-none transition-colors">
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-300 mb-1.5">가격 (선택)</label>
                  <input type="text" value={price} onChange={e => setPrice(e.target.value)} placeholder="예: 29,900원" className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-300 mb-1.5">프로모션 (선택)</label>
                  <input type="text" value={promo} onChange={e => setPromo(e.target.value)} placeholder="예: 오늘만 1+1, 무료배송" className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none transition-colors" />
                </div>
              </div>

              {/* Features */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-bold text-gray-300">핵심 특징 (USP)</label>
                  <button onClick={handleSuggestFeatures} disabled={isSuggestingFeatures} className="text-xs px-3 py-1 bg-teal-600/20 text-teal-400 border border-teal-500/30 rounded-lg hover:bg-teal-600/30 transition-colors disabled:opacity-50">
                    {isSuggestingFeatures ? '추천 중...' : 'AI 자동 추천'}
                  </button>
                </div>
                <div className="space-y-2">
                  {features.map((f, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input type="text" value={f} onChange={e => updateFeature(idx, e.target.value)} placeholder={`특징 ${idx + 1}`} className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none transition-colors text-sm" />
                      {features.length > 1 && <button onClick={() => removeFeature(idx)} className="px-2 text-gray-500 hover:text-red-400 transition-colors text-lg">x</button>}
                    </div>
                  ))}
                  {features.length < 8 && <button onClick={addFeature} className="text-xs text-gray-500 hover:text-teal-400 transition-colors">+ 특징 추가</button>}
                </div>
              </div>

              {/* Target */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-300 mb-1.5">타겟 성별</label>
                  <div className="flex gap-2">
                    {GENDERS.map(g => (
                      <button key={g} onClick={() => setGender(g)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${gender === g ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'}`}>{g}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-300 mb-1.5">타겟 연령 (다중 선택)</label>
                  <div className="flex flex-wrap gap-2">
                    {AGE_RANGES.map(age => (
                      <button key={age} onClick={() => toggleAge(age)} className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${ageRanges.includes(age) ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'}`}>{age}</button>
                    ))}
                  </div>
                </div>
              </div>

              {renderImageUpload()}

              {/* Page Length */}
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2">상세페이지 길이</label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {PAGE_LENGTHS.map(pl => (
                    <button key={String(pl.id)} onClick={() => setPageLength(pl.id)} className={`px-3 py-3 rounded-lg text-sm font-bold transition-all text-left ${pageLength === pl.id ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'}`}>
                      <div className="font-bold">{pl.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{pl.desc}</div>
                    </button>
                  ))}
                </div>
                {pageLength === 'custom' && (
                  <div className="mt-3 flex items-center gap-3">
                    <input type="number" min={3} max={15} value={customCount} onChange={e => setCustomCount(Math.max(3, Math.min(15, parseInt(e.target.value) || 3)))} className="w-20 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-center focus:border-teal-500 focus:outline-none" />
                    <span className="text-sm text-gray-400">장 (3~15)</span>
                  </div>
                )}
              </div>

              <div className="pt-4">
                <button onClick={handlePlan} disabled={!canProceedStep1 || isPlanning} className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${canProceedStep1 && !isPlanning ? 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white shadow-lg shadow-teal-900/30' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                  {isPlanning ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-teal-400 rounded-full animate-spin" />
                      AI 전략 기획 중... ({formatElapsed(elapsed)})
                    </span>
                  ) : 'AI 전략 기획 시작'}
                </button>
              </div>
            </div>
          )}

          {/* ---- Step 2: Planning Result (or empty preview) ---- */}
          {step === 2 && (
            segments.length === 0 ? (
              <EmptyStepPreview step={2} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-white">기획안 ({segments.length}개 섹션)</h2>
                  <div className="flex gap-2">
                    <button onClick={() => setStep(1)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-bold transition-colors">이전 단계</button>
                    <button onClick={handlePlan} disabled={isPlanning} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-bold transition-colors disabled:opacity-50">{isPlanning ? '재기획 중...' : '다시 기획'}</button>
                  </div>
                </div>
                <div className="space-y-3">
                  {segments.map((seg, idx) => (
                    <div key={seg.id} className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-teal-600/20 text-teal-400 text-sm font-bold border border-teal-500/30 shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white text-sm mb-1">{seg.title}</div>
                          <div className="flex flex-wrap gap-1">
                            {seg.logicalSections.map(tag => (
                              <span key={tag} className="px-2 py-0.5 bg-teal-600/10 text-teal-400 rounded text-xs border border-teal-500/20">{tag}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="text-xs text-gray-500 font-bold mb-1 block">Key Message (한글 카피)</label>
                        <textarea value={seg.keyMessage} onChange={e => setSegments(prev => prev.map((s, i) => i === idx ? { ...s, keyMessage: e.target.value } : s))} rows={2} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-teal-500 focus:outline-none resize-none" />
                      </div>
                      <details>
                        <summary className="text-xs text-gray-500 font-bold cursor-pointer hover:text-gray-400 transition-colors">Visual Prompt (클릭하여 편집)</summary>
                        <textarea value={seg.visualPrompt} onChange={e => setSegments(prev => prev.map((s, i) => i === idx ? { ...s, visualPrompt: e.target.value } : s))} rows={3} className="w-full mt-2 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-300 text-xs focus:border-teal-500 focus:outline-none resize-none font-mono" />
                      </details>
                    </div>
                  ))}
                </div>
                <div className="pt-4">
                  <button onClick={() => { setStep(3); handleGenerateAll(); }} disabled={isGeneratingAll} className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${!isGeneratingAll ? 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white shadow-lg shadow-teal-900/30' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                    이미지 일괄 생성 ({segments.length}장)
                  </button>
                </div>
              </div>
            )
          )}

          {/* ---- Step 3: Generation + Preview (or empty preview) ---- */}
          {step === 3 && (
            segments.length === 0 ? (
              <EmptyStepPreview step={3} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-white">
                    상세페이지 미리보기
                    {isGeneratingAll && <span className="ml-3 text-sm text-teal-400 font-normal">생성 중 {generationProgress}% ({formatElapsed(elapsed)})</span>}
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={() => setStep(2)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-bold transition-colors">기획안 수정</button>
                    {allImagesGenerated && <button onClick={handleDownloadAll} className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-bold transition-colors">전체 다운로드</button>}
                  </div>
                </div>
                {isGeneratingAll && (
                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500" style={{ width: `${generationProgress}%` }} />
                  </div>
                )}
                <div className="max-w-md mx-auto space-y-3">
                  {segments.map((seg, idx) => (
                    <div key={seg.id} className="relative group bg-gray-800/40 border border-gray-700 rounded-xl overflow-hidden">
                      {seg.imageUrl ? (
                        <div className="relative">
                          <img src={seg.imageUrl} alt={seg.title} className="w-full rounded-t-xl border-b border-gray-700" loading="lazy" />
                          <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleRegenerateOne(idx)} disabled={seg.isGenerating} className="px-2 py-1 bg-black/70 text-white rounded text-xs hover:bg-black/90 transition-colors disabled:opacity-50">{seg.isGenerating ? '...' : '재생성'}</button>
                            <button onClick={() => handleDownloadOne(seg.imageUrl!, `detail_${idx + 1}.png`)} className="px-2 py-1 bg-black/70 text-white rounded text-xs hover:bg-black/90 transition-colors">다운로드</button>
                          </div>
                          <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white rounded text-xs font-bold">{idx + 1}/{segments.length}</div>
                        </div>
                      ) : (
                        <div className="w-full aspect-[9/16] bg-gray-800/60 rounded-t-xl flex flex-col items-center justify-center gap-3">
                          {seg.isGenerating ? (
                            <>
                              <div className="w-8 h-8 border-2 border-gray-600 border-t-teal-400 rounded-full animate-spin" />
                              <span className="text-sm text-gray-400">{seg.generationStatus || '생성 중...'}</span>
                            </>
                          ) : seg.generationStatus ? (
                            <>
                              <span className="text-sm text-red-400">{seg.generationStatus}</span>
                              <button onClick={() => handleRegenerateOne(idx)} className="px-3 py-1.5 bg-teal-600/20 text-teal-400 border border-teal-500/30 rounded-lg text-xs hover:bg-teal-600/30 transition-colors">재시도</button>
                            </>
                          ) : (
                            <span className="text-sm text-gray-500">대기 중 ({idx + 1}/{segments.length})</span>
                          )}
                          <div className="text-center px-4">
                            <div className="text-xs text-gray-600 font-bold">{seg.title}</div>
                            <div className="text-xs text-gray-500 mt-1 line-clamp-2">{seg.keyMessage}</div>
                          </div>
                        </div>
                      )}
                      {/* 개별 프롬프트 편집 영역 */}
                      <details className="border-t border-gray-700">
                        <summary className="px-3 py-2 text-xs text-gray-400 font-bold cursor-pointer hover:text-teal-400 hover:bg-gray-800/60 transition-colors select-none flex items-center gap-1.5">
                          <svg className="w-3 h-3 transition-transform details-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          프롬프트 편집 — {seg.title}
                        </summary>
                        <div className="p-3 space-y-2 bg-gray-900/40">
                          <div>
                            <label className="text-xs text-gray-500 font-bold mb-1 block">Key Message (한글 카피)</label>
                            <textarea value={seg.keyMessage} onChange={e => setSegments(prev => prev.map((s, i) => i === idx ? { ...s, keyMessage: e.target.value } : s))} rows={2} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-teal-500 focus:outline-none resize-none" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 font-bold mb-1 block">Visual Prompt (이미지 설명)</label>
                            <textarea value={seg.visualPrompt} onChange={e => setSegments(prev => prev.map((s, i) => i === idx ? { ...s, visualPrompt: e.target.value } : s))} rows={3} className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-300 text-xs focus:border-teal-500 focus:outline-none resize-none font-mono" />
                          </div>
                          <button onClick={() => handleRegenerateOne(idx)} disabled={seg.isGenerating} className={`w-full py-2 rounded-lg text-sm font-bold transition-all ${seg.isGenerating ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-teal-600/20 text-teal-400 border border-teal-500/30 hover:bg-teal-600/30'}`}>
                            {seg.isGenerating ? '재생성 중...' : '이 페이지만 재생성'}
                          </button>
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
                {!isGeneratingAll && segments.some(s => !s.imageUrl) && (
                  <div className="pt-2 text-center">
                    <button onClick={handleGenerateAll} className="px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-teal-900/30">미완성 이미지 생성</button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* Sub-tab: Thumbnail */}
      {/* ============================================================ */}
      {subTab === 'thumbnail' && (
        <div className="space-y-6">
          {/* Product info (compact) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-1.5">상품명 *</label>
              <input type="text" value={productName} onChange={e => setProductName(e.target.value)} placeholder="예: 프리미엄 히알루론산 세럼 30ml" className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-1.5">카테고리</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-teal-500 focus:outline-none transition-colors">
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {renderImageUpload()}

          {/* Style */}
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">썸네일 스타일</label>
            <div className="grid grid-cols-3 gap-2">
              {THUMB_STYLES.map(s => (
                <button key={s.id} onClick={() => setThumbStyle(s.id)} className={`px-3 py-3 rounded-lg text-sm font-bold transition-all text-left ${thumbStyle === s.id ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'}`}>
                  <div className="font-bold">{s.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Element */}
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">요소</label>
            <div className="flex gap-2">
              {THUMB_ELEMENTS.map(el => (
                <button key={el.id} onClick={() => setThumbElement(el.id)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${thumbElement === el.id ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'}`}>{el.label}</button>
              ))}
            </div>
          </div>

          {/* Text overlay */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-1.5">텍스트 오버레이</label>
              <input type="text" value={thumbTextOverlay} onChange={e => setThumbTextOverlay(e.target.value)} placeholder="예: 역대급 세일" className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-1.5">텍스트 위치</label>
              <div className="flex gap-2">
                {THUMB_TEXT_POSITIONS.map(p => (
                  <button key={p.id} onClick={() => setThumbTextPosition(p.id)} className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${thumbTextPosition === p.id ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'}`}>{p.label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Count */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-bold text-gray-300">생성 개수</label>
            <div className="flex gap-1">
              {[1, 2, 4].map(n => (
                <button key={n} onClick={() => setThumbCount(n)} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${thumbCount === n ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'}`}>{n}장</button>
              ))}
            </div>
          </div>

          {/* Generate */}
          <button onClick={handleGenerateThumbnails} disabled={!productName.trim() || isGeneratingThumb} className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${productName.trim() && !isGeneratingThumb ? 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white shadow-lg shadow-teal-900/30' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
            {isGeneratingThumb ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-teal-400 rounded-full animate-spin" />
                썸네일 생성 중... ({formatElapsed(elapsed)})
              </span>
            ) : `썸네일 ${thumbCount}장 생성`}
          </button>

          {/* Results */}
          {thumbResults.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-white mb-3">생성 결과</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {thumbResults.map((url, idx) => (
                  <div key={idx} className="relative group">
                    {url ? (
                      <div className="relative">
                        <img src={url} alt={`thumb-${idx + 1}`} className="w-full aspect-square rounded-lg border border-gray-700 object-cover" loading="lazy" />
                        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleDownloadOne(url, `thumbnail_${idx + 1}_${productName || 'thumb'}.png`)} className="px-2 py-1 bg-black/70 text-white rounded text-xs hover:bg-black/90 transition-colors">다운로드</button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full aspect-square bg-gray-800/60 border border-gray-700 rounded-lg flex items-center justify-center">
                        <span className="text-sm text-red-400">실패</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* Sub-tab: 쇼핑 숏폼 자동화 */}
      {/* ============================================================ */}
      {subTab === 'shopping-short' && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-lime-500" />
            <span className="ml-3 text-gray-400 text-sm">로딩 중...</span>
          </div>
        }>
          <ShoppingShortContent hideHeader />
        </Suspense>
      )}

      {subTab === 'shopping-channel' && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-cyan-500" />
            <span className="ml-3 text-gray-400 text-sm">로딩 중...</span>
          </div>
        }>
          <ShoppingChannelContent hideHeader />
        </Suspense>
      )}
    </div>
  );
};

export default DetailPageTab;
