// 첫 방문 온보딩 투어
import React, { useState, useEffect, useCallback } from 'react';
import { ONBOARDING_STEPS, TOUR_STORAGE_KEY } from '../data/helpContent';
import type { TourStep } from '../data/helpContent';

/** 스팟라이트 위치 계산 */
function getTargetRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  return el ? el.getBoundingClientRect() : null;
}

/** 말풍선 위치 계산 */
function getTooltipStyle(rect: DOMRect, position: TourStep['position']): React.CSSProperties {
  const pad = 16;
  switch (position) {
    case 'right':
      return { top: rect.top + rect.height / 2, left: rect.right + pad, transform: 'translateY(-50%)' };
    case 'left':
      return { top: rect.top + rect.height / 2, right: window.innerWidth - rect.left + pad, transform: 'translateY(-50%)' };
    case 'bottom':
      return { top: rect.bottom + pad, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
    case 'top':
      return { bottom: window.innerHeight - rect.top + pad, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
  }
}

interface OnboardingTourProps {
  forceShow?: boolean;
  onComplete?: () => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ forceShow, onComplete }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // 첫 방문 체크
  useEffect(() => {
    if (forceShow) {
      setIsVisible(true);
      return;
    }
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      // 첫 렌더 후 약간의 딜레이
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [forceShow]);

  // 현재 스텝의 대상 요소 위치 계산
  const updateRect = useCallback(() => {
    if (!isVisible) return;
    const step = ONBOARDING_STEPS[currentStep];
    if (!step) return;
    const rect = getTargetRect(step.targetSelector);
    setTargetRect(rect);
  }, [isVisible, currentStep]);

  useEffect(() => {
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect);
    };
  }, [updateRect]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    setIsVisible(false);
    onComplete?.();
  }, [onComplete]);

  const handleComplete = useCallback(() => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    setIsVisible(false);
    onComplete?.();
  }, [onComplete]);

  // ESC로 건너뛰기
  useEffect(() => {
    if (!isVisible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isVisible, handleSkip]);

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  if (!isVisible) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const isLast = currentStep === ONBOARDING_STEPS.length - 1;
  const spotlightPad = 6;

  return (
    <div className="fixed inset-0 z-[200]">
      {/* 반투명 오버레이 — SVG 스팟라이트 */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - spotlightPad}
                y={targetRect.top - spotlightPad}
                width={targetRect.width + spotlightPad * 2}
                height={targetRect.height + spotlightPad * 2}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.75)"
          mask="url(#tour-mask)"
          style={{ pointerEvents: 'auto' }}
          onClick={handleSkip}
        />
      </svg>

      {/* 스팟라이트 테두리 */}
      {targetRect && (
        <div
          className="absolute border-2 border-blue-400 rounded-xl pointer-events-none"
          style={{
            left: targetRect.left - spotlightPad,
            top: targetRect.top - spotlightPad,
            width: targetRect.width + spotlightPad * 2,
            height: targetRect.height + spotlightPad * 2,
            boxShadow: '0 0 0 4px rgba(59,130,246,0.2), 0 0 20px rgba(59,130,246,0.15)',
          }}
        />
      )}

      {/* 말풍선 */}
      {targetRect && (
        <div
          className="absolute bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-5 w-72 animate-fade-in-up"
          style={getTooltipStyle(targetRect, step.position)}
        >
          <h3 className="text-base font-bold text-white mb-2">{step.title}</h3>
          <p className="text-sm text-gray-300 leading-relaxed mb-4">{step.description}</p>

          {/* 프로그레스 & 네비게이션 */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {ONBOARDING_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === currentStep ? 'bg-blue-400 w-4' : i < currentStep ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button onClick={handlePrev} className="px-2.5 py-1 text-xs text-gray-400 hover:text-white transition-all">
                  이전
                </button>
              )}
              <button onClick={handleSkip} className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-300 transition-all">
                건너뛰기
              </button>
              <button
                onClick={handleNext}
                className="px-3 py-1.5 text-xs font-bold text-white rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 transition-all"
              >
                {isLast ? '시작하기!' : '다음'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 대상 요소를 못 찾았을 때 (fallback) */}
      {!targetRect && (
        <div className="absolute inset-0 flex items-center justify-center" onClick={handleSkip}>
          <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-6 w-80 animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white mb-2">{step.title}</h3>
            <p className="text-sm text-gray-300 leading-relaxed mb-4">{step.description}</p>
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {ONBOARDING_STEPS.map((_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full ${i === currentStep ? 'bg-blue-400 w-4' : 'bg-gray-600'}`} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleSkip} className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-300">건너뛰기</button>
                <button onClick={handleNext} className="px-3 py-1.5 text-xs font-bold text-white rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500">
                  {isLast ? '시작하기!' : '다음'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingTour;
