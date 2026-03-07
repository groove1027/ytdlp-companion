import React, { useState, useCallback, useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useCostStore } from '../../stores/costStore';
import { evolinkChat } from '../../services/evolinkService';
import type { EvolinkChatMessage } from '../../services/evolinkService';
import { generateSceneImage } from '../../services/gemini/imageGeneration';
import { showToast } from '../../stores/uiStore';
import { extractJsonFromText } from '../../services/gemini/scriptAnalysis';
import { PRICING } from '../../constants';
import { AspectRatio, ImageModel } from '../../types';
import {
  CONTENT_STYLES,
  DESIGN_STYLES,
  DETAIL_LEVELS,
  buildSlideGenerationPrompt,
  type ContentStyle,
  type DesignStyle,
  type DetailLevel,
} from '../../data/slideStylePresets';
import { useElapsedTimer, formatElapsed } from '../../hooks/useElapsedTimer';

// ─── Types ───

interface SlideData {
  slideNumber: number;
  title: string;
  body: string;
  keyPoints: string[];
  visualHint: string;
  speakerNote?: string;
  imageUrl?: string;
  isGeneratingImage?: boolean;
}

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { id: 1 as Step, label: '텍스트 입력', icon: '📝' },
  { id: 2 as Step, label: '디자인 스타일', icon: '🎨' },
  { id: 3 as Step, label: '세부 설정', icon: '⚙️' },
  { id: 4 as Step, label: '슬라이드 생성', icon: '📊' },
];

// ─── Design Style Lightbox ───

const DesignStyleLightbox: React.FC<{
  initialIndex: number;
  selectedId: string;
  onSelect: (style: DesignStyle) => void;
  onClose: () => void;
}> = ({ initialIndex, selectedId, onSelect, onClose }) => {
  const [currentIdx, setCurrentIdx] = useState(initialIndex);
  const [imgError, setImgError] = useState(false);

  const navigate = useCallback((dir: 1 | -1) => {
    const next = currentIdx + dir;
    if (next >= 0 && next < DESIGN_STYLES.length) {
      setCurrentIdx(next);
      setImgError(false);
    }
  }, [currentIdx]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, onClose]);

  const style = DESIGN_STYLES[currentIdx];
  const src = `/slide-previews/${style.id}.jpg`;
  const isSelected = selectedId === style.id;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative bg-gray-900 rounded-2xl max-w-2xl w-full p-4" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-white text-2xl z-10">&times;</button>

        <div className="aspect-video rounded-xl overflow-hidden bg-gray-800 mb-3">
          {imgError ? (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: style.bgColor }}>
              <div className="w-16 h-10 rounded-lg border-2" style={{ borderColor: style.accentColor, backgroundColor: `${style.accentColor}22` }} />
            </div>
          ) : (
            <img src={src} alt={style.label} className="w-full h-full object-cover" onError={() => setImgError(true)} />
          )}
        </div>

        <div className="text-center mb-3">
          <div className="text-xl font-bold text-white">{style.label}</div>
          <div className="text-sm text-gray-400 mt-1">{style.description}</div>
        </div>

        {isSelected ? (
          <div className="w-full mb-3 py-2.5 rounded-xl bg-green-600/20 border border-green-500/50 text-green-300 font-bold text-sm flex items-center justify-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            현재 선택된 스타일
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { onSelect(style); onClose(); }}
            className="w-full mb-3 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            이 스타일 적용하기
          </button>
        )}

        <div className="flex justify-between items-center">
          <button
            onClick={() => navigate(-1)}
            disabled={currentIdx === 0}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white disabled:opacity-30 hover:bg-gray-700 transition-colors"
          >
            ← 이전
          </button>
          <span className="text-sm text-gray-500">{currentIdx + 1} / {DESIGN_STYLES.length}</span>
          <button
            onClick={() => navigate(1)}
            disabled={currentIdx === DESIGN_STYLES.length - 1}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white disabled:opacity-30 hover:bg-gray-700 transition-colors"
          >
            다음 →
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Design Style Preview Card ───

