import React, { Suspense } from 'react';
import { useShoppingChannelStore } from '../../stores/shoppingChannelStore';
import type { ShoppingChannelWizardStep } from '../../types';
import { lazyRetry } from '../../utils/retryImport';

const ProductInputStep = lazyRetry(() => import('./shopping-channel/ProductInputStep'));
const ConceptSetupStep = lazyRetry(() => import('./shopping-channel/ConceptSetupStep'));
const ScriptReviewStep = lazyRetry(() => import('./shopping-channel/ScriptReviewStep'));
const GenerationStep = lazyRetry(() => import('./shopping-channel/GenerationStep'));

const WIZARD_STEPS: { id: ShoppingChannelWizardStep; label: string; num: number }[] = [
  { id: 'product', label: '제품 입력', num: 1 },
  { id: 'concept', label: '컨셉 설정', num: 2 },
  { id: 'script', label: '대본 확인', num: 3 },
  { id: 'generate', label: '영상 생성', num: 4 },
];

const StepFallback = () => (
  <div className="flex items-center justify-center py-16">
    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-cyan-500" />
    <span className="ml-3 text-gray-400 text-sm">로딩 중...</span>
  </div>
);

interface ShoppingChannelTabProps {
  hideHeader?: boolean;
}

const ShoppingChannelTab: React.FC<ShoppingChannelTabProps> = ({ hideHeader = false }) => {
  const { currentStep, goToStep, reset } = useShoppingChannelStore();

  const currentStepIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);

  return (
    <div className="max-w-4xl mx-auto">
      {/* 헤더 — hideHeader일 때 숨김 */}
      {!hideHeader && (
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center text-2xl shadow-lg shadow-cyan-900/30">
              📺
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-100">쇼핑 채널 AI 영상</h2>
              <p className="text-sm text-gray-500 mt-0.5">제품 사진 → AI 캐릭터 리뷰 영상 자동 생성</p>
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

      {/* 위저드 인디케이터 */}
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
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all group-hover:ring-2 group-hover:ring-cyan-500/30 ${
                  isDone ? 'bg-green-600/30 text-green-400 border border-green-500/50' :
                  isCurrent ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/50' :
                  'bg-gray-800/60 text-gray-600 border border-gray-700/40 group-hover:text-gray-400 group-hover:border-gray-600'
                }`}>
                  {isDone ? '✓' : step.num}
                </div>
                <span className={`text-sm font-semibold transition-colors ${
                  isDone ? 'text-green-400' :
                  isCurrent ? 'text-cyan-300' :
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
        {currentStep === 'product' && <ProductInputStep />}
        {currentStep === 'concept' && <ConceptSetupStep />}
        {currentStep === 'script' && <ScriptReviewStep />}
        {currentStep === 'generate' && <GenerationStep />}
      </Suspense>
    </div>
  );
};

export default ShoppingChannelTab;
