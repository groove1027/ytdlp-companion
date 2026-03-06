import React from 'react';
import { useUploadStore } from '../../../stores/uploadStore';
import type { OutputMode } from '../../../types';

interface OutputModeOption {
  id: OutputMode;
  title: string;
  description: string;
  icon: React.ReactNode;
  details: string[];
}

const OUTPUT_MODES: OutputModeOption[] = [
  {
    id: 'mp4',
    title: 'MP4 영상 출력',
    description: '나레이션 + 자막 + 이미지 효과가 병합된 MP4로 출력',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    details: [
      '나레이션 음성 포함',
      '자막 오버레이 적용',
      '이미지 효과 (줌, 팬) 병합',
      '최종 MP4 파일 1개 출력',
    ],
  },
  {
    id: 'srt-image',
    title: 'SRT + 이미지 출력',
    description: '나레이션 + 자막 + 이미지의 편집점이 적용된 SRT 파일로 출력',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    details: [
      '나레이션 타임코드 SRT',
      '자막 타임코드 SRT',
      '이미지 편집점 SRT',
      '외부 편집기에서 조합 가능',
    ],
  },
  {
    id: 'srt-video',
    title: 'SRT + 영상 출력',
    description: '나레이션 + 자막 + 영상 편집점이 적용된 SRT 파일로 출력',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
      </svg>
    ),
    details: [
      '나레이션 타임코드 SRT',
      '자막 타임코드 SRT',
      '영상 편집점 SRT',
      'Premiere/DaVinci 호환',
    ],
  },
];

const OutputModeSelector: React.FC = () => {
  const outputMode = useUploadStore((s) => s.outputMode);
  const setOutputMode = useUploadStore((s) => s.setOutputMode);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-bold text-white mb-1">출력 모드 선택</h3>
        <p className="text-gray-400 text-base">최종 출력 형식을 선택하세요. MP4는 바로 업로드 가능한 완성 영상, SRT는 Premiere/DaVinci 등 외부 편집기에서 활용할 수 있는 타임코드 파일입니다.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {OUTPUT_MODES.map((mode) => {
          const isSelected = outputMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setOutputMode(mode.id)}
              className={`text-left p-5 rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-green-500 bg-green-500/10 shadow-lg shadow-green-500/10'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              {/* Icon + Title */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isSelected ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'
                }`}>
                  {mode.icon}
                </div>
                <div className="flex-1">
                  <p className={`text-base font-bold ${isSelected ? 'text-green-300' : 'text-gray-200'}`}>
                    {mode.title}
                  </p>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Description */}
              <p className={`text-sm mb-3 ${isSelected ? 'text-green-400/80' : 'text-gray-400'}`}>
                {mode.description}
              </p>

              {/* Details */}
              <ul className="space-y-1.5">
                {mode.details.map((detail, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <span className={`w-1 h-1 rounded-full flex-shrink-0 ${isSelected ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <span className={isSelected ? 'text-gray-300' : 'text-gray-500'}>{detail}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default OutputModeSelector;