const DesignPreviewCard: React.FC<{
  style: DesignStyle;
  isActive: boolean;
  onClick: () => void;
  onZoom: () => void;
}> = ({ style, isActive, onClick, onZoom }) => {
  const [imgError, setImgError] = useState(false);
  const imgSrc = `/slide-previews/${style.id}.jpg`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border-2 overflow-hidden transition-all ${
        isActive
          ? 'border-sky-500 ring-2 ring-sky-500/30 scale-[1.02]'
          : 'border-gray-700 hover:border-sky-500/40'
      }`}
    >
      <div className="aspect-video relative group" style={{ backgroundColor: style.bgColor }}>
        {!imgError ? (
          <img
            src={imgSrc}
            alt={style.label}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-12 h-8 rounded-lg border-2"
              style={{ borderColor: style.accentColor, backgroundColor: `${style.accentColor}22` }}
            />
          </div>
        )}
        {/* Zoom button */}
        <div
          onClick={(e) => { e.stopPropagation(); onZoom(); }}
          className="absolute top-1.5 left-1.5 w-7 h-7 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-zoom-in"
        >
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
        </div>
        {isActive && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </div>
      <div className="p-2.5">
        <div className={`text-sm font-bold ${isActive ? 'text-sky-300' : 'text-gray-200'}`}>{style.label}</div>
        <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{style.description}</div>
      </div>
    </button>
  );
};

// ─── Slide Preview Card ───

const SlidePreview: React.FC<{
  slide: SlideData;
  designStyle: DesignStyle;
  onRegenImage: () => void;
}> = ({ slide, designStyle, onRegenImage }) => (
  <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
    <div className="aspect-video relative" style={{ backgroundColor: designStyle.bgColor }}>
      {slide.isGeneratingImage ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : slide.imageUrl ? (
        <img src={slide.imageUrl} alt={`Slide ${slide.slideNumber}`} className="w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
          이미지 미생성
        </div>
      )}
      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded">
        #{slide.slideNumber}
      </div>
    </div>
    <div className="p-3 space-y-2">
      <h4 className="text-sm font-bold text-gray-100 line-clamp-1">{slide.title}</h4>
      <p className="text-xs text-gray-400 line-clamp-3">{slide.body}</p>
      {slide.keyPoints.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {slide.keyPoints.map((kp, i) => (
            <span key={i} className="text-[10px] bg-sky-900/30 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded">
              {kp}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onRegenImage}
        disabled={slide.isGeneratingImage}
        className="text-[10px] text-sky-400 hover:text-sky-300 border border-sky-500/30 hover:border-sky-500/50 px-2 py-1 rounded transition-colors disabled:opacity-30"
      >
        이미지 재생성
      </button>
    </div>
  </div>
);

// ─── Main Component ───

export default function PptMasterTab() {
  const config = useProjectStore((s) => s.config);
  const addCost = useCostStore((s) => s.addCost);

  // Wizard state
  const [step, setStep] = useState<Step>(1);
  const [inputText, setInputText] = useState('');
  const [selectedContentStyle, setSelectedContentStyle] = useState<ContentStyle>(CONTENT_STYLES[0]);
  const [selectedDesignStyle, setSelectedDesignStyle] = useState<DesignStyle>(DESIGN_STYLES[0]);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('standard');
  const [slideCount, setSlideCount] = useState(8);

  // Lightbox
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [genError, setGenError] = useState('');
  const [isBatchingImages, setIsBatchingImages] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [previewMode, setPreviewMode] = useState(false);

  const elapsed = useElapsedTimer(isGenerating);
  const elapsedBatch = useElapsedTimer(isBatchingImages);

  const importScript = useCallback(() => {
    const script = config?.script;
    if (script?.trim()) {
      setInputText(script);
      showToast('프로젝트 대본을 가져왔습니다.');
    } else {
      showToast('프로젝트에 저장된 대본이 없습니다.');
    }
  }, [config]);

  // ─── Helper: 이미지 생성 (지정 인덱스 범위) ───
  const generateImagesForRange = useCallback(async (
    slidesData: SlideData[],
    startIdx: number,
    endIdx: number,
  ) => {
    for (let i = startIdx; i < endIdx; i++) {
      const slide = slidesData[i];
      if (!slide || slide.imageUrl) continue;
      setSlides(prev => prev.map((s, idx) => idx === i ? { ...s, isGeneratingImage: true } : s));

      try {
        const combinedPrompt = `${selectedDesignStyle.prompt}, presentation slide illustration for: ${slide.visualHint}`;
        const fakeScene = {
          id: `ppt-${Date.now()}-${i}`,
          scriptText: slide.body,
          visualPrompt: combinedPrompt,
          visualDescriptionKO: slide.title,
          characterPresent: false,
          isGeneratingImage: false,
          isGeneratingVideo: false,
          isNativeHQ: false,
        };

        const result = await generateSceneImage(
          fakeScene,
          selectedDesignStyle.prompt,
          AspectRatio.LANDSCAPE,
          ImageModel.NANO_SPEED,
        );
        addCost(PRICING.IMAGE_GENERATION, 'image');
        const imageUrl = typeof result === 'string' ? result : result.url;
        setSlides(prev => prev.map((s, idx) => idx === i ? { ...s, imageUrl, isGeneratingImage: false } : s));
      } catch {
        setSlides(prev => prev.map((s, idx) => idx === i ? { ...s, isGeneratingImage: false } : s));
      }
      setBatchProgress(prev => ({ ...prev, current: prev.current + 1 }));
    }
  }, [selectedDesignStyle, addCost]);

  // ─── AI 슬라이드 생성 ───
  const handleGenerate = useCallback(async () => {
    if (!inputText.trim()) return;
    setIsGenerating(true);
    setGenError('');
    setSlides([]);
    setPreviewMode(false);

    try {
      const systemPrompt = buildSlideGenerationPrompt(selectedContentStyle, detailLevel, slideCount);
      const userPrompt = `아래 텍스트를 분석하여 ${slideCount}장의 프레젠테이션 슬라이드로 재구성하세요.\n\n---\n${inputText}\n---`;

      const maxTokens = Math.min(65000, Math.max(16000, slideCount * 300));
      const messages: EvolinkChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      const res = await evolinkChat(messages, { temperature: 0.7, maxTokens });
      const raw = res.choices?.[0]?.message?.content || '';
      const jsonStr = extractJsonFromText(raw);
      if (!jsonStr) throw new Error('AI 응답에서 JSON을 추출할 수 없습니다.');

      const parsed: SlideData[] = JSON.parse(jsonStr);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('슬라이드 데이터가 비어있습니다.');

      const processedSlides = parsed.map((s, i) => ({
        ...s,
        slideNumber: i + 1,
        keyPoints: s.keyPoints || [],
        visualHint: s.visualHint || '',
      }));

      setSlides(processedSlides);
      addCost(PRICING.GEMINI_PRO_INPUT_PER_1M * 0.002, 'analysis');

      // 10장 초과: 미리보기 모드 (처음 2장만 이미지 자동 생성)
      if (processedSlides.length > 10) {
        setPreviewMode(true);
        setStep(4);
        setBatchProgress({ current: 0, total: 2 });
        // 자동으로 처음 2장 이미지 생성 (비동기)
        setTimeout(async () => {
          await generateImagesForRange(processedSlides, 0, Math.min(2, processedSlides.length));
        }, 100);
        showToast(`${processedSlides.length}장 슬라이드 생성! 미리보기 이미지 2장 생성 중...`);
      } else {
        setStep(4);
        showToast(`${processedSlides.length}장 슬라이드 생성 완료!`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '슬라이드 생성 실패';
      setGenError(msg);
    } finally {
      setIsGenerating(false);
    }
  }, [inputText, selectedContentStyle, detailLevel, slideCount, addCost, generateImagesForRange]);

  // ─── 이미지 일괄 생성 ───
  const handleBatchImages = useCallback(async () => {
    if (slides.length === 0) return;
    setIsBatchingImages(true);
    setPreviewMode(false);

    const startIdx = slides.findIndex(s => !s.imageUrl && !s.isGeneratingImage);
    const remaining = slides.filter(s => !s.imageUrl).length;
    setBatchProgress({ current: 0, total: remaining });

    await generateImagesForRange(slides, startIdx >= 0 ? startIdx : 0, slides.length);

    setIsBatchingImages(false);
    showToast('슬라이드 이미지 생성 완료!');
  }, [slides, generateImagesForRange]);

  // ─── 개별 이미지 재생성 ───
  const handleRegenImage = useCallback(async (index: number) => {
    const slide = slides[index];
    if (!slide) return;

    setSlides(prev => prev.map((s, i) => i === index ? { ...s, isGeneratingImage: true } : s));
    try {
      const combinedPrompt = `${selectedDesignStyle.prompt}, presentation slide illustration for: ${slide.visualHint}`;
      const fakeScene = {
        id: `ppt-regen-${Date.now()}-${index}`,
        scriptText: slide.body,
        visualPrompt: combinedPrompt,
        visualDescriptionKO: slide.title,
        characterPresent: false,
        isGeneratingImage: false,
        isGeneratingVideo: false,
        isNativeHQ: false,
      };

      const result = await generateSceneImage(
        fakeScene,
        selectedDesignStyle.prompt,
        AspectRatio.LANDSCAPE,
        ImageModel.NANO_SPEED,
      );
      addCost(PRICING.IMAGE_GENERATION, 'image');
      const imageUrl = typeof result === 'string' ? result : result.url;
      setSlides(prev => prev.map((s, i) => i === index ? { ...s, imageUrl, isGeneratingImage: false } : s));
    } catch {
      setSlides(prev => prev.map((s, i) => i === index ? { ...s, isGeneratingImage: false } : s));
      showToast('이미지 생성 실패');
    }
  }, [slides, selectedDesignStyle, addCost]);

  // ─── PPTX 내보내기 ───
  const handleExportPptx = useCallback(async () => {
    try {
      const pptxgenjs = await import('pptxgenjs');
      const pptx = new pptxgenjs.default();
      pptx.layout = 'LAYOUT_WIDE';

      for (const slide of slides) {
        const s = pptx.addSlide();

        if (slide.imageUrl) {
          s.background = { data: slide.imageUrl };
          s.addShape(pptx.ShapeType.rect, {
            x: 0, y: 0, w: '100%', h: '100%',
            fill: { color: '000000', transparency: 50 },
          });
        } else {
          s.background = { color: selectedDesignStyle.bgColor.replace('#', '') };
        }

        s.addText(slide.title, {
          x: 0.5, y: 0.3, w: 9, h: 1,
          fontSize: 28, bold: true, color: 'FFFFFF', fontFace: 'Arial',
        });

        s.addText(slide.body, {
          x: 0.5, y: 1.5, w: 9, h: 3.5,
          fontSize: 16, color: 'E0E0E0', fontFace: 'Arial', lineSpacingMultiple: 1.4,
        });

        if (slide.keyPoints.length > 0) {
          s.addText(slide.keyPoints.map(kp => `  ${kp}`).join('\n'), {
            x: 0.5, y: 5.2, w: 9, h: 1.5,
            fontSize: 14, color: selectedDesignStyle.accentColor.replace('#', ''),
            fontFace: 'Arial', bold: true,
          });
        }

        if (slide.speakerNote) s.addNotes(slide.speakerNote);
      }

      const fileName = `PPT_${selectedContentStyle.label}_${selectedDesignStyle.label}_${slides.length}slides.pptx`;
      await pptx.writeFile({ fileName });
      showToast(`${fileName} 다운로드 완료!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'PPTX 내보내기 실패';
      showToast(`PPTX 내보내기 실패: ${msg}`);
    }
  }, [slides, selectedDesignStyle, selectedContentStyle]);

  // ─── Render ───

  const canGenerate = inputText.trim().length > 0 && slideCount >= 3 && slideCount <= 150;
  const remainingImages = slides.filter(s => !s.imageUrl && !s.isGeneratingImage).length;

  return (
    <div className="animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-700 flex items-center justify-center text-xl">
          <span>📊</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">PPT 마스터</h2>
          <p className="text-sm text-gray-400">AI가 텍스트를 분석하여 프레젠테이션 슬라이드를 자동 생성합니다.</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            {i > 0 && <div className={`w-6 h-px ${s.id <= 3 || slides.length > 0 ? 'bg-sky-500/40' : 'bg-gray-700'}`} />}
            <button
              onClick={() => s.id <= 3 && setStep(s.id)}
              disabled={s.id === 4 && slides.length === 0}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                step === s.id
                  ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                  : s.id <= 3 || slides.length > 0
                    ? 'bg-gray-800/50 text-gray-300 border border-gray-700 cursor-pointer hover:border-sky-500/30'
                    : 'bg-gray-800/30 text-gray-600 border border-gray-800 cursor-not-allowed'
              }`}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* ━━ Step 1: Text Input ━━ */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-200">텍스트 입력</h3>
            <button onClick={importScript} className="text-xs text-sky-400 hover:text-sky-300 border border-sky-500/30 px-3 py-1.5 rounded-lg transition-colors">
              프로젝트 대본 가져오기
            </button>
          </div>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={12}
            placeholder="프레젠테이션으로 변환할 텍스트를 입력하세요. 보고서, 기획안, 에세이, 대본 등 어떤 텍스트든 가능합니다."
            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-500/50 resize-none"
          />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{inputText.length.toLocaleString()}자</span>
            <span>권장: 500~10,000자</span>
          </div>
        </div>
      )}

      {/* ━━ Step 2: Design Style ━━ */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-200">디자인 스타일</h3>
          <p className="text-sm text-gray-400">슬라이드 배경 이미지의 비주얼 스타일입니다. 미리보기 이미지를 클릭하면 크게 볼 수 있습니다.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {DESIGN_STYLES.map((ds, idx) => (
              <DesignPreviewCard
                key={ds.id}
                style={ds}
                isActive={selectedDesignStyle.id === ds.id}
                onClick={() => setSelectedDesignStyle(ds)}
                onZoom={() => setLightboxIdx(idx)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ━━ Step 3: Settings (Content Style + Detail Level + Slide Count) ━━ */}
      {step === 3 && (
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-gray-200">세부 설정</h3>

          {/* Content Style */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-300">콘텐츠 구조화 스타일</label>
            <p className="text-xs text-gray-500">AI가 텍스트를 분석하고 슬라이드로 재구성하는 방식입니다.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CONTENT_STYLES.map(cs => (
                <button
                  key={cs.id}
                  type="button"
                  onClick={() => setSelectedContentStyle(cs)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    selectedContentStyle.id === cs.id
                      ? 'bg-sky-600/15 border-sky-500/50 ring-1 ring-sky-500/20'
                      : 'bg-gray-800/50 border-gray-700 hover:border-sky-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">{cs.icon}</span>
                    <span className={`text-sm font-bold ${selectedContentStyle.id === cs.id ? 'text-sky-300' : 'text-gray-200'}`}>
                      {cs.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{cs.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Detail level */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-300">정보 수준</label>
            <div className="flex gap-2">
              {DETAIL_LEVELS.map(dl => (
                <button
                  key={dl.id}
                  type="button"
                  onClick={() => setDetailLevel(dl.id)}
                  className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${
                    detailLevel === dl.id
                      ? 'bg-sky-600/15 border-sky-500/50'
                      : 'bg-gray-800/50 border-gray-700 hover:border-sky-500/30'
                  }`}
                >
                  <div className={`text-sm font-bold ${detailLevel === dl.id ? 'text-sky-300' : 'text-gray-200'}`}>{dl.label}</div>
                  <div className="text-xs text-gray-400 mt-1">{dl.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Slide count */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-300">슬라이드 장수</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={3}
                max={150}
                value={slideCount}
                onChange={(e) => setSlideCount(Number(e.target.value))}
                className="flex-1 accent-sky-500"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={3}
                  max={150}
                  value={slideCount}
                  onChange={(e) => setSlideCount(Math.min(150, Math.max(3, Number(e.target.value))))}
                  className="w-16 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 text-center focus:outline-none focus:border-sky-500/50"
                />
                <span className="text-sm text-gray-400">장</span>
              </div>
            </div>
            {slideCount > 10 && (
              <div className="bg-sky-900/15 border border-sky-500/20 rounded-lg p-2.5 text-xs text-sky-300/80">
                10장 초과 시 비용 절약을 위해 미리보기 2장을 먼저 생성한 후, 확인 후 나머지를 일괄 생성합니다.
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-4 space-y-2">
            <div className="text-sm font-bold text-gray-300">설정 요약</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-gray-500">콘텐츠 스타일</div>
              <div className="text-sky-300 font-medium">{selectedContentStyle.icon} {selectedContentStyle.label}</div>
              <div className="text-gray-500">디자인 스타일</div>
              <div className="text-sky-300 font-medium">{selectedDesignStyle.label}</div>
              <div className="text-gray-500">정보 수준</div>
              <div className="text-sky-300 font-medium">{DETAIL_LEVELS.find(d => d.id === detailLevel)?.label}</div>
              <div className="text-gray-500">슬라이드 장수</div>
              <div className="text-sky-300 font-medium">{slideCount}장</div>
              <div className="text-gray-500">입력 텍스트</div>
              <div className={`font-medium ${inputText.trim() ? 'text-sky-300' : 'text-amber-400'}`}>
                {inputText.trim() ? `${inputText.length.toLocaleString()}자` : '미입력 — Step 1에서 입력하세요'}
              </div>
            </div>
          </div>

          {genError && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">{genError}</div>
          )}
        </div>
      )}

      {/* ━━ Step 4: Results ━━ */}
      {step === 4 && slides.length > 0 && (
        <div className="space-y-4">
          {/* Preview Mode Banner */}
          {previewMode && (
            <div className="bg-gradient-to-br from-sky-900/30 to-indigo-900/30 border border-sky-500/30 rounded-2xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center text-2xl flex-shrink-0">
                  🎯
                </div>
                <div className="space-y-2">
                  <h4 className="text-base font-bold text-sky-300">미리보기 모드 — 비용을 아끼며 스타일을 확인하세요!</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    <strong className="text-white">{slides.length}장</strong>의 슬라이드 중 처음 <strong className="text-white">2장</strong>의 이미지만 먼저 생성했습니다.
                    아래 미리보기를 확인한 후, 디자인 스타일이 마음에 드시면 나머지 이미지도 한 번에 생성하세요.
                  </p>
                </div>
              </div>

              <div className="bg-black/20 rounded-xl p-4 space-y-2.5">
                <div className="text-xs font-bold text-sky-400 uppercase tracking-wider">왜 미리보기를 먼저 할까요?</div>
                <ul className="text-sm text-gray-300 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400 mt-0.5">•</span>
                    <span><strong className="text-gray-200">{slides.length}장</strong>의 슬라이드 이미지를 모두 생성하면 시간과 비용이 많이 소요됩니다.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400 mt-0.5">•</span>
                    <span>먼저 <strong className="text-gray-200">2장</strong>으로 디자인 스타일의 결과물을 확인하면 불필요한 재생성을 방지할 수 있습니다.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400 mt-0.5">•</span>
                    <span>마음에 들지 않으면 <strong className="text-amber-300">뒤로 돌아가서</strong> 디자인 스타일이나 설정을 자유롭게 변경하세요.</span>
                  </li>
                </ul>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBatchImages}
                  disabled={isBatchingImages}
                  className="flex-1 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isBatchingImages ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      생성 중 {batchProgress.current}/{batchProgress.total}
                    </>
                  ) : (
                    <>마음에 들어요! 나머지 {remainingImages}장 이미지 일괄 생성</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-5 py-3 rounded-xl text-sm font-medium text-gray-300 border border-gray-600 hover:border-gray-500 hover:text-white transition-all"
                >
                  설정 변경하기
                </button>
              </div>
            </div>
          )}

          {/* Slides header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-200">
              슬라이드 ({slides.length}장)
              {isBatchingImages && !previewMode && (
                <span className="ml-2 text-sm text-sky-400 font-normal">
                  이미지 생성 중 {batchProgress.current}/{batchProgress.total}
                  {elapsedBatch > 0 && <span className="ml-1 text-gray-500 tabular-nums">{formatElapsed(elapsedBatch)}</span>}
                </span>
              )}
            </h3>
            {!previewMode && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBatchImages}
                  disabled={isBatchingImages || remainingImages === 0}
                  className="text-xs bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white px-3 py-1.5 rounded-lg font-bold transition-all disabled:opacity-50"
                >
                  {isBatchingImages ? '생성 중...' : remainingImages > 0 ? `이미지 생성 (${remainingImages}장)` : '이미지 생성 완료'}
                </button>
                <button
                  type="button"
                  onClick={handleExportPptx}
                  className="text-xs bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white px-3 py-1.5 rounded-lg font-bold transition-all"
                >
                  PPTX 내보내기
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {slides.map((slide, i) => (
              <SlidePreview
                key={i}
                slide={slide}
                designStyle={selectedDesignStyle}
                onRegenImage={() => handleRegenImage(i)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ━━ Navigation ━━ */}
      {step < 4 && (
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-gray-800">
          <button
            type="button"
            onClick={() => setStep((step - 1) as Step)}
            disabled={step === 1}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            이전
          </button>

          {step === 3 ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
              className="px-6 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  생성 중... {elapsed > 0 && <span className="text-xs text-sky-200 tabular-nums">{formatElapsed(elapsed)}</span>}
                </>
              ) : !inputText.trim() ? (
                '텍스트를 먼저 입력하세요'
              ) : (
                `슬라이드 생성 (${slideCount}장)`
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((step + 1) as Step)}
              className="px-6 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white transition-all"
            >
              다음
            </button>
          )}
        </div>
      )}

      {/* Step 4 뒤로가기 */}
      {step === 4 && !previewMode && (
        <div className="mt-6 pt-4 border-t border-gray-800">
          <button
            type="button"
            onClick={() => setStep(3)}
            className="text-xs text-gray-400 hover:text-gray-200 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            설정으로 돌아가기
          </button>
        </div>
      )}

      {/* Design Style Lightbox */}
      {lightboxIdx !== null && (
        <DesignStyleLightbox
          initialIndex={lightboxIdx}
          selectedId={selectedDesignStyle.id}
          onSelect={setSelectedDesignStyle}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}
