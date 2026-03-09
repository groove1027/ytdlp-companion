import React, { useState, useEffect, useMemo } from 'react';

interface Props {
  isGenerating: boolean;
  elapsed: number;
  streamingText: string;
  targetChars: number;
}

const PIPELINE_STEPS = [
  { id: 'analyze', label: '소재 분석', icon: '🔍', duration: 3 },
  { id: 'structure', label: '구조 설계', icon: '🏗️', duration: 5 },
  { id: 'draft', label: '초안 작성', icon: '✍️', duration: 15 },
  { id: 'instinct', label: '본능 기제 적용', icon: '🧠', duration: 8 },
  { id: 'polish', label: '최종 다듬기', icon: '✨', duration: 5 },
];

const TOTAL_ESTIMATED = PIPELINE_STEPS.reduce((a, s) => a + s.duration, 0);

export default function GenerationTimeline({ isGenerating, elapsed, streamingText, targetChars }: Props) {
  const [currentStep, setCurrentStep] = useState(0);

  // 스트리밍 텍스트가 있으면 '초안 작성' 단계(idx 2)
  useEffect(() => {
    if (!isGenerating) { setCurrentStep(0); return; }
    if (streamingText.length > 0) {
      // 스트리밍 시작 → 초안 작성
      const ratio = streamingText.length / targetChars;
      if (ratio >= 0.9) setCurrentStep(4);
      else if (ratio >= 0.5) setCurrentStep(3);
      else setCurrentStep(2);
    } else if (elapsed > 0) {
      // 시간 기반 추정
      let acc = 0;
      for (let i = 0; i < PIPELINE_STEPS.length; i++) {
        acc += PIPELINE_STEPS[i].duration;
        if (elapsed < acc) { setCurrentStep(i); return; }
      }
      setCurrentStep(PIPELINE_STEPS.length - 1);
    }
  }, [isGenerating, elapsed, streamingText, targetChars]);

  // 비선형 진행률
  const progress = useMemo(() => {
    if (!isGenerating) return 0;
    if (streamingText.length > 0) {
      return Math.min(95, Math.round((streamingText.length / targetChars) * 90) + 5);
    }
    return Math.min(95, Math.round(100 * (1 - Math.exp(-elapsed / (TOTAL_ESTIMATED * 0.55)))));
  }, [isGenerating, elapsed, streamingText, targetChars]);

  if (!isGenerating) return null;

  return (
    <div className="bg-gray-900/70 border border-violet-500/30 rounded-xl p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-violet-500 rounded-full animate-pulse" />
          <span className="text-sm font-bold text-violet-300">AI 대본 생성 중</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-black text-white">{progress}%</span>
          {elapsed > 0 && (
            <span className="text-xs text-gray-500 tabular-nums">{elapsed}초</span>
          )}
        </div>
      </div>

      {/* 프로그레스 바 */}
      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-pink-500 to-violet-500 transition-all duration-700 ease-out"
          style={{ width: `${progress}%`, backgroundSize: '200% 100%', animation: 'shimmer 2s linear infinite' }} />
      </div>

      {/* 파이프라인 스텝 */}
      <div className="flex items-start gap-0">
        {PIPELINE_STEPS.map((step, i) => {
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          const isFuture = i > currentStep;

          return (
            <div key={step.id} className="flex-1 flex flex-col items-center relative">
              {/* 연결선 */}
              {i > 0 && (
                <div className={`absolute top-3.5 -left-1/2 w-full h-0.5 ${isDone ? 'bg-green-500' : isActive ? 'bg-violet-500' : 'bg-gray-700'}`} style={{ zIndex: 0 }} />
              )}

              {/* 원 */}
              <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all ${
                isDone ? 'bg-green-500 text-white' : isActive ? 'bg-violet-500 text-white ring-2 ring-violet-400/50 ring-offset-1 ring-offset-gray-900' : 'bg-gray-700 text-gray-500'
              }`}>
                {isDone ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-xs">{step.icon}</span>
                )}
              </div>

              {/* 라벨 */}
              <span className={`mt-1.5 text-xs text-center font-medium leading-tight ${
                isDone ? 'text-green-400' : isActive ? 'text-violet-300' : 'text-gray-600'
              }`}>
                {step.label}
              </span>

              {/* 시간 표시 (active) */}
              {isActive && (
                <span className="text-[10px] text-violet-400/70 mt-0.5 animate-pulse">진행 중...</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 스트리밍 미리보기 */}
      {streamingText && (
        <div className="bg-gray-800/50 rounded-lg p-3 max-h-[200px] overflow-auto border border-gray-700/30">
          <pre className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed font-sans">
            {streamingText}
            <span className="animate-pulse text-violet-400">|</span>
          </pre>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/30">
            <span className="text-xs text-gray-500">{streamingText.length.toLocaleString()}자 작성됨</span>
            <span className="text-xs text-gray-500">목표: {targetChars.toLocaleString()}자</span>
          </div>
        </div>
      )}

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
