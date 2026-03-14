import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useCostStore } from '../../stores/costStore';
import { evolinkChat } from '../../services/evolinkService';
import { logger } from '../../services/LoggerService';
import type { EvolinkChatMessage } from '../../services/evolinkService';
import { generateEvolinkImageWrapped, generateKieImage } from '../../services/VideoGenService';
import { showToast } from '../../stores/uiStore';
import { extractJsonFromText } from '../../services/gemini/scriptAnalysis';
import { PRICING } from '../../constants';
import { AspectRatio } from '../../types';
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
import { useAuthGuard } from '../../hooks/useAuthGuard';
import { usePptMasterStore, getSelectedContentStyle, getSelectedDesignStyle } from '../../stores/pptMasterStore';
import pptxgenjs from 'pptxgenjs';
import JSZip from 'jszip';

// ─── File Upload Helpers ───

const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.csv', '.json', '.html', '.htm', '.xml', '.rtf', '.log', '.yaml', '.yml', '.toml'];
const SUPPORTED_ACCEPT = SUPPORTED_EXTENSIONS.join(',');

function stripHtmlTags(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function parseFileContent(content: string, fileName: string): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'html' || ext === 'htm') return stripHtmlTags(content);
  if (ext === 'rtf') return content.replace(/\{\\[^{}]*\}/g, '').replace(/\\[a-z]+\d* ?/gi, '').replace(/[{}]/g, '').trim();
  return content;
}

// ─── PPT 전용 이미지 생성 (스토리보드 모듈과 완전 독립) ───
// 3축 합성: 디자인 스타일(시각) + 콘텐츠 레이아웃(배치) + 슬라이드 데이터(텍스트)

async function generatePptSlideImage(
  designStyle: DesignStyle,
  contentStyle: ContentStyle,
  title: string,
  keyPoints: string[],
  visualHint: string,
  editInstruction?: string,
): Promise<string> {
  // 사용자 수정 지시가 있으면 프롬프트에 추가
  const editSection = editInstruction?.trim()
    ? `\nUSER EDIT REQUEST: Apply this modification to the slide design — "${editInstruction.trim()}"`
    : '';

  const prompt = [
    // 1) 슬라이드 배경 디자인 지시 (텍스트 없이 순수 디자인 요소만)
    `Generate a PRESENTATION SLIDE BACKGROUND image (16:9 landscape). This is a decorative background design — DO NOT render any text, titles, words, letters, or typography on the image.`,
    '',
    // 2) 디자인 스타일 (시각적 미학)
    `VISUAL DESIGN STYLE: ${designStyle.prompt}`,
    `Background color base: ${designStyle.bgColor}, accent color: ${designStyle.accentColor}.`,
    '',
    // 3) 콘텐츠 레이아웃 힌트 (디자인 요소 배치용)
    `DESIGN LAYOUT INSPIRATION: ${contentStyle.layoutHint}`,
    `Use this layout style for placing decorative elements (shapes, icons, graphics) — but do NOT render any actual text.`,
    '',
    // 4) 보조 비주얼 (아이콘, 도형, 차트 등)
    `Supporting visual elements (icons, shapes, abstract diagrams): ${visualHint}`,
    editSection,
    '',
    // 5) 강제 규칙
    `STRICT RULES:`,
    `- DO NOT render any text, titles, words, letters, numbers, or typography on the image.`,
    `- This is a pure decorative background — text will be overlaid separately by the presentation software.`,
    `- Include appropriate decorative elements: icons, shapes, gradients, patterns, abstract infographic elements.`,
    `- Leave clear space in the upper-left and center areas for text overlay.`,
    `- Do NOT include photographs of real people or character illustrations.`,
  ].filter(Boolean).join('\n');

  // Kie NanoBanana 2 우선 (스토리보드와 동일), Evolink 폴백
  try {
    return await generateKieImage(prompt, AspectRatio.LANDSCAPE);
  } catch (e) {
    logger.info('[PPT] Kie 실패, Evolink 폴백', e);
    return await generateEvolinkImageWrapped(prompt, AspectRatio.LANDSCAPE);
  }
}

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
type GenPhase = 'idle' | 'toc' | 'chunks' | 'preview';

const PROGRESS_TIPS = [
  '💡 브라우저 탭을 열어둔 채로 기다리면 더 안정적이에요',
  '📊 완성되면 PPTX로 바로 내보낼 수 있어요',
  '🎨 슬라이드마다 제목·본문·키포인트·발표자 노트가 포함돼요',
  '⚡ 장수가 많을수록 시간이 오래 걸려요 — 조금만 기다려주세요!',
  '✨ AI가 텍스트를 분석하고 최적의 구조를 설계하고 있어요',
  '🛠️ 완성 후 개별 슬라이드의 이미지만 따로 재생성할 수도 있어요',
];

