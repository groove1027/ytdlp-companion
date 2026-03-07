import React, { useState, useCallback } from 'react';
import { evolinkChat } from '../../services/evolinkService';
import { evolinkGenerateImage } from '../../services/evolinkService';
import { uploadMediaToHosting } from '../../services/uploadService';
import { showToast } from '../../stores/uiStore';
import { useElapsedTimer, formatElapsed } from '../../hooks/useElapsedTimer';
import type { DetailImageSegment, PageLength } from '../../types';
import type { EvolinkChatMessage } from '../../services/evolinkService';

// Re-export convenience type
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
  { id: 5, label: '5장', desc: '저관여/저가 제품 (핵심 집중)' },
  { id: 7, label: '7장', desc: '일반 구성 (리뷰/디테일 추가)' },
  { id: 9, label: '9장', desc: '고관여 제품 (브랜드/비교 추가)' },
  { id: 'custom', label: '직접 입력', desc: '원하는 장수를 지정' },
];

const GENDERS = ['남성', '여성', '전체'];
const AGE_RANGES = ['10대', '20대', '30대', '40대', '50대', '60대+'];

const STEPS: { id: Step; label: string; icon: string }[] = [
  { id: 1, label: '정보 입력', icon: '1' },
  { id: 2, label: '전략 기획', icon: '2' },
  { id: 3, label: '이미지 생성', icon: '3' },
];

// --- Helper: parse JSON from AI text ---

function extractJsonArray(text: string): DetailImageSegment[] | null {
  // Try to find JSON array in text
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
  } catch {
    return null;
  }
}

// --- Main Component ---

