import React, { useState, useCallback } from 'react';
import { useShoppingShortStore } from '../../../stores/shoppingShortStore';
import { generateShoppingScripts } from '../../../services/shoppingScriptService';
import VoiceFontPicker from './VoiceFontPicker';
import { showToast } from '../../../stores/uiStore';
import type { SubtitleRemovalMethod } from '../../../types';

const SUBTITLE_REMOVAL_OPTIONS: { id: SubtitleRemovalMethod; label: string; desc: string; icon: string }[] = [
  { id: 'propainter', label: 'AI 제거', desc: 'ProPainter로 자막 영역 복원', icon: '🤖' },
  { id: 'none', label: '없음', desc: '원본 유지 (자막 제거 안 함)', icon: '📋' },
];

const ScriptSelectStep: React.FC = () => {
  const {
    sourceVideo,
    productAnalysis, setProductAnalysis,
    narrationText,
    generatedScripts, setGeneratedScripts,
    selectedScriptId, setSelectedScriptId,
    subtitleRemovalMethod, setSubtitleRemovalMethod,
    ttsVoiceId, ttsEngine,
    ctaPreset,
    isGeneratingScripts, setIsGeneratingScripts,
    goToStep,
  } = useShoppingShortStore();

  const selectedScript = generatedScripts.find(s => s.id === selectedScriptId);
  const [isEditingPreset, setIsEditingPreset] = useState(false);

  // 프리셋 편집용 로컬 상태
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editFeatures, setEditFeatures] = useState('');
  const [editAppeals, setEditAppeals] = useState('');

  const startEditPreset = useCallback(() => {
    if (!productAnalysis) return;
    setEditName(productAnalysis.productName);
    setEditCategory(productAnalysis.category);
    setEditTarget(productAnalysis.targetAudience);
    setEditFeatures(productAnalysis.keyFeatures.join(', '));
    setEditAppeals(productAnalysis.appealPoints.join(', '));
    setIsEditingPreset(true);
  }, [productAnalysis]);

  const savePresetEdits = useCallback(() => {
    setProductAnalysis({
      productName: editName,
      category: editCategory,
      targetAudience: editTarget,
      keyFeatures: editFeatures.split(',').map(s => s.trim()).filter(Boolean),
      appealPoints: editAppeals.split(',').map(s => s.trim()).filter(Boolean),
    });
    setIsEditingPreset(false);
    showToast('프리셋 수정 완료');
  }, [editName, editCategory, editTarget, editFeatures, editAppeals, setProductAnalysis]);

  // 프리셋 기반 대본 재생성
  const handleRegenerateScripts = useCallback(async () => {
    if (!productAnalysis || !sourceVideo) return;
    setIsGeneratingScripts(true);
    try {
      const duration = sourceVideo.duration || 30;
      const scripts = await generateShoppingScripts(productAnalysis, duration, ctaPreset, narrationText);
      setGeneratedScripts(scripts);
      if (scripts.length > 0) setSelectedScriptId(scripts[0].id);
      showToast('대본 재생성 완료!');
    } catch (e) {
      showToast(`대본 생성 실패: ${(e as Error).message}`);
    } finally {
      setIsGeneratingScripts(false);
    }
  }, [productAnalysis, sourceVideo, ctaPreset, narrationText, setIsGeneratingScripts, setGeneratedScripts, setSelectedScriptId]);

  const handleStartRender = useCallback(() => {
    if (!selectedScriptId) {
      showToast('대본을 선택해주세요.');
      return;
    }
    if (ttsEngine === 'typecast' && !ttsVoiceId) {
      showToast('보이스를 선택해주세요.');
      return;
    }
    goToStep('render');
  }, [selectedScriptId, ttsVoiceId, ttsEngine, goToStep]);

  return (
    <div className="space-y-6">
      {/* 뒤로 버튼 */}
      <button
        onClick={() => goToStep('source')}
        className="text-gray-400 hover:text-gray-200 text-sm flex items-center gap-1 transition-colors"
      >
        ← 소스 입력으로
      </button>

      {/* ═══ 프리셋 섹션 ═══ */}
      <div className="bg-gray-800/40 rounded-2xl p-6 border border-lime-500/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-lime-600/20 flex items-center justify-center text-lg">🎯</div>
            <div>
              <h3 className="text-lg font-bold text-lime-300">프리셋</h3>
              <p className="text-xs text-gray-500">v31.0 동적 타겟팅 기반 상품 프리셋</p>
            </div>
          </div>
          {productAnalysis && !isEditingPreset && (
            <button
              onClick={startEditPreset}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-700/60 text-gray-300 hover:bg-gray-600/60 border border-gray-600/40 transition-all"
            >
              수정
            </button>
          )}
          {isEditingPreset && (
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditingPreset(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-700/60 text-gray-400 hover:bg-gray-600/60 border border-gray-600/40 transition-all"
              >
                취소
              </button>
              <button
                onClick={savePresetEdits}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-lime-600/20 text-lime-300 hover:bg-lime-600/30 border border-lime-500/40 transition-all"
              >
                저장
              </button>
            </div>
          )}
        </div>

        {!productAnalysis ? (
          /* 프리셋 없음 — 빈 상태 */
          <div className="text-center py-8 border border-dashed border-gray-600/40 rounded-xl">
            <div className="text-3xl mb-3">📋</div>
            <p className="text-gray-400 font-semibold">프리셋이 아직 생성되지 않았습니다</p>
            <p className="text-gray-500 text-sm mt-1">소스 입력에서 영상을 업로드하고 "분석 시작"을 클릭하세요</p>
            <button
              onClick={() => goToStep('source')}
              className="mt-4 px-5 py-2 rounded-lg text-sm font-bold bg-lime-600/20 text-lime-300 hover:bg-lime-600/30 border border-lime-500/40 transition-all"
            >
              소스 입력으로 이동
            </button>
          </div>
        ) : isEditingPreset ? (
          /* 프리셋 편집 모드 */
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">상품명</label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-lime-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">카테고리</label>
                <input
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-lime-500/50"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">최적 타겟</label>
              <input
                value={editTarget}
                onChange={e => setEditTarget(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-lime-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">핵심 기능 (쉼표로 구분)</label>
              <textarea
                value={editFeatures}
                onChange={e => setEditFeatures(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-lime-500/50 resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">매력 포인트 (쉼표로 구분)</label>
              <textarea
                value={editAppeals}
                onChange={e => setEditAppeals(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-lime-500/50 resize-none"
              />
            </div>
          </div>
        ) : (
          /* 프리셋 보기 모드 */
          <div className="space-y-3">
            {/* 나레이션 감지 결과 */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              narrationText
                ? 'bg-green-900/20 border border-green-500/20 text-green-400'
                : 'bg-gray-900/30 border border-gray-700/30 text-gray-500'
            }`}>
              <span>{narrationText ? '🎙️' : '🔇'}</span>
              <span className="font-bold">{narrationText ? '원본 나레이션 감지됨' : '원본 나레이션 없음 (프레임 기반 분석)'}</span>
              {narrationText && (
                <span className="text-xs opacity-70 ml-auto">{narrationText.length}자</span>
              )}
            </div>

            {/* 프리셋 필드 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900/30 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">상품명</span>
                <p className="text-base text-gray-100 font-bold">{productAnalysis.productName}</p>
              </div>
              <div className="bg-gray-900/30 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">카테고리</span>
                <p className="text-base text-gray-200">{productAnalysis.category}</p>
              </div>
            </div>
            <div className="bg-gray-900/30 rounded-lg p-3">
              <span className="text-xs text-gray-500 block mb-1">최적 타겟 (동적 타겟팅)</span>
              <p className="text-base text-lime-300 font-bold">{productAnalysis.targetAudience}</p>
            </div>
            <div className="bg-gray-900/30 rounded-lg p-3">
              <span className="text-xs text-gray-500 block mb-1">핵심 기능</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {productAnalysis.keyFeatures.map((f, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-600/15 text-blue-300 border border-blue-500/20">
                    {f}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-gray-900/30 rounded-lg p-3">
              <span className="text-xs text-gray-500 block mb-1">매력 포인트</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {productAnalysis.appealPoints.map((p, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-xs font-medium bg-pink-600/15 text-pink-300 border border-pink-500/20">
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* 나레이션 원문 (접이식) */}
            {narrationText && (
              <details className="bg-gray-900/30 rounded-lg">
                <summary className="px-3 py-2 cursor-pointer text-xs text-gray-500 hover:text-gray-400 transition-colors">
                  원본 나레이션 전사 텍스트 보기
                </summary>
                <p className="px-3 pb-3 text-xs text-gray-400 leading-relaxed whitespace-pre-wrap">{narrationText}</p>
              </details>
            )}

            {/* 대본 재생성 버튼 */}
            <button
              onClick={handleRegenerateScripts}
              disabled={isGeneratingScripts}
              className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all border ${
                isGeneratingScripts
                  ? 'bg-lime-600/10 text-lime-400/50 border-lime-500/20 cursor-wait'
                  : 'bg-lime-600/10 text-lime-300 border-lime-500/30 hover:bg-lime-600/20 hover:border-lime-500/50'
              }`}
            >
              {isGeneratingScripts ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-lime-400/30 border-t-lime-400 rounded-full" />
                  대본 재생성 중...
                </span>
              ) : '이 프리셋으로 대본 재생성'}
            </button>
          </div>
        )}
      </div>

      {/* ═══ 대본 선택 ═══ */}
      <div>
        <h3 className="text-lg font-bold text-gray-100 mb-4">
          대본 선택 {generatedScripts.length > 0 && <span className="text-gray-500 text-sm font-normal ml-1">({generatedScripts.length}개)</span>}
        </h3>

        {generatedScripts.length === 0 ? (
          <div className="text-center py-8 bg-gray-800/20 rounded-xl border border-dashed border-gray-700/40">
            <div className="text-3xl mb-3">📝</div>
            <p className="text-gray-500 text-sm">프리셋이 생성되면 대본이 자동으로 생성됩니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {generatedScripts.map(script => (
              <button
                key={script.id}
                onClick={() => setSelectedScriptId(script.id)}
                className={`w-full text-left p-5 rounded-2xl border transition-all ${
                  selectedScriptId === script.id
                    ? 'bg-lime-600/15 border-lime-500/40 ring-1 ring-lime-500/20'
                    : 'bg-gray-800/40 border-gray-700/40 hover:border-gray-600/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`font-bold ${selectedScriptId === script.id ? 'text-lime-300' : 'text-gray-200'}`}>
                    {script.title}
                  </h4>
                  <span className="text-xs text-gray-500">~{script.estimatedDuration}초</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-900/40 rounded-lg p-2">
                    <span className="text-yellow-400 font-bold">후킹</span>
                    <p className="text-gray-400 mt-1 line-clamp-2">{script.sections.hooking}</p>
                  </div>
                  <div className="bg-gray-900/40 rounded-lg p-2">
                    <span className="text-blue-400 font-bold">디테일</span>
                    <p className="text-gray-400 mt-1 line-clamp-2">{script.sections.detail}</p>
                  </div>
                  <div className="bg-gray-900/40 rounded-lg p-2">
                    <span className="text-pink-400 font-bold">로망</span>
                    <p className="text-gray-400 mt-1 line-clamp-2">{script.sections.romance}</p>
                  </div>
                  <div className="bg-gray-900/40 rounded-lg p-2">
                    <span className="text-green-400 font-bold">위트+CTA</span>
                    <p className="text-gray-400 mt-1 line-clamp-2">{script.sections.wit}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 선택된 대본 전문 */}
      {selectedScript && (
        <div className="bg-gray-800/40 rounded-2xl p-5 border border-gray-700/40">
          <h4 className="text-sm font-bold text-gray-300 mb-2">전체 나레이션 미리보기</h4>
          <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">{selectedScript.fullText}</p>
        </div>
      )}

      {/* 자막 제거 모드 */}
      <div>
        <h3 className="text-base font-bold text-gray-100 mb-3">원본 자막 제거</h3>
        <div className="grid grid-cols-2 gap-3">
          {SUBTITLE_REMOVAL_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setSubtitleRemovalMethod(opt.id)}
              className={`p-4 rounded-xl text-center transition-all ${
                subtitleRemovalMethod === opt.id
                  ? 'bg-lime-600/20 border border-lime-500/40 text-lime-300'
                  : 'bg-gray-800/60 border border-gray-700/40 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="text-2xl mb-1">{opt.icon}</div>
              <div className="text-sm font-bold">{opt.label}</div>
              <div className="text-xs opacity-70 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* TTS / 폰트 / CTA 설정 */}
      <div className="bg-gray-800/40 rounded-2xl p-6 border border-gray-700/40">
        <h3 className="text-base font-bold text-gray-100 mb-4">성우 / 자막 / CTA 설정</h3>
        <VoiceFontPicker showCta={true} />
      </div>

      {/* 렌더링 시작 버튼 */}
      <button
        onClick={handleStartRender}
        disabled={!selectedScriptId}
        className={`w-full py-4 rounded-xl font-bold text-base transition-all ${
          !selectedScriptId
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-lime-600 to-green-600 hover:from-lime-500 hover:to-green-500 text-white shadow-lg shadow-lime-900/30'
        }`}
      >
        렌더링 시작
      </button>
    </div>
  );
};

export default ScriptSelectStep;
