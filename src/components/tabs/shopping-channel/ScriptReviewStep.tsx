import React, { useCallback, useEffect, useState } from 'react';
import { useShoppingChannelStore } from '../../../stores/shoppingChannelStore';
import { generateChannelScripts, generateScenePrompts } from '../../../services/shoppingChannelService';
import { showToast } from '../../../stores/uiStore';
import type { ShoppingScript } from '../../../types';

const SECTION_LABELS: Record<string, string> = {
  hooking: '후킹',
  detail: '디테일',
  romance: '로망',
  wit: '위트',
};

const ScriptReviewStep: React.FC = () => {
  const {
    productAnalysis, characterConfig, sceneTemplate, aspectRatio, ctaPreset,
    generatedScripts, selectedScriptId, isGeneratingScripts,
    setGeneratedScripts, setSelectedScriptId, setIsGeneratingScripts, setScenes, goToStep,
  } = useShoppingChannelStore();

  const [editingScript, setEditingScript] = useState<ShoppingScript | null>(null);
  const [isPreparingScenes, setIsPreparingScenes] = useState(false);

  // 자동 대본 생성 (최초 진입 시)
  useEffect(() => {
    if (generatedScripts.length === 0 && productAnalysis && !isGeneratingScripts) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!productAnalysis) return;
    setIsGeneratingScripts(true);
    try {
      const scripts = await generateChannelScripts(productAnalysis, ctaPreset);
      setGeneratedScripts(scripts);
      if (scripts.length > 0) setSelectedScriptId(scripts[0].id);
      showToast(`${scripts.length}개 대본이 생성되었습니다!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '대본 생성 실패');
    } finally {
      setIsGeneratingScripts(false);
    }
  }, [productAnalysis, ctaPreset, setGeneratedScripts, setSelectedScriptId, setIsGeneratingScripts]);

  const handleProceed = useCallback(async () => {
    const script = generatedScripts.find(s => s.id === selectedScriptId);
    if (!script || !productAnalysis) return;

    setIsPreparingScenes(true);
    try {
      const scenes = await generateScenePrompts(
        productAnalysis, script, characterConfig, sceneTemplate, aspectRatio,
      );
      setScenes(scenes);
      goToStep('generate');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '장면 준비 실패');
    } finally {
      setIsPreparingScenes(false);
    }
  }, [generatedScripts, selectedScriptId, productAnalysis, characterConfig, sceneTemplate, aspectRatio, setScenes, goToStep]);

  const selectedScript = generatedScripts.find(s => s.id === selectedScriptId);

  return (
    <div className="space-y-6">
      {/* 대본 목록 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-cyan-600/30 flex items-center justify-center text-sm">📜</span>
            AI 대본 선택
          </h3>
          <button
            onClick={handleGenerate}
            disabled={isGeneratingScripts}
            className="px-4 py-2 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm font-bold hover:bg-cyan-600/30 transition-colors disabled:opacity-50"
          >
            {isGeneratingScripts ? '생성 중...' : '재생성'}
          </button>
        </div>

        {isGeneratingScripts ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
            <span className="ml-3 text-gray-400">대본 생성 중...</span>
          </div>
        ) : generatedScripts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            대본을 생성해주세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {generatedScripts.map((script, i) => (
              <button
                key={script.id}
                onClick={() => setSelectedScriptId(script.id)}
                className={`p-4 rounded-xl text-left transition-all ${
                  selectedScriptId === script.id
                    ? 'bg-cyan-600/20 border-2 border-cyan-500/50 ring-1 ring-cyan-500/20'
                    : 'bg-gray-900/50 border border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-white">대본 {i + 1}</span>
                  <span className="text-xs text-gray-500">{script.estimatedDuration}초</span>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(script.sections).map(([key, text]) => (
                    <div key={key} className="text-xs">
                      <span className="text-cyan-400/70 font-semibold">{SECTION_LABELS[key] || key}</span>
                      <p className="text-gray-400 line-clamp-1 mt-0.5">{text}</p>
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 선택 대본 전문 */}
      {selectedScript && (
        <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-cyan-400">선택된 대본</h3>
            <button
              onClick={() => setEditingScript(editingScript ? null : { ...selectedScript })}
              className="px-3 py-1.5 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg text-xs hover:bg-gray-600 transition-colors"
            >
              {editingScript ? '편집 취소' : '편집'}
            </button>
          </div>

          {editingScript ? (
            <div className="space-y-3">
              {Object.entries(editingScript.sections).map(([key, text]) => (
                <div key={key}>
                  <label className="text-sm font-bold text-cyan-400/70 mb-1 block">{SECTION_LABELS[key] || key}</label>
                  <textarea
                    value={text}
                    onChange={(e) => {
                      const updated = { ...editingScript, sections: { ...editingScript.sections, [key]: e.target.value } };
                      updated.fullText = Object.values(updated.sections).join(' ');
                      setEditingScript(updated);
                    }}
                    rows={2}
                    className="w-full px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none resize-none"
                  />
                </div>
              ))}
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setGeneratedScripts(generatedScripts.map(s => s.id === editingScript.id ? editingScript : s));
                    setEditingScript(null);
                    showToast('대본이 수정되었습니다.');
                  }}
                  className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-bold hover:bg-cyan-500 transition-colors"
                >
                  수정 저장
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(selectedScript.sections).map(([key, text]) => (
                <div key={key}>
                  <span className="text-sm font-bold text-cyan-400/70">{SECTION_LABELS[key] || key}</span>
                  <p className="text-gray-300 text-sm mt-1 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 네비게이션 */}
      <div className="flex justify-between">
        <button
          onClick={() => goToStep('concept')}
          className="px-6 py-3 bg-gray-700 text-gray-300 border border-gray-600 rounded-xl font-bold hover:bg-gray-600 transition-colors"
        >
          ← 이전
        </button>
        <button
          onClick={handleProceed}
          disabled={!selectedScriptId || isPreparingScenes}
          className={`px-8 py-3 rounded-xl font-bold transition-all shadow-lg ${
            selectedScriptId && !isPreparingScenes
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-900/30'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
          }`}
        >
          {isPreparingScenes ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-cyan-400 rounded-full animate-spin" />
              장면 준비 중...
            </span>
          ) : '다음: 영상 생성 →'}
        </button>
      </div>
    </div>
  );
};

export default ScriptReviewStep;
