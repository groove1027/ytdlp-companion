import React, { Suspense } from 'react';
import { useShoppingShortStore } from '../../stores/shoppingShortStore';
import type { ShoppingWizardStep } from '../../types';
import { lazyRetry } from '../../utils/retryImport';

const SourceInputStep = lazyRetry(() => import('./shopping/SourceInputStep'));
const ScriptSelectStep = lazyRetry(() => import('./shopping/ScriptSelectStep'));
const RenderStep = lazyRetry(() => import('./shopping/RenderStep'));

const WIZARD_STEPS: { id: ShoppingWizardStep; label: string; num: number }[] = [
  { id: 'source', label: '소스 입력', num: 1 },
  { id: 'script', label: '대본 선택', num: 2 },
  { id: 'render', label: '렌더링', num: 3 },
];

const StepFallback = () => (
  <div className="flex items-center justify-center py-16">
    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-lime-500" />
    <span className="ml-3 text-gray-400 text-sm">로딩 중...</span>
  </div>
);

interface ShoppingShortTabProps {
  hideHeader?: boolean;
}

const ShoppingShortTab: React.FC<ShoppingShortTabProps> = ({ hideHeader = false }) => {
  const { currentStep, goToStep, reset } = useShoppingShortStore();

  const currentStepIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);

  return (
    <div className="max-w-4xl mx-auto">
      {/* 헤더 — hideHeader일 때 숨김 */}
      {!hideHeader && (
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-lime-500 to-green-700 flex items-center justify-center text-2xl shadow-lg shadow-lime-900/30">
              🛍️
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-100">쇼핑 숏폼 자동화</h2>
              <p className="text-sm text-gray-500 mt-0.5">해외 쇼핑 영상 → AI 분석 → 한국어 숏폼 자동 제작</p>
            </div>
          </div>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-all border border-gray-700/40"
          >
            초기화
          </button>
        </div>
      )}

      {/* hideHeader 모드에서는 초기화 버튼만 우측 상단에 */}
      {hideHeader && (
        <div className="flex justify-end mb-4">
          <button
            onClick={reset}
            className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-all border border-gray-700/40"
          >
            초기화
          </button>
        </div>
      )}

      {/* 위저드 인디케이터 — 클릭으로 자유 이동 */}
      <div className="flex items-center mb-8 px-4">
        {WIZARD_STEPS.map((step, i) => {
          const isDone = currentStepIndex > i;
          const isCurrent = currentStepIndex === i;

          return (
            <React.Fragment key={step.id}>
              <button
                onClick={() => goToStep(step.id)}
                className="flex items-center gap-2 group cursor-pointer"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all group-hover:ring-2 group-hover:ring-lime-500/30 ${
                  isDone ? 'bg-green-600/30 text-green-400 border border-green-500/50' :
                  isCurrent ? 'bg-lime-600/30 text-lime-300 border border-lime-500/50' :
                  'bg-gray-800/60 text-gray-600 border border-gray-700/40 group-hover:text-gray-400 group-hover:border-gray-600'
                }`}>
                  {isDone ? '✓' : step.num}
                </div>
                <span className={`text-sm font-semibold transition-colors ${
                  isDone ? 'text-green-400' :
                  isCurrent ? 'text-lime-300' :
                  'text-gray-600 group-hover:text-gray-400'
                }`}>
                  {step.label}
                </span>
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-4 ${
                  isDone ? 'bg-green-500/50' : 'bg-gray-700/40'
                }`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* 스텝 콘텐츠 */}
      <Suspense fallback={<StepFallback />}>
        {currentStep === 'source' && <SourceInputStep />}
        {currentStep === 'script' && <ScriptSelectStep />}
        {currentStep === 'render' && <RenderStep />}
      </Suspense>
    </div>
  );
};

export default ShoppingShortTab;
