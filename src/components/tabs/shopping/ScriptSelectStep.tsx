import React, { useCallback } from 'react';
import { useShoppingShortStore } from '../../../stores/shoppingShortStore';
import VoiceFontPicker from './VoiceFontPicker';
import { showToast } from '../../../stores/uiStore';
import type { SubtitleRemovalMethod } from '../../../types';

const SUBTITLE_REMOVAL_OPTIONS: { id: SubtitleRemovalMethod; label: string; desc: string; icon: string }[] = [
  { id: 'blur', label: '블러', desc: '하단 20% 블러 처리', icon: '🔲' },
  { id: 'crop', label: '크롭', desc: '하단 20% 검정 채움', icon: '✂️' },
  { id: 'none', label: '없음', desc: '원본 유지', icon: '📋' },
];

const ScriptSelectStep: React.FC = () => {
  const {
    productAnalysis,
    generatedScripts,
    selectedScriptId, setSelectedScriptId,
    subtitleRemovalMethod, setSubtitleRemovalMethod,
    ttsVoiceId, ttsEngine,
    goToStep,
  } = useShoppingShortStore();

  const selectedScript = generatedScripts.find(s => s.id === selectedScriptId);

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

      {/* 상품 분석 결과 */}
      {productAnalysis && (
        <div className="bg-gray-800/40 rounded-2xl p-5 border border-lime-500/20">
          <h3 className="text-base font-bold text-lime-300 mb-3">상품 분석 결과</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">상품명</span>
              <p className="text-gray-200 font-semibold">{productAnalysis.productName}</p>
            </div>
            <div>
              <span className="text-gray-500">카테고리</span>
              <p className="text-gray-200">{productAnalysis.category}</p>
            </div>
            <div>
              <span className="text-gray-500">타겟</span>
              <p className="text-gray-200">{productAnalysis.targetAudience}</p>
            </div>
            <div>
              <span className="text-gray-500">매력 포인트</span>
              <p className="text-gray-200">{productAnalysis.appealPoints.slice(0, 3).join(', ')}</p>
            </div>
          </div>
        </div>
      )}

      {/* 대본 선택 */}
      <div>
        <h3 className="text-lg font-bold text-gray-100 mb-4">대본 선택 ({generatedScripts.length}개)</h3>
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
        <div className="grid grid-cols-3 gap-3">
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
        <h3 className="text-base font-bold text-gray-100 mb-4">성우 / 폰트 / CTA 설정</h3>
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
