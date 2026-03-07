import React from 'react';
import { useEditPointStore } from '../../../../stores/editPointStore';
import type { EditPointExportMode } from '../../../../types';

interface ExportCard {
  mode: EditPointExportMode;
  icon: React.ReactNode;
  title: string;
  description: string;
  condition: boolean;
  conditionLabel?: string;
}

const Step3Export: React.FC = () => {
  const exportMode = useEditPointStore((s) => s.exportMode);
  const setExportMode = useEditPointStore((s) => s.setExportMode);
  const exportResult = useEditPointStore((s) => s.exportResult);
  const setStep = useEditPointStore((s) => s.setStep);
  const totalSourceSizeMB = useEditPointStore((s) => s.totalSourceSizeMB);
  const edlEntries = useEditPointStore((s) => s.edlEntries);

  const cards: ExportCard[] = [
    {
      mode: 'direct-mp4',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: '브라우저 MP4 합성',
      description: 'FFmpeg.wasm으로 브라우저에서 직접 MP4를 생성합니다.',
      condition: totalSourceSizeMB < 500,
      conditionLabel: totalSourceSizeMB >= 500 ? `${totalSourceSizeMB}MB > 500MB 제한` : undefined,
    },
    {
      mode: 'ffmpeg-script',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
      title: 'FFmpeg 스크립트',
      description: '로컬 FFmpeg에서 실행할 .sh 스크립트를 다운로드합니다. 대용량 영상에 권장.',
      condition: true,
    },
    {
      mode: 'edl-file',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      title: 'EDL + SRT 파일',
      description: 'Premiere Pro / DaVinci Resolve용 CMX 3600 EDL + 내레이션 SRT를 다운로드합니다.',
      condition: true,
    },
    {
      mode: 'push-to-timeline',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      title: '타임라인 전송',
      description: '편집실 타임라인에 장면과 자막을 자동 배치합니다.',
      condition: true,
    },
  ];

  return (
    <div className="space-y-5">
      {/* 내보내기 요약 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
        <div className="flex items-center gap-4 text-sm">
          <div className="text-gray-400">
            편집 항목: <span className="text-amber-300 font-mono">{edlEntries.length}개</span>
          </div>
          <div className="text-gray-600">|</div>
          <div className="text-gray-400">
            총 소스 용량: <span className="text-amber-300 font-mono">{totalSourceSizeMB}MB</span>
          </div>
        </div>
      </div>

      {/* 내보내기 모드 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((card) => {
          const selected = exportMode === card.mode;
          const disabled = !card.condition;
          return (
            <button
              key={card.mode}
              type="button"
              onClick={() => !disabled && setExportMode(card.mode)}
              disabled={disabled}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                disabled
                  ? 'border-gray-800 bg-gray-900/30 opacity-50 cursor-not-allowed'
                  : selected
                  ? 'border-amber-500/50 bg-amber-900/10'
                  : 'border-gray-700/50 bg-gray-800/30 hover:border-gray-600/50 hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${selected ? 'text-amber-400' : disabled ? 'text-gray-600' : 'text-gray-400'}`}>
                  {card.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-sm font-medium ${selected ? 'text-amber-300' : disabled ? 'text-gray-600' : 'text-gray-200'}`}>
                      {card.title}
                    </h4>
                    {selected && (
                      <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <p className={`text-[11px] mt-1 ${disabled ? 'text-gray-700' : 'text-gray-500'}`}>
                    {card.description}
                  </p>
                  {card.conditionLabel && (
                    <p className="text-[10px] mt-1 text-red-400">{card.conditionLabel}</p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setStep('mapping')}
          className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-all"
        >
          이전 단계
        </button>

        <button
          type="button"
          onClick={exportResult}
          className="px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-900/30 transition-all flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          내보내기 실행
        </button>
      </div>
    </div>
  );
};

export default Step3Export;