const STEPS = [
  { id: 1 as Step, label: '내용 입력', icon: '📝' },
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
  onZoom: () => void;
}> = ({ style, isActive, onZoom }) => {
  const [imgError, setImgError] = useState(false);
  const imgSrc = `/slide-previews/${style.id}.jpg`;

  return (
    <button
      type="button"
      onClick={onZoom}
      className={`text-left rounded-xl border-2 overflow-hidden transition-all cursor-zoom-in ${
        isActive
          ? 'border-sky-500 ring-2 ring-sky-500/30 scale-[1.02]'
          : 'border-gray-700 hover:border-sky-500/40'
      }`}
    >
      <div className="aspect-video relative" style={{ backgroundColor: style.bgColor }}>
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

// ─── Slide Image Lightbox ───

const SlideLightbox: React.FC<{
  slides: SlideData[];
  initialIndex: number;
  onClose: () => void;
}> = ({ slides, initialIndex, onClose }) => {
  const slidesWithImages = React.useMemo(
    () => slides.map((s, i) => ({ slide: s, originalIdx: i })).filter(({ slide }) => !!slide.imageUrl),
    [slides],
  );
  const viewIdx = React.useMemo(
    () => Math.max(0, slidesWithImages.findIndex(({ originalIdx }) => originalIdx === initialIndex)),
    [slidesWithImages, initialIndex],
  );
  const [pos, setPos] = useState(viewIdx);

  useEffect(() => { setPos(viewIdx); }, [viewIdx]);

  const navigate = useCallback((dir: 1 | -1) => {
    setPos(prev => {
      const next = prev + dir;
      return next >= 0 && next < slidesWithImages.length ? next : prev;
    });
  }, [slidesWithImages.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, onClose]);

  if (slidesWithImages.length === 0) return null;
  const { slide } = slidesWithImages[pos] || slidesWithImages[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-gray-400 hover:text-white text-2xl z-10">&times;</button>

        <div className="rounded-2xl overflow-hidden bg-gray-900 border border-gray-700">
          <img src={slide.imageUrl!} alt={`Slide ${slide.slideNumber}`} className="w-full object-contain max-h-[70vh]" />
          <div className="p-4 space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-sky-600/30 text-sky-300 text-xs font-bold px-2 py-0.5 rounded">#{slide.slideNumber}</span>
              <h4 className="text-base font-bold text-white line-clamp-1">{slide.title}</h4>
            </div>
            <p className="text-sm text-gray-400 line-clamp-2">{slide.body}</p>
          </div>
        </div>

        {slidesWithImages.length > 1 && (
          <div className="flex justify-between items-center mt-3">
            <button
              onClick={() => navigate(-1)}
              disabled={pos === 0}
              className="px-4 py-2 rounded-lg bg-gray-800 text-white disabled:opacity-30 hover:bg-gray-700 transition-colors"
            >
              ← 이전
            </button>
            <span className="text-sm text-gray-500">{pos + 1} / {slidesWithImages.length}</span>
            <button
              onClick={() => navigate(1)}
              disabled={pos === slidesWithImages.length - 1}
              className="px-4 py-2 rounded-lg bg-gray-800 text-white disabled:opacity-30 hover:bg-gray-700 transition-colors"
            >
              다음 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Slide Preview Card ───

const SlidePreview: React.FC<{
  slide: SlideData;
  designStyle: DesignStyle;
  onRegenImage: (editInstruction?: string) => void;
  onImageClick?: () => void;
}> = ({ slide, designStyle, onRegenImage, onImageClick }) => {
  const [editText, setEditText] = useState('');
  const [showEdit, setShowEdit] = useState(false);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <div
        className={`aspect-video relative ${slide.imageUrl && !slide.isGeneratingImage ? 'cursor-zoom-in' : ''}`}
        style={{ backgroundColor: designStyle.bgColor }}
        onClick={() => { if (slide.imageUrl && !slide.isGeneratingImage && onImageClick) onImageClick(); }}
      >
        {slide.isGeneratingImage ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : slide.imageUrl ? (
          <>
            <img src={slide.imageUrl} alt={`Slide ${slide.slideNumber}`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
              <svg className="w-8 h-8 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
              </svg>
            </div>
          </>
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
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onRegenImage()}
            disabled={slide.isGeneratingImage}
            className="text-[10px] text-sky-400 hover:text-sky-300 border border-sky-500/30 hover:border-sky-500/50 px-2 py-1 rounded transition-colors disabled:opacity-30"
          >
            이미지 재생성
          </button>
          <button
            type="button"
            onClick={() => setShowEdit(!showEdit)}
            disabled={slide.isGeneratingImage}
            className="text-[10px] text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-500/50 px-2 py-1 rounded transition-colors disabled:opacity-30"
          >
            {showEdit ? '닫기' : '수정 요청'}
          </button>
        </div>
        {showEdit && (
          <div className="space-y-1.5 pt-1">
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="예: 배경을 파란색으로, 글씨를 더 크게"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editText.trim()) {
                  onRegenImage(editText.trim());
                  setEditText('');
                  setShowEdit(false);
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (editText.trim()) {
                  onRegenImage(editText.trim());
                  setEditText('');
                  setShowEdit(false);
                }
              }}
              disabled={!editText.trim() || slide.isGeneratingImage}
              className="w-full text-[10px] bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-2 py-1.5 rounded-lg font-bold transition-all disabled:opacity-30"
            >
              수정 반영하여 재생성
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───

export default function PptMasterTab() {
  const { requireAuth } = useAuthGuard();
  const config = useProjectStore((s) => s.config);
  const setConfig = useProjectStore((s) => s.setConfig);
  const addCost = useCostStore((s) => s.addCost);

  // ─── Zustand 스토어 (탭 전환 시 상태 유지) ───
  const {
    step, setStep,
    inputText, setInputText,
    selectedContentStyleId, setSelectedContentStyleId,
    selectedDesignStyleId, setSelectedDesignStyleId,
    detailLevel, setDetailLevel,
    slideCount, setSlideCount,
    slides, setSlides,
    previewMode, setPreviewMode,
    uploadedFileName, setUploadedFileName,
  } = usePptMasterStore();

  // Computed style objects from ID
  const selectedContentStyle = getSelectedContentStyle(selectedContentStyleId);
  const selectedDesignStyle = getSelectedDesignStyle(selectedDesignStyleId);

  // Wrapper setters for ContentStyle/DesignStyle (accept full object, store ID)
  const setSelectedContentStyle = useCallback((cs: ContentStyle) => setSelectedContentStyleId(cs.id), [setSelectedContentStyleId]);
  const setSelectedDesignStyle = useCallback((ds: DesignStyle) => setSelectedDesignStyleId(ds.id), [setSelectedDesignStyleId]);

  // Lightbox (UI-only, no need to persist)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [slideLightboxIdx, setSlideLightboxIdx] = useState<number | null>(null);

  // Generation state (transient, no persistence needed)
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [isBatchingImages, setIsBatchingImages] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  // File upload
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sample preview
  const [sampleImage, setSampleImage] = useState<string | null>(null);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const [genPhase, setGenPhase] = useState<GenPhase>('idle');

  const elapsed = useElapsedTimer(isGenerating);
  const elapsedBatch = useElapsedTimer(isBatchingImages);
  const elapsedSample = useElapsedTimer(isGeneratingSample);

  // ─── 프로젝트 로드 시 저장된 PPT 데이터 복원 ───
  const hasRestored = useRef(false);
  useEffect(() => {
    if (hasRestored.current || !config) return;
    if (config.pptSlides && config.pptSlides.length > 0) {
      setSlides(config.pptSlides.map(s => ({ ...s, isGeneratingImage: false })));
      if (config.pptContentStyleId) setSelectedContentStyleId(config.pptContentStyleId);
      if (config.pptDesignStyleId) setSelectedDesignStyleId(config.pptDesignStyleId);
      if (config.pptDetailLevel) setDetailLevel(config.pptDetailLevel as DetailLevel);
      if (config.pptSlideCount) setSlideCount(config.pptSlideCount);
      if (config.pptInputText) setInputText(config.pptInputText);
      setStep(4);
      hasRestored.current = true;
    }
  }, [config, setSlides, setSelectedContentStyleId, setSelectedDesignStyleId, setDetailLevel, setSlideCount, setInputText, setStep]);

  // ─── 슬라이드 변경 시 프로젝트 자동 저장 (디바운스) ───
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (slides.length === 0) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const cleanSlides = slides.map(({ isGeneratingImage, ...rest }) => rest);
      setConfig((prev) => prev ? {
        ...prev,
        pptSlides: cleanSlides,
        pptContentStyleId: selectedContentStyleId,
        pptDesignStyleId: selectedDesignStyleId,
        pptDetailLevel: detailLevel,
        pptSlideCount: slideCount,
        pptInputText: inputText,
      } : prev);
    }, 2000);
    return () => clearTimeout(saveTimerRef.current);
  }, [slides, selectedContentStyleId, selectedDesignStyleId, detailLevel, slideCount, inputText, setConfig]);

  const importScript = useCallback(() => {
    const script = config?.script;
    if (script?.trim()) {
      setInputText(script);
      showToast('프로젝트 대본을 가져왔습니다.');
    } else {
      showToast('프로젝트에 저장된 대본이 없습니다.');
    }
  }, [config, setInputText]);

  // ─── File Upload ───
  const handleFileUpload = useCallback((file: File) => {
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      showToast(`지원하지 않는 파일 형식입니다: ${ext}`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const raw = e.target?.result as string;
      if (raw) {
        setInputText(parseFileContent(raw, file.name));
        setUploadedFileName(file.name);
        showToast(`${file.name} 파일을 불러왔습니다.`);
      }
    };
    reader.onerror = () => showToast('파일 읽기 실패');
    reader.readAsText(file, 'utf-8');
  }, [setInputText, setUploadedFileName]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  // ─── Sample Preview ───
  const handleSamplePreview = useCallback(async () => {
    if (!requireAuth('샘플 미리보기')) return;
    if (!inputText.trim()) { showToast('내용을 먼저 입력하세요.'); return; }
    setIsGeneratingSample(true);
    setSampleImage(null);
    try {
      const snippet = inputText.slice(0, 100);
      const imageUrl = await generatePptSlideImage(
        selectedDesignStyle,
        selectedContentStyle,
        '샘플 미리보기',
        [snippet],
        'overview presentation intro slide',
      );
      addCost(PRICING.IMAGE_GENERATION, 'image');
      setSampleImage(imageUrl);
      showToast('샘플 미리보기가 생성되었습니다!');
    } catch (e) {
      logger.trackSwallowedError('PptMasterTab:samplePreview', e);
      showToast('샘플 미리보기 생성 실패');
    } finally {
      setIsGeneratingSample(false);
    }
  }, [requireAuth, inputText, selectedDesignStyle, selectedContentStyle, addCost]);

  useEffect(() => { setSampleImage(null); }, [selectedDesignStyle.id]);

  // ─── Helper: 이미지 생성 (Sliding Window 병렬 처리) ───
  const BATCH_CONCURRENCY = 20; // 동시 실행 상한 (스토리보드와 동일)
  const BATCH_FIRE_INTERVAL = 100; // 요청 간격 ms

  const generateImagesForRange = useCallback(async (
    slidesData: SlideData[],
    startIdx: number,
    endIdx: number,
  ) => {
    // 이미지 없는 슬라이드만 대상으로 큐 구성
    const queue: number[] = [];
    for (let i = startIdx; i < endIdx; i++) {
      if (slidesData[i] && !slidesData[i].imageUrl) queue.push(i);
    }
    if (queue.length === 0) return;

    const generateOne = async (idx: number): Promise<void> => {
      const slide = slidesData[idx];
      if (!slide) return;
      setSlides(prev => prev.map((s, i) => i === idx ? { ...s, isGeneratingImage: true } : s));
      try {
        const imageUrl = await generatePptSlideImage(
          selectedDesignStyle,
          selectedContentStyle,
          slide.title,
          slide.keyPoints,
          slide.visualHint,
        );
        addCost(PRICING.IMAGE_GENERATION, 'image');
        setSlides(prev => prev.map((s, i) => i === idx ? { ...s, imageUrl, isGeneratingImage: false } : s));
      } catch (e) {
        logger.trackSwallowedError('PptMasterTab:generateBatchImages', e);
        setSlides(prev => prev.map((s, i) => i === idx ? { ...s, isGeneratingImage: false } : s));
      }
      setBatchProgress(prev => ({ ...prev, current: prev.current + 1 }));
    };

    // Sliding Window: 최대 BATCH_CONCURRENCY개 동시 실행, 완료되면 즉시 다음 발사
    const pending = [...queue];
    const active: Promise<void>[] = [];

    while (pending.length > 0 || active.length > 0) {
      while (pending.length > 0 && active.length < BATCH_CONCURRENCY) {
        const idx = pending.shift()!;
        const p = generateOne(idx).finally(() => {
          const ai = active.indexOf(p);
          if (ai > -1) active.splice(ai, 1);
        });
        active.push(p);
        await new Promise(resolve => setTimeout(resolve, BATCH_FIRE_INTERVAL));
      }
      if (active.length > 0) await Promise.race(active);
    }
  }, [selectedDesignStyle, selectedContentStyle, addCost]);

  // ─── AI 슬라이드 생성 ───
  const CHUNK_THRESHOLD = 30; // 30장 이상이면 Flash 목차 + Pro 청크 파이프라인
  const CHUNK_SIZE = 10;
  const CHUNK_CONCURRENCY = 5;

  const handleGenerate = useCallback(async () => {
    if (!requireAuth('PPT 이미지 생성')) return;
    if (!inputText.trim()) return;
    setIsGenerating(true);
    setGenError('');
    setSlides([]);
    setPreviewMode(false);
    setGenPhase('idle');

    try {
      const systemPrompt = buildSlideGenerationPrompt(selectedContentStyle, detailLevel, slideCount);
      let finalSlides: SlideData[] = [];

      if (slideCount < CHUNK_THRESHOLD) {
        // ─── 기존 로직: 단일 요청 (30장 미만) ───
        setGenPhase('chunks');
        const userPrompt = `아래 텍스트를 분석하여 ${slideCount}장의 프레젠테이션 슬라이드로 재구성하세요.\n\n---\n${inputText}\n---`;
        const maxTokens = Math.min(65000, Math.max(16000, slideCount * 800));
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

        finalSlides = parsed.map((s, i) => ({
          ...s, slideNumber: i + 1, keyPoints: s.keyPoints || [], visualHint: s.visualHint || '',
        }));
        setSlides(finalSlides);
        addCost(PRICING.GEMINI_PRO_INPUT_PER_1M * 0.002, 'analysis');

      } else {
        // ─── 청크 파이프라인: Flash Lite 목차 → Pro 청크 (30장 이상) ───

        // Phase 1: Flash Lite로 전체 목차 생성
        setGenPhase('toc');
        const tocRes = await evolinkChat([
          { role: 'system', content: '프레젠테이션 구조 설계 전문가. 주어진 텍스트를 분석하여 슬라이드 목차를 설계한다. 반드시 JSON 배열로 반환. 마크다운 없이 순수 JSON만 출력.' },
          { role: 'user', content: `아래 텍스트를 ${slideCount}장 프레젠테이션 슬라이드의 목차로 설계하세요.\n\n각 슬라이드: {"slideNumber":N,"title":"슬라이드 제목","section":"섹션명","keyTopic":"핵심 주제 한 줄"}\n\n규칙:\n- 반드시 ${slideCount}개 항목\n- 논리적 섹션으로 그룹핑\n- 각 주제를 세분화하여 ${slideCount}장을 채울 것\n- 첫 번째 슬라이드는 타이틀, 마지막은 요약/CTA\n\n텍스트:\n${inputText}` },
        ], { temperature: 0.5, maxTokens: Math.min(40000, slideCount * 200), model: 'gemini-3.1-flash-lite-preview', responseFormat: { type: 'json_object' } });

        const tocRaw = tocRes.choices?.[0]?.message?.content || '';
        const tocJsonStr = extractJsonFromText(tocRaw);
        if (!tocJsonStr) throw new Error('목차 생성 실패: JSON을 추출할 수 없습니다.');
        let tocParsed = JSON.parse(tocJsonStr);
        // 응답이 {slides:[...]} 형태일 수 있음
        if (!Array.isArray(tocParsed) && typeof tocParsed === 'object') {
          const arrVal = Object.values(tocParsed).find(v => Array.isArray(v));
          if (arrVal) tocParsed = arrVal;
        }
        if (!Array.isArray(tocParsed) || tocParsed.length === 0) throw new Error('목차 데이터가 비어있습니다.');

        addCost(PRICING.GEMINI_PRO_INPUT_PER_1M * 0.001, 'analysis'); // Flash Lite 비용 (Pro 대비 저렴)

        // Phase 2: Pro가 청크별 상세 생성
        setGenPhase('chunks');
        const totalChunks = Math.ceil(tocParsed.length / CHUNK_SIZE);
        setBatchProgress({ current: 0, total: totalChunks });

        const allSlides: SlideData[] = [];

        const processChunk = async (chunkIdx: number): Promise<SlideData[]> => {
          const startIdx = chunkIdx * CHUNK_SIZE;
          const chunkToc = tocParsed.slice(startIdx, startIdx + CHUNK_SIZE);
          const tocText = chunkToc.map((t: { slideNumber?: number; title?: string; section?: string; keyTopic?: string }, i: number) =>
            `${startIdx + i + 1}. [${t.section || ''}] ${t.title || ''} — ${t.keyTopic || ''}`
          ).join('\n');

          const chunkMessages: EvolinkChatMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `아래 목차의 슬라이드 ${startIdx + 1}~${startIdx + chunkToc.length}번에 대해 상세 내용을 생성하세요.\n\n[목차]\n${tocText}\n\n[원본 텍스트 참조]\n${inputText}\n\n반드시 ${chunkToc.length}개 슬라이드를 생성하세요. JSON 배열만 반환.` },
          ];

          const maxTokens = chunkToc.length * 800;
          const res = await evolinkChat(chunkMessages, { temperature: 0.7, maxTokens });
          const raw = res.choices?.[0]?.message?.content || '';
          const jsonStr = extractJsonFromText(raw);
          if (!jsonStr) throw new Error(`청크 ${chunkIdx + 1} JSON 추출 실패`);

          const parsed: SlideData[] = JSON.parse(jsonStr);
          if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`청크 ${chunkIdx + 1} 빈 응답`);
          return parsed;
        };

        // 재시도 래퍼 (1회 재시도, 3초 대기) — 네트워크 에러 방어
        let failedChunks = 0;
        const processChunkWithRetry = async (chunkIdx: number): Promise<SlideData[]> => {
          try {
            return await processChunk(chunkIdx);
          } catch (firstErr) {
            await new Promise(r => setTimeout(r, 3000));
            try {
              return await processChunk(chunkIdx);
            } catch {
              logger.trackSwallowedError('PptMasterTab:processChunk:retry', firstErr);
              failedChunks++;
              return [];
            }
          }
        };

        // 병렬 배치 처리 (CHUNK_CONCURRENCY개씩)
        let completedChunks = 0;
        for (let batchStart = 0; batchStart < totalChunks; batchStart += CHUNK_CONCURRENCY) {
          const batchEnd = Math.min(batchStart + CHUNK_CONCURRENCY, totalChunks);
          const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i);

          const batchResults = await Promise.all(batchIndices.map(ci => processChunkWithRetry(ci)));
          for (const result of batchResults) allSlides.push(...result);

          completedChunks += batchIndices.length;
          setBatchProgress({ current: completedChunks, total: totalChunks });

          // 프로그레시브 렌더링: 청크 완료될 때마다 즉시 화면에 표시
          if (allSlides.length > 0) {
            setSlides(allSlides.map((s, i) => ({
              ...s, slideNumber: i + 1, keyPoints: s.keyPoints || [], visualHint: s.visualHint || '',
            })));
            if (step !== 4) setStep(4);
          }

          // 배치 간 쿨다운 (429 방지)
          if (batchEnd < totalChunks) await new Promise(r => setTimeout(r, 1000));
        }

        if (allSlides.length === 0) throw new Error('모든 슬라이드 생성에 실패했습니다. 네트워크 연결을 확인하고 다시 시도해주세요.');
        if (failedChunks > 0) showToast(`⚠️ 일부 구간(${failedChunks}개)이 네트워크 문제로 실패했어요. ${allSlides.length}장만 생성되었습니다.`);

        addCost(PRICING.GEMINI_PRO_INPUT_PER_1M * 0.002 * (totalChunks - failedChunks), 'analysis');

        finalSlides = allSlides.map((s, i) => ({
          ...s, slideNumber: i + 1, keyPoints: s.keyPoints || [], visualHint: s.visualHint || '',
        }));
        setSlides(finalSlides);
      }

      // 공통: 결과 표시 + 미리보기 이미지 자동 생성
      if (step !== 4) setStep(4);
      if (slideCount > 10) {
        setPreviewMode(true);
        setGenPhase('preview');
        const previewCount = Math.min(2, finalSlides.length);
        await generateImagesForRange(finalSlides, 0, previewCount);
        showToast(`미리보기 ${previewCount}장 이미지 생성 완료!`);
      } else {
        showToast(`슬라이드 생성 완료!`);
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '슬라이드 생성 실패';
      const msg = raw.toLowerCase().includes('failed to fetch') || raw.toLowerCase().includes('network')
        ? '네트워크 연결이 끊어졌어요. 브라우저 탭을 닫지 말고 다시 시도해주세요. (장수를 줄이면 성공 확률이 올라요!)'
        : raw;
      setGenError(msg);
    } finally {
      setIsGenerating(false);
      setGenPhase('idle');
      setBatchProgress({ current: 0, total: 0 });
    }
  }, [requireAuth, inputText, selectedContentStyle, detailLevel, slideCount, addCost, generateImagesForRange, step]);

  // ─── 이미지 일괄 생성 ───
  const handleBatchImages = useCallback(async () => {
    if (!requireAuth('PPT 일괄 생성')) return;
    if (slides.length === 0) return;
    setIsBatchingImages(true);
    setPreviewMode(false);

    const startIdx = slides.findIndex(s => !s.imageUrl && !s.isGeneratingImage);
    const remaining = slides.filter(s => !s.imageUrl).length;
    setBatchProgress({ current: 0, total: remaining });

    await generateImagesForRange(slides, startIdx >= 0 ? startIdx : 0, slides.length);

    setIsBatchingImages(false);
    showToast('슬라이드 이미지 생성 완료!');
  }, [requireAuth, slides, generateImagesForRange]);

  // ─── 개별 이미지 재생성 (수정 지시 지원) ───
  const handleRegenImage = useCallback(async (index: number, editInstruction?: string) => {
    const slide = slides[index];
    if (!slide) return;

    setSlides(prev => prev.map((s, i) => i === index ? { ...s, isGeneratingImage: true } : s));
    try {
      const imageUrl = await generatePptSlideImage(
        selectedDesignStyle,
        selectedContentStyle,
        slide.title,
        slide.keyPoints,
        slide.visualHint,
        editInstruction,
      );
      addCost(PRICING.IMAGE_GENERATION, 'image');
      setSlides(prev => prev.map((s, i) => i === index ? { ...s, imageUrl, isGeneratingImage: false } : s));
    } catch (e) {
      logger.trackSwallowedError('PptMasterTab:regenerateSlideImage', e);
      setSlides(prev => prev.map((s, i) => i === index ? { ...s, isGeneratingImage: false } : s));
      showToast('이미지 생성 실패');
    }
  }, [slides, selectedDesignStyle, selectedContentStyle, addCost]);

  // ─── PPTX 내보내기 (정적 import로 동적 모듈 로드 에러 해결) ───
  const handleExportPptx = useCallback(async () => {
    if (!requireAuth('PPTX 내보내기')) return;
    try {
      const pptx = new pptxgenjs();
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
          fontSize: 28, bold: true, color: 'FFFFFF', fontFace: 'Malgun Gothic',
        });

        s.addText(slide.body, {
          x: 0.5, y: 1.5, w: 9, h: 3.5,
          fontSize: 16, color: 'E0E0E0', fontFace: 'Malgun Gothic', lineSpacingMultiple: 1.4,
        });

        if (slide.keyPoints.length > 0) {
          s.addText(slide.keyPoints.map(kp => `  ${kp}`).join('\n'), {
            x: 0.5, y: 5.2, w: 9, h: 1.5,
            fontSize: 14, color: selectedDesignStyle.accentColor.replace('#', ''),
            fontFace: 'Malgun Gothic', bold: true,
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
  }, [requireAuth, slides, selectedDesignStyle, selectedContentStyle]);

  // ─── HTML 내보내기 ───
  const handleExportHtml = useCallback(() => {
    const htmlSlides = slides.map((slide, i) => {
      const imgTag = slide.imageUrl
        ? `<img src="${slide.imageUrl}" style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;" />`
        : '';
      const kpHtml = slide.keyPoints.length > 0
        ? `<ul style="list-style:none;padding:0;margin:16px 0 0;">${slide.keyPoints.map(kp => `<li style="color:${selectedDesignStyle.accentColor};font-size:14px;font-weight:bold;margin:4px 0;">• ${kp}</li>`).join('')}</ul>`
        : '';
      return `
      <div class="slide" style="page-break-after:always;position:relative;width:960px;height:540px;margin:20px auto;background:${selectedDesignStyle.bgColor};border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.3);">
        ${imgTag}
        <div style="position:relative;z-index:1;padding:40px;${slide.imageUrl ? 'background:rgba(0,0,0,0.5);height:100%;box-sizing:border-box;' : ''}">
          <div style="font-size:10px;color:#888;margin-bottom:8px;">#${i + 1}</div>
          <h2 style="font-size:28px;font-weight:bold;color:#fff;margin:0 0 16px;">${slide.title}</h2>
          <p style="font-size:16px;color:#e0e0e0;line-height:1.6;white-space:pre-wrap;">${slide.body}</p>
          ${kpHtml}
        </div>
      </div>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>PPT 마스터 — ${selectedContentStyle.label} × ${selectedDesignStyle.label}</title>
<style>
  body { background:#111;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;padding:40px 0; }
  @media print { body { background:#fff; } .slide { box-shadow:none!important;margin:0 auto!important; } }
</style>
</head>
<body>
<h1 style="text-align:center;color:#fff;font-size:24px;margin-bottom:32px;">
  ${selectedContentStyle.icon} ${selectedContentStyle.label} × ${selectedDesignStyle.label} (${slides.length}장)
</h1>
${htmlSlides}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PPT_${selectedContentStyle.label}_${selectedDesignStyle.label}_${slides.length}slides.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('HTML 파일 다운로드 완료!');
  }, [slides, selectedDesignStyle, selectedContentStyle]);

  // ─── 전체 이미지 ZIP 다운로드 ───
  const handleDownloadAllImages = useCallback(async () => {
    const slidesWithImg = slides.filter(s => s.imageUrl);
    if (slidesWithImg.length === 0) {
      showToast('다운로드할 이미지가 없습니다.');
      return;
    }

    try {
      const zip = new JSZip();
      for (const slide of slidesWithImg) {
        if (!slide.imageUrl) continue;
        let data: Blob;
        if (slide.imageUrl.startsWith('data:')) {
          const resp = await fetch(slide.imageUrl);
          data = await resp.blob();
        } else {
          const resp = await fetch(slide.imageUrl);
          data = await resp.blob();
        }
        const ext = slide.imageUrl.startsWith('data:image/png') ? 'png' : 'jpg';
        zip.file(`slide_${String(slide.slideNumber).padStart(3, '0')}.${ext}`, data);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PPT_images_${slides.length}slides.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`${slidesWithImg.length}장의 이미지를 ZIP으로 다운로드했습니다!`);
    } catch (err) {
      logger.trackSwallowedError('PptMasterTab:downloadAllImages', err);
      showToast('이미지 다운로드 실패');
    }
  }, [slides]);

  // ─── Render ───

  const canGenerate = inputText.trim().length > 0 && slideCount >= 3 && slideCount <= 150;
  const remainingImages = slides.filter(s => !s.imageUrl && !s.isGeneratingImage).length;

  return (
    <div className="animate-fade-in max-w-6xl mx-auto pt-6">
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

      {/* ━━ Generation Progress Panel ━━ */}
      {isGenerating && (
        <div className="bg-gradient-to-br from-sky-900/20 to-indigo-900/20 border border-sky-500/30 rounded-2xl p-5 mb-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex-shrink-0 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-sky-300">
                {genPhase === 'toc' && `📋 슬라이드 목차 설계 중 (${slideCount}장)`}
                {genPhase === 'chunks' && (batchProgress.total > 0
                  ? `✍️ 슬라이드 상세 작성 중 (${batchProgress.current}/${batchProgress.total} 구간)`
                  : `✍️ 슬라이드 생성 중 (${slideCount}장)`)}
                {genPhase === 'preview' && '🎨 미리보기 이미지 생성 중...'}
                {genPhase === 'idle' && '⏳ 준비 중...'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {formatElapsed(elapsed)} 경과
                {slides.length > 0 && <span className="ml-2 text-sky-400/70">• {slides.length}장 완성</span>}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {batchProgress.total > 0 && (
            <div className="space-y-1">
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${Math.max(2, (batchProgress.current / batchProgress.total) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>{batchProgress.current}/{batchProgress.total} 구간 완료</span>
                <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
              </div>
            </div>
          )}

          {/* Rotating Tip */}
          <div className="text-xs text-gray-500 italic">
            {PROGRESS_TIPS[Math.floor(elapsed / 8) % PROGRESS_TIPS.length]}
          </div>
        </div>
      )}

      {/* ━━ Step 1: Content Input ━━ */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-200">내용 입력</h3>
            <button onClick={importScript} className="text-xs text-sky-400 hover:text-sky-300 border border-sky-500/30 px-3 py-1.5 rounded-lg transition-colors">
              프로젝트 대본 가져오기
            </button>
          </div>

          {/* File Upload Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
              isDragOver ? 'border-sky-500 bg-sky-500/10' : 'border-gray-700 hover:border-sky-500/40 bg-gray-900/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_ACCEPT}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }}
            />
            <div className="text-2xl mb-1.5">📎</div>
            <div className="text-sm text-gray-300 font-medium">파일을 드래그하거나 클릭하여 업로드</div>
            <div className="text-xs text-gray-500 mt-1">.md .txt .csv .json .html .xml .rtf .yaml .log</div>
            {uploadedFileName && (
              <div className="mt-2 inline-flex items-center gap-1.5 bg-sky-900/30 text-sky-300 border border-sky-500/30 px-3 py-1 rounded-full text-xs">
                📄 {uploadedFileName}
              </div>
            )}
          </div>

          <div className="text-xs text-gray-600 text-center">또는 직접 입력</div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={10}
            placeholder="프레젠테이션으로 변환할 내용을 입력하세요. 보고서, 기획안, 에세이, 대본, 마크다운 등 어떤 형식이든 가능합니다."
            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-sky-500/50 resize-none"
          />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {inputText.length.toLocaleString()}자
              {uploadedFileName && <span className="ml-1 text-sky-400/60">({uploadedFileName})</span>}
            </span>
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
                onZoom={() => setLightboxIdx(idx)}
              />
            ))}
          </div>

          {/* Sample Preview */}
          <div className="pt-4 border-t border-gray-700/50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-bold text-gray-300">샘플 미리보기</h4>
                <p className="text-xs text-gray-500 mt-0.5">선택한 디자인 스타일로 슬라이드 이미지 1컷을 미리 확인합니다.</p>
              </div>
              <button
                type="button"
                onClick={handleSamplePreview}
                disabled={isGeneratingSample || !inputText.trim()}
                className="text-xs bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white px-4 py-2 rounded-lg font-bold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isGeneratingSample ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    생성 중...{elapsedSample > 0 && <span className="text-sky-200 tabular-nums ml-1">{formatElapsed(elapsedSample)}</span>}
                  </>
                ) : '샘플 생성하기'}
              </button>
            </div>
            {sampleImage ? (
              <div className="rounded-xl overflow-hidden border border-gray-700 max-w-md">
                <img src={sampleImage} alt="샘플 미리보기" className="w-full aspect-video object-cover" />
                <div className="bg-gray-800/50 px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                  {selectedDesignStyle.label} 스타일 미리보기
                </div>
              </div>
            ) : !inputText.trim() ? (
              <div className="rounded-xl border border-gray-700/50 bg-gray-800/20 p-5 text-center text-sm text-gray-600">
                Step 1에서 내용을 입력하면 샘플 미리보기를 생성할 수 있습니다.
              </div>
            ) : null}
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
              <div className="text-gray-500">입력 내용</div>
              <div className={`font-medium ${inputText.trim() ? 'text-sky-300' : 'text-amber-400'}`}>
                {inputText.trim() ? `${inputText.length.toLocaleString()}자${uploadedFileName ? ` (${uploadedFileName})` : ''}` : '미입력 — Step 1에서 입력하세요'}
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
              <div className="flex items-center gap-2 flex-wrap">
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
                <button
                  type="button"
                  onClick={handleExportHtml}
                  className="text-xs bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white px-3 py-1.5 rounded-lg font-bold transition-all"
                >
                  HTML 저장
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAllImages}
                  disabled={slides.filter(s => s.imageUrl).length === 0}
                  className="text-xs bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-3 py-1.5 rounded-lg font-bold transition-all disabled:opacity-50"
                >
                  전체 이미지 저장
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
                onRegenImage={(editInstruction?: string) => handleRegenImage(i, editInstruction)}
                onImageClick={() => setSlideLightboxIdx(i)}
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

      {/* Slide Image Lightbox */}
      {slideLightboxIdx !== null && (
        <SlideLightbox
          slides={slides}
          initialIndex={slideLightboxIdx}
          onClose={() => setSlideLightboxIdx(null)}
        />
      )}
    </div>
  );
}