const DetailPageTab: React.FC = () => {
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
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
  const [pageLength, setPageLength] = useState<PageLength>('auto');
  const [customCount, setCustomCount] = useState(6);
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  // Step 2 state
  const [segments, setSegments] = useState<DetailImageSegment[]>([]);
  const [isPlanning, setIsPlanning] = useState(false);

  // Step 3 state
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  // Feature suggestion
  const [isSuggestingFeatures, setIsSuggestingFeatures] = useState(false);

  const elapsed = useElapsedTimer(isPlanning || isGeneratingAll);

  // --- Handlers ---

  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (newFiles.length === 0) return;

    // Show previews immediately
    const newPreviews = newFiles.map(f => URL.createObjectURL(f));
    setPreviewUrls(prev => [...prev, ...newPreviews]);
    setReferenceFiles(prev => [...prev, ...newFiles]);

    // Upload to Cloudinary in background
    setIsUploadingImages(true);
    try {
      const urls = await Promise.all(newFiles.map(f => uploadMediaToHosting(f)));
      setReferenceUrls(prev => [...prev, ...urls]);
    } catch (e) {
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

  const handleSuggestFeatures = useCallback(async () => {
    if (!productName.trim()) {
      showToast('상품명을 먼저 입력해주세요.');
      return;
    }
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
      if (lines.length > 0) {
        setFeatures(lines);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`특징 추천 실패: ${msg}`);
    } finally {
      setIsSuggestingFeatures(false);
    }
  }, [productName, category]);

  const handlePlan = useCallback(async () => {
    if (!productName.trim()) {
      showToast('상품명을 입력해주세요.');
      return;
    }
    setIsPlanning(true);

    try {
      const categoryLabel = CATEGORIES.find(c => c.id === category)?.label || category;
      const effectiveLength = pageLength === 'custom' ? customCount : pageLength;
      const validFeatures = features.filter(f => f.trim());

      const lengthInstruction = effectiveLength === 'auto'
        ? '상품 특성에 맞게 적절한 장수(5~9)를 AI가 판단하여 결정하세요.'
        : `정확히 ${effectiveLength}개의 섹션으로 구성하세요.`;

      const logicGuide = `
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
9장 추가: + Brand Story, Comparison`;

      const systemPrompt = `당신은 한국 스마트스토어/쿠팡 상세페이지 전문 전략가입니다.
입력된 상품 정보를 바탕으로 "팔리는 논리"가 적용된 상세페이지 기획안을 JSON 배열로 출력하세요.

${logicGuide}

중요 제약사항:
1. keyMessage는 반드시 자연스러운 한국어로만 작성하라. 영어 헤드라인(Premium, Best 등)을 절대 사용하지 마라.
2. visualPrompt는 영어로 작성하며, 9:16 세로 비율의 이커머스 상세페이지 이미지에 적합한 상세한 시각 묘사를 포함하라.
3. visualPrompt에 "Render the following Korean text prominently and aesthetically: [keyMessage 내용]"을 반드시 포함하라.
4. 각 섹션이 어떤 판매 논리 전략을 사용하는지 logicalSections에 태그로 명시하라.

출력 형식 (JSON 배열만 출력, 다른 텍스트 없이):
[
  {
    "title": "이미지 1 (후킹)",
    "logicalSections": ["Hook"],
    "keyMessage": "한글 카피 텍스트",
    "visualPrompt": "A high-quality 9:16 vertical e-commerce banner image..."
  }
]`;

      const userPrompt = `상품명: ${productName}
카테고리: ${categoryLabel}
${price ? `가격: ${price}` : ''}
${promo ? `프로모션: ${promo}` : ''}
핵심 특징: ${validFeatures.length > 0 ? validFeatures.join(', ') : '(없음)'}
타겟 성별: ${gender}
타겟 연령: ${ageRanges.join(', ')}
${lengthInstruction}`;

      const messages: EvolinkChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const response = await evolinkChat(messages, { temperature: 0.7, maxTokens: 8192 });
      const text = response.choices[0]?.message?.content || '';
      const parsed = extractJsonArray(text);

      if (!parsed || parsed.length === 0) {
        throw new Error('AI 응답에서 기획안을 파싱할 수 없습니다. 다시 시도해주세요.');
      }

      setSegments(parsed);
      setStep(2);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`기획 실패: ${msg}`);
    } finally {
      setIsPlanning(false);

    }
  }, [productName, category, price, promo, features, gender, ageRanges, pageLength, customCount]);

  const handleGenerateAll = useCallback(async () => {
    if (segments.length === 0) return;
    setIsGeneratingAll(true);
    setGenerationProgress(0);


    const imageUrls = referenceUrls.length > 0 ? referenceUrls : undefined;
    let completed = 0;

    // Sequential generation to avoid rate limits
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      setSegments(prev => prev.map((s, idx) =>
        idx === i ? { ...s, isGenerating: true, generationStatus: '생성 중...' } : s
      ));

      try {
        const fullPrompt = `High-quality vertical 9:16 e-commerce product detail page image. ${seg.visualPrompt}. The product is "${productName}". Render Korean text "${seg.keyMessage}" prominently with clean, modern typography. Professional commercial photography style with clean background.`;

        const resultUrl = await evolinkGenerateImage(
          fullPrompt,
          '9:16',
          '2K',
          imageUrls
        );

        completed++;
        setGenerationProgress(Math.round((completed / segments.length) * 100));
        setSegments(prev => prev.map((s, idx) =>
          idx === i ? { ...s, imageUrl: resultUrl, isGenerating: false, generationStatus: undefined } : s
        ));
      } catch (e) {
        completed++;
        setGenerationProgress(Math.round((completed / segments.length) * 100));
        const msg = e instanceof Error ? e.message : String(e);
        setSegments(prev => prev.map((s, idx) =>
          idx === i ? { ...s, isGenerating: false, generationStatus: `실패: ${msg.substring(0, 60)}` } : s
        ));
      }
    }

    setIsGeneratingAll(false);
    showToast('이미지 생성 완료!');
  }, [segments, referenceUrls, productName]);

  const handleRegenerateOne = useCallback(async (segIdx: number) => {
    const seg = segments[segIdx];
    if (!seg) return;

    setSegments(prev => prev.map((s, idx) =>
      idx === segIdx ? { ...s, isGenerating: true, generationStatus: '재생성 중...' } : s
    ));

    try {
      const imageUrls = referenceUrls.length > 0 ? referenceUrls : undefined;
      const fullPrompt = `High-quality vertical 9:16 e-commerce product detail page image. ${seg.visualPrompt}. The product is "${productName}". Render Korean text "${seg.keyMessage}" prominently with clean, modern typography. Professional commercial photography style.`;

      const resultUrl = await evolinkGenerateImage(fullPrompt, '9:16', '2K', imageUrls);
      setSegments(prev => prev.map((s, idx) =>
        idx === segIdx ? { ...s, imageUrl: resultUrl, isGenerating: false, generationStatus: undefined } : s
      ));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSegments(prev => prev.map((s, idx) =>
        idx === segIdx ? { ...s, isGenerating: false, generationStatus: `실패: ${msg.substring(0, 60)}` } : s
      ));
    }
  }, [segments, referenceUrls, productName]);

  const handleDownloadOne = useCallback((url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    a.click();
  }, []);

  const handleDownloadAll = useCallback(() => {
    segments.forEach((seg, idx) => {
      if (seg.imageUrl) {
        setTimeout(() => {
          handleDownloadOne(seg.imageUrl!, `detail_${idx + 1}_${productName || 'page'}.png`);
        }, idx * 300);
      }
    });
  }, [segments, productName, handleDownloadOne]);

  const updateFeature = (idx: number, value: string) => {
    setFeatures(prev => prev.map((f, i) => i === idx ? value : f));
  };

  const addFeature = () => setFeatures(prev => [...prev, '']);
  const removeFeature = (idx: number) => setFeatures(prev => prev.filter((_, i) => i !== idx));

  const toggleAge = (age: string) => {
    setAgeRanges(prev =>
      prev.includes(age) ? prev.filter(a => a !== age) : [...prev, age]
    );
  };

  const canProceedStep1 = productName.trim().length > 0;
  const allImagesGenerated = segments.length > 0 && segments.every(s => s.imageUrl);

  // --- Render ---

  return (
    <div className="animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center text-white text-lg font-bold shadow-lg">
            D
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">AI 상세페이지 빌더</h1>
            <p className="text-sm text-gray-400">상품 정보만 입력하면 '팔리는 논리'가 적용된 상세페이지를 자동 제작</p>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, idx) => {
          const isCurrent = s.id === step;
          const isCompleted = s.id < step;
          return (
            <React.Fragment key={s.id}>
              {idx > 0 && (
                <div className={`flex-1 h-px max-w-[60px] ${isCompleted ? 'bg-teal-500/60' : 'bg-gray-700'}`} />
              )}
              <button
                onClick={() => {
                  if (s.id === 1) setStep(1);
                  else if (s.id === 2 && segments.length > 0) setStep(2);
                  else if (s.id === 3 && segments.some(seg => seg.imageUrl)) setStep(3);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  isCurrent
                    ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30'
                    : isCompleted
                      ? 'text-teal-400/70 hover:text-teal-300'
                      : 'text-gray-600'
                }`}
              >
                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                  isCurrent ? 'bg-teal-500 text-white' : isCompleted ? 'bg-teal-500/50 text-white' : 'bg-gray-700 text-gray-500'
                }`}>
                  {isCompleted ? '✓' : s.icon}
                </span>
                {s.label}
              </button>
            </React.Fragment>
          );
        })}

        {/* Timer */}
        {(isPlanning || isGeneratingAll) && (
          <span className="ml-auto text-xs text-gray-500 font-mono">{formatElapsed(elapsed)}</span>
        )}
      </div>

      {/* Step 1: Info Input */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Product Name & Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-1.5">상품명 *</label>
              <input
                type="text"
                value={productName}
                onChange={e => setProductName(e.target.value)}
                placeholder="예: 프리미엄 히알루론산 세럼 30ml"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-1.5">카테고리</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-teal-500 focus:outline-none transition-colors"
              >
                {CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Price & Promo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-1.5">가격 (선택)</label>
              <input
                type="text"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="예: 29,900원"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-1.5">프로모션 (선택)</label>
              <input
                type="text"
                value={promo}
                onChange={e => setPromo(e.target.value)}
                placeholder="예: 오늘만 1+1, 무료배송"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Features */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-bold text-gray-300">핵심 특징 (USP)</label>
              <button
                onClick={handleSuggestFeatures}
                disabled={isSuggestingFeatures}
                className="text-xs px-3 py-1 bg-teal-600/20 text-teal-400 border border-teal-500/30 rounded-lg hover:bg-teal-600/30 transition-colors disabled:opacity-50"
              >
                {isSuggestingFeatures ? '추천 중...' : 'AI 자동 추천'}
              </button>
            </div>
            <div className="space-y-2">
              {features.map((f, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={f}
                    onChange={e => updateFeature(idx, e.target.value)}
                    placeholder={`특징 ${idx + 1}`}
                    className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-teal-500 focus:outline-none transition-colors text-sm"
                  />
                  {features.length > 1 && (
                    <button onClick={() => removeFeature(idx)} className="px-2 text-gray-500 hover:text-red-400 transition-colors text-lg">x</button>
                  )}
                </div>
              ))}
              {features.length < 8 && (
                <button onClick={addFeature} className="text-xs text-gray-500 hover:text-teal-400 transition-colors">+ 특징 추가</button>
              )}
            </div>
          </div>

          {/* Target */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-1.5">타겟 성별</label>
              <div className="flex gap-2">
                {GENDERS.map(g => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      gender === g
                        ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30'
                        : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-1.5">타겟 연령 (다중 선택)</label>
              <div className="flex flex-wrap gap-2">
                {AGE_RANGES.map(age => (
                  <button
                    key={age}
                    onClick={() => toggleAge(age)}
                    className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                      ageRanges.includes(age)
                        ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30'
                        : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {age}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Reference Images */}
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-1.5">
              제품 레퍼런스 이미지
              {isUploadingImages && <span className="ml-2 text-teal-400 text-xs font-normal">(업로드 중...)</span>}
            </label>
            <div className="flex flex-wrap gap-3 mb-3">
              {previewUrls.map((url, idx) => (
                <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-700 group">
                  <img src={url} alt={`ref-${idx}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    x
                  </button>
                </div>
              ))}
              <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center cursor-pointer hover:border-teal-500/50 transition-colors">
                <span className="text-2xl text-gray-500">+</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={e => handleImageUpload(e.target.files)}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-xs text-gray-500">제품 실사 사진을 업로드하면 이미지 생성 시 제품 외형을 반영합니다 (Img2Img)</p>
          </div>

          {/* Page Length */}
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2">상세페이지 길이</label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {PAGE_LENGTHS.map(pl => (
                <button
                  key={String(pl.id)}
                  onClick={() => setPageLength(pl.id)}
                  className={`px-3 py-3 rounded-lg text-sm font-bold transition-all text-left ${
                    pageLength === pl.id
                      ? 'bg-teal-600/20 text-teal-400 border border-teal-500/30'
                      : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="font-bold">{pl.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{pl.desc}</div>
                </button>
              ))}
            </div>
            {pageLength === 'custom' && (
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="number"
                  min={3}
                  max={15}
                  value={customCount}
                  onChange={e => setCustomCount(Math.max(3, Math.min(15, parseInt(e.target.value) || 3)))}
                  className="w-20 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-center focus:border-teal-500 focus:outline-none"
                />
                <span className="text-sm text-gray-400">장 (3~15)</span>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="pt-4">
            <button
              onClick={handlePlan}
              disabled={!canProceedStep1 || isPlanning}
              className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${
                canProceedStep1 && !isPlanning
                  ? 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white shadow-lg shadow-teal-900/30'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isPlanning ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-teal-400 rounded-full animate-spin" />
                  AI 전략 기획 중... ({formatElapsed(elapsed)})
                </span>
              ) : (
                'AI 전략 기획 시작'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Planning Result */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-white">기획안 ({segments.length}개 섹션)</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-bold transition-colors"
              >
                이전 단계
              </button>
              <button
                onClick={handlePlan}
                disabled={isPlanning}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
              >
                {isPlanning ? '재기획 중...' : '다시 기획'}
              </button>
            </div>
          </div>

          {/* Segment Cards */}
          <div className="space-y-3">
            {segments.map((seg, idx) => (
              <div key={seg.id} className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-teal-600/20 text-teal-400 text-sm font-bold border border-teal-500/30 shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm mb-1">{seg.title}</div>
                    <div className="flex flex-wrap gap-1">
                      {seg.logicalSections.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-teal-600/10 text-teal-400 rounded text-xs border border-teal-500/20">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Key Message (editable) */}
                <div className="mb-3">
                  <label className="text-xs text-gray-500 font-bold mb-1 block">Key Message (한글 카피)</label>
                  <textarea
                    value={seg.keyMessage}
                    onChange={e => setSegments(prev => prev.map((s, i) =>
                      i === idx ? { ...s, keyMessage: e.target.value } : s
                    ))}
                    rows={2}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-teal-500 focus:outline-none resize-none"
                  />
                </div>

                {/* Visual Prompt (editable, collapsed) */}
                <details className="group">
                  <summary className="text-xs text-gray-500 font-bold cursor-pointer hover:text-gray-400 transition-colors">
                    Visual Prompt (클릭하여 편집)
                  </summary>
                  <textarea
                    value={seg.visualPrompt}
                    onChange={e => setSegments(prev => prev.map((s, i) =>
                      i === idx ? { ...s, visualPrompt: e.target.value } : s
                    ))}
                    rows={3}
                    className="w-full mt-2 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-300 text-xs focus:border-teal-500 focus:outline-none resize-none font-mono"
                  />
                </details>
              </div>
            ))}
          </div>

          {/* Generate All Button */}
          <div className="pt-4">
            <button
              onClick={() => { setStep(3); handleGenerateAll(); }}
              disabled={isGeneratingAll || segments.length === 0}
              className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${
                !isGeneratingAll
                  ? 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white shadow-lg shadow-teal-900/30'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              이미지 일괄 생성 ({segments.length}장)
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Generation + Preview */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-white">
              상세페이지 미리보기
              {isGeneratingAll && (
                <span className="ml-3 text-sm text-teal-400 font-normal">
                  생성 중 {generationProgress}% ({formatElapsed(elapsed)})
                </span>
              )}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-bold transition-colors"
              >
                기획안 수정
              </button>
              {allImagesGenerated && (
                <button
                  onClick={handleDownloadAll}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-bold transition-colors"
                >
                  전체 다운로드
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {isGeneratingAll && (
            <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500"
                style={{ width: `${generationProgress}%` }}
              />
            </div>
          )}

          {/* Vertical Preview */}
          <div className="max-w-md mx-auto space-y-1">
            {segments.map((seg, idx) => (
              <div key={seg.id} className="relative group">
                {seg.imageUrl ? (
                  <div className="relative">
                    <img
                      src={seg.imageUrl}
                      alt={seg.title}
                      className="w-full rounded-lg border border-gray-700"
                      loading="lazy"
                    />
                    {/* Overlay controls */}
                    <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleRegenerateOne(idx)}
                        disabled={seg.isGenerating}
                        className="px-2 py-1 bg-black/70 text-white rounded text-xs hover:bg-black/90 transition-colors disabled:opacity-50"
                      >
                        {seg.isGenerating ? '...' : '재생성'}
                      </button>
                      <button
                        onClick={() => handleDownloadOne(seg.imageUrl!, `detail_${idx + 1}.png`)}
                        className="px-2 py-1 bg-black/70 text-white rounded text-xs hover:bg-black/90 transition-colors"
                      >
                        다운로드
                      </button>
                    </div>
                    {/* Section label */}
                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white rounded text-xs font-bold">
                      {idx + 1}/{segments.length}
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-[9/16] bg-gray-800/60 border border-gray-700 rounded-lg flex flex-col items-center justify-center gap-3">
                    {seg.isGenerating ? (
                      <>
                        <div className="w-8 h-8 border-2 border-gray-600 border-t-teal-400 rounded-full animate-spin" />
                        <span className="text-sm text-gray-400">{seg.generationStatus || '생성 중...'}</span>
                      </>
                    ) : seg.generationStatus ? (
                      <>
                        <span className="text-sm text-red-400">{seg.generationStatus}</span>
                        <button
                          onClick={() => handleRegenerateOne(idx)}
                          className="px-3 py-1.5 bg-teal-600/20 text-teal-400 border border-teal-500/30 rounded-lg text-xs hover:bg-teal-600/30 transition-colors"
                        >
                          재시도
                        </button>
                      </>
                    ) : (
                      <span className="text-sm text-gray-500">대기 중 ({idx + 1}/{segments.length})</span>
                    )}
                    {/* Section info */}
                    <div className="text-center px-4">
                      <div className="text-xs text-gray-600 font-bold">{seg.title}</div>
                      <div className="text-xs text-gray-500 mt-1 line-clamp-2">{seg.keyMessage}</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Generate remaining / regenerate all */}
          {!isGeneratingAll && segments.some(s => !s.imageUrl) && (
            <div className="pt-2 text-center">
              <button
                onClick={handleGenerateAll}
                className="px-6 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-teal-900/30"
              >
                미완성 이미지 생성
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DetailPageTab;
