
import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { Thumbnail, VideoFormat } from '../../types';
import { analyzeScriptContext } from '../../services/geminiService';
import { useCostStore } from '../../stores/costStore';
import { useUIStore, showToast } from '../../stores/uiStore';
import { getGeminiKey } from '../../services/apiService';
import { useScriptWriterStore } from '../../stores/scriptWriterStore';
import { useProjectStore } from '../../stores/projectStore';
import { useImageVideoStore } from '../../stores/imageVideoStore';
import { compressImageUnderSize } from '../../utils/fileHelpers';
import SetupPanel, { SetupState } from './thumbnail/SetupPanel';
import { logger } from '../../services/LoggerService';
import { lazyRetry } from '../../utils/retryImport';

const ThumbnailGenerator = lazyRetry(() => import('../ThumbnailGenerator'));

interface AnalyzedContext {
  lang?: string;
  langName?: string;
  locale?: string;
  nuance?: string;
  globalContext?: string;
}

const ThumbnailStudioTab: React.FC = () => {
  const addCost = useCostStore((s) => s.addCost);

  // 이미지/영상 탭 스타일 & 캐릭터 연동
  const ivStyle = useImageVideoStore((s) => s.style);
  const ivCharacters = useImageVideoStore((s) => s.characters);

  // Setup form state
  const [setup, setSetup] = useState<SetupState>({
    mode: 'random',
    script: '',
    videoFormat: 'long',
    atmosphere: '',
    charDescription: '',
    youtubeUrl: '',
    textMode: 'auto',
    customText: '',
  });

  // Collapsible setup panel
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Analyzed context (populated on first generation)
  const [analyzedCtx, setAnalyzedCtx] = useState<AnalyzedContext>({});
  // [FIX #173] projectStore 연동 — 썸네일이 프로젝트와 함께 저장되도록
  const storeThumbnails = useProjectStore((s) => s.thumbnails);
  const storeSetThumbnails = useProjectStore((s) => s.setThumbnails);
  const thumbnails = storeThumbnails;
  const setThumbnails = storeSetThumbnails;

  // Reference analysis state
  const [isYtFetching, setIsYtFetching] = useState(false);
  const [ytFetchFailed, setYtFetchFailed] = useState(false);
  const [isRefAnalyzing, setIsRefAnalyzing] = useState(false);
  const [refAnalysis, setRefAnalysis] = useState<string | undefined>();

  // Character analysis state
  const [isCharAnalyzing, setIsCharAnalyzing] = useState(false);
  const [charAnalysis, setCharAnalysis] = useState<string | undefined>();

  // Auto-fill script from scriptWriterStore / projectStore
  const autoFinalScript = useScriptWriterStore((s) => s.finalScript);
  const autoScenes = useProjectStore((s) => s.scenes);

  useEffect(() => {
    if (setup.script.trim().length > 0) return;

    const scriptText = autoFinalScript?.trim()
      ? autoFinalScript
      : autoScenes.map((s) => s.scriptText || '').filter(Boolean).join('\n');

    if (scriptText.trim()) {
      setSetup((prev) => ({ ...prev, script: scriptText }));
    }
  }, [autoFinalScript, autoScenes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 이미지/영상 탭 스타일 & 캐릭터 자동 연동 (마운트 시 1회, 기존 수동 입력 없을 때만)
  const ivSyncedRef = React.useRef(false);
  useEffect(() => {
    if (ivSyncedRef.current) return;
    ivSyncedRef.current = true;
    setSetup(prev => {
      const updates: Partial<SetupState> = {};
      if (ivStyle && ivStyle !== 'custom' && !prev.atmosphere) {
        updates.atmosphere = ivStyle;
      }
      if (ivCharacters.length > 0 && !prev.charImageBase64) {
        const c = ivCharacters[0];
        if (c.imageBase64 || c.imageUrl) updates.charImageBase64 = c.imageBase64 || c.imageUrl;
        if (c.analysisCharacter || c.analysisResult) updates.charDescription = c.analysisCharacter || c.analysisResult || '';
      }
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // onBeforeGenerate: called by ThumbnailGenerator before starting generation
  const handleBeforeGenerate = useCallback(async () => {
    if (!getGeminiKey()) {
      showToast('API Key가 필요합니다. 좌측 메뉴 → API 설정에서 키를 입력해주세요.', 5000);
      throw new Error('API Key required');
    }

    // Analyze script context if script is present and not yet analyzed
    if (setup.script.trim() && !analyzedCtx.lang) {
      try {
        const ctx = await analyzeScriptContext(setup.script, (c) => addCost(c, 'analysis'));
        setAnalyzedCtx({
          lang: ctx.detectedLanguage,
          langName: ctx.detectedLanguageName,
          locale: ctx.detectedLocale,
          nuance: ctx.culturalNuance,
          globalContext: ctx.globalContext,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '알 수 없는 오류';
        showToast(`분석 실패: ${msg}`, 4000);
        throw e;
      }
    }

    // Auto-collapse setup panel on first generation
    setIsCollapsed(true);
  }, [setup.script, analyzedCtx.lang, addCost]);

  // Save dropdown
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement>(null);

  const readyThumbnails = thumbnails.filter((t) => !!t.imageUrl);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) {
        setShowSaveMenu(false);
      }
    };
    if (showSaveMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSaveMenu]);

  const downloadBlob = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  const handleSaveOriginal = async () => {
    setShowSaveMenu(false);
    setIsSaving(true);
    try {
      for (let i = 0; i < readyThumbnails.length; i++) {
        const t = readyThumbnails[i];
        const res = await fetch(t.imageUrl!);
        const blob = await res.blob();
        const ext = blob.type.includes('png') ? 'png' : 'jpg';
        downloadBlob(blob, `thumbnail_${String(i + 1).padStart(2, '0')}.${ext}`);
      }
      showToast(`원본 ${readyThumbnails.length}장 저장 완료`, 3000);
    } catch (e) {
      logger.trackSwallowedError('ThumbnailStudioTab:handleSaveOriginal', e);
      showToast('저장 중 오류가 발생했습니다', 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCompressed = async () => {
    setShowSaveMenu(false);
    setIsSaving(true);
    const MAX_BYTES = 2 * 1024 * 1024;
    try {
      for (let i = 0; i < readyThumbnails.length; i++) {
        const t = readyThumbnails[i];
        const name = `thumbnail_${String(i + 1).padStart(2, '0')}_upload.jpg`;
        const blob = await compressImageUnderSize(t.imageUrl!, MAX_BYTES, name);
        downloadBlob(blob, name);
      }
      showToast(`업로드용 ${readyThumbnails.length}장 저장 완료 (2MB 이하)`, 3000);
    } catch (e) {
      logger.trackSwallowedError('ThumbnailStudioTab:handleSaveCompressed', e);
      showToast('압축 저장 중 오류가 발생했습니다', 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const vf = setup.videoFormat === 'long' ? VideoFormat.LONG : VideoFormat.SHORT;

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">&#128444;&#65039;</span>
        <div>
          <h1 className="text-3xl font-bold text-white">썸네일 스튜디오</h1>
          <p className="text-base text-gray-400">프로젝트 없이 바로 바이럴 썸네일을 생성합니다</p>
        </div>
        <span className="ml-auto text-sm font-bold px-2 py-1 rounded bg-gray-700/50 text-gray-300 border border-gray-500/50">도구모음</span>
        {setup.mode === 'reference' && isCollapsed && (
          <span className="text-sm font-bold px-2 py-1 rounded bg-blue-900/30 text-blue-300 border border-blue-500/50">레퍼런스 카피</span>
        )}
        {/* 저장하기 버튼 */}
        <div className="relative" ref={saveMenuRef}>
          <button
            onClick={() => setShowSaveMenu((p) => !p)}
            disabled={readyThumbnails.length === 0 || isSaving}
            className={`flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded transition-all ${
              readyThumbnails.length > 0 && !isSaving
                ? 'bg-pink-600/20 text-pink-400 border border-pink-500/30 hover:bg-pink-600/30'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed border border-gray-600'
            }`}
          >
            {isSaving ? (
              <span className="inline-block w-4 h-4 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>&#128190;</span>
            )}
            저장하기 ▾
          </button>
          {showSaveMenu && readyThumbnails.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 overflow-hidden">
              <button
                onClick={handleSaveOriginal}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors text-left"
              >
                <span>&#128229;</span>
                <div>
                  <div className="font-medium">원본 저장</div>
                  <div className="text-xs text-gray-400">{readyThumbnails.length}장 · 원본 해상도</div>
                </div>
              </button>
              <div className="border-t border-gray-700" />
              <button
                onClick={handleSaveCompressed}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors text-left"
              >
                <span>&#128230;</span>
                <div>
                  <div className="font-medium">업로드용 저장</div>
                  <div className="text-xs text-gray-400">{readyThumbnails.length}장 · 2MB 이하 JPEG</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Setup Panel (collapsible) */}
      <SetupPanel
        setup={setup}
        setSetup={setSetup}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(prev => !prev)}
        isYtFetching={isYtFetching}
        ytFetchFailed={ytFetchFailed}
        isRefAnalyzing={isRefAnalyzing}
        refAnalysis={refAnalysis}
        onSetYtFetching={setIsYtFetching}
        onSetYtFetchFailed={setYtFetchFailed}
        onSetRefAnalyzing={setIsRefAnalyzing}
        onSetRefAnalysis={setRefAnalysis}
        isCharAnalyzing={isCharAnalyzing}
        charAnalysis={charAnalysis}
        onSetCharAnalyzing={setIsCharAnalyzing}
        onSetCharAnalysis={setCharAnalysis}
        syncedFromImageVideo={!!(ivStyle && ivStyle !== 'custom' && setup.atmosphere === ivStyle)}
      />

      {/* ThumbnailGenerator (always visible) */}
      <Suspense fallback={
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-t-pink-400 border-pink-500" />
          <span className="ml-3 text-gray-400 text-base">썸네일 스튜디오 로딩 중...</span>
        </div>
      }>
        <ThumbnailGenerator
          script={setup.script}
          styleDescription={setup.atmosphere || 'Cinematic'}
          characterImageBase64={setup.charImageBase64}
          characterDescription={setup.charDescription || undefined}
          thumbnails={thumbnails}
          setThumbnails={setThumbnails}
          videoFormat={vf}
          onImageClick={(url: string) => useUIStore.getState().openLightbox(url)}
          onCostAdd={addCost}
          textMode={setup.textMode}
          customText={setup.customText}
          languageContext={{
            lang: analyzedCtx.lang,
            langName: analyzedCtx.langName,
            locale: analyzedCtx.locale,
            nuance: analyzedCtx.nuance,
          }}
          globalContext={analyzedCtx.globalContext}
          initialReferenceImage={setup.mode === 'reference' ? (setup.referenceImageBase64 || setup.youtubeThumbnail) : undefined}
          initialExtractedStyle={setup.mode === 'reference' ? refAnalysis : undefined}
          hideReferenceArea
          onBeforeGenerate={handleBeforeGenerate}
        />
      </Suspense>
    </div>
  );
};

export default ThumbnailStudioTab;
