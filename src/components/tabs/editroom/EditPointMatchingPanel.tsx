import React from 'react';
import { useEditPointStore } from '../../../stores/editPointStore';
import type { EditPointStep } from '../../../types';
import Step1Register from './editpoint/Step1Register';
import Step2Mapping from './editpoint/Step2Mapping';
import Step3Export from './editpoint/Step3Export';

const STEPS: { key: EditPointStep; label: string; icon: string }[] = [
  { key: 'register', label: '소스 등록', icon: '1' },
  { key: 'mapping', label: '매핑 & 정제', icon: '2' },
  { key: 'export', label: '내보내기', icon: '3' },
];

const EditPointMatchingPanel: React.FC = () => {
  const step = useEditPointStore((s) => s.step);
  const reset = useEditPointStore((s) => s.reset);

  const stepIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-xs">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
              </svg>
            </span>
            편집점 매칭
          </h2>
          <p className="text-xs text-gray-500 mt-1">일반 편집점/편집실 매칭: 소스 영상 + 대본/편집표 → AI 생성·정제 → 타임라인·내보내기</p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-all"
        >
          초기화
        </button>
      </div>

      {/* 스텝 인디케이터 */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => {
          const isCompleted = i < stepIdx;
          const isCurrent = i === stepIdx;
          const isFuture = i > stepIdx;

          return (
            <React.Fragment key={s.key}>
              {i > 0 && (
                <div className={`flex-1 h-px ${isCompleted ? 'bg-green-500/50' : 'bg-gray-700'}`} />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isCompleted
                      ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                      : isCurrent
                      ? 'bg-amber-600/20 text-amber-400 border border-amber-500/50 ring-2 ring-amber-500/20'
                      : 'bg-gray-800 text-gray-600 border border-gray-700'
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : s.icon}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:inline ${
                    isCurrent ? 'text-amber-400' : isFuture ? 'text-gray-600' : 'text-green-400'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* 스텝별 콘텐츠 */}
      {step === 'register' && <Step1Register />}
      {step === 'mapping' && <Step2Mapping />}
      {step === 'export' && <Step3Export />}
    </div>
  );
};

export default EditPointMatchingPanel;
