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
  const cleanSubtitles = useEditPointStore((s) => s.cleanSubtitles);
  const setCleanSubtitles = useEditPointStore((s) => s.setCleanSubtitles);
  const runCleanSubtitles = useEditPointStore((s) => s.runCleanSubtitles);
  const isCleaning = useEditPointStore((s) => s.isCleaning);
  const cleanProgress = useEditPointStore((s) => s.cleanProgress);
  const cleanMessage = useEditPointStore((s) => s.cleanMessage);
  const sourceVideos = useEditPointStore((s) => s.sourceVideos);
  const sourceMapping = useEditPointStore((s) => s.sourceMapping);

  // 이미 정리된 영상 수 계산
  const mappedVideoIds = new Set(Object.values(sourceMapping));
  const totalMapped = sourceVideos.filter((v) => mappedVideoIds.has(v.id)).length;
  const cleanedCount = sourceVideos.filter((v) => mappedVideoIds.has(v.id) && v.cleanedBlobUrl).length;
  const allCleaned = totalMapped > 0 && cleanedCount === totalMapped;

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

      {/* AI 자막 제거 옵션 */}
      <div className={`rounded-xl border-2 transition-all ${
        cleanSubtitles
          ? 'border-cyan-500/40 bg-cyan-900/10'
          : 'border-gray-700/50 bg-gray-800/30'
      }`}>
        <button
          type="button"
          onClick={() => setCleanSubtitles(!cleanSubtitles)}
          disabled={isCleaning}
          className="w-full p-4 flex items-center gap-3 text-left"
        >
          {/* 토글 */}
          <div className={`w-10 h-6 rounded-full flex items-center transition-all shrink-0 ${
            cleanSubtitles ? 'bg-cyan-600 justify-end' : 'bg-gray-600 justify-start'
          }`}>
            <div className="w-4 h-4 rounded-full bg-white mx-1 shadow" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${cleanSubtitles ? 'text-cyan-300' : 'text-gray-300'}`}>
                AI 자막 제거 (GhostCut)
              </span>
              {allCleaned && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600/20 text-green-400 border border-green-500/30">
                  완료
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              소스 영상의 자막/워터마크를 GhostCut AI로 자동 제거한 뒤 내보냅니다.
            </p>
            <p className="text-[10px] text-amber-400/70 mt-0.5">
              영상 1개당 5~15분 소요 — {totalMapped}개 소스 기준 총 {
                totalMapped <= 1 ? '약 5~15분' :
                totalMapped <= 3 ? `약 ${totalMapped * 5}~${totalMapped * 15}분` :
                `약 ${totalMapped * 5}분 이상`
              } 예상
            </p>
          </div>
        </button>

        {/* 자막 제거 실행 영역 */}
        {cleanSubtitles && (
          <div className="px-4 pb-4 space-y-3">
            {/* 진행 상태 */}
            {isCleaning && (
              <div className="space-y-2">
                <div className="w-full bg-gray-700/40 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${cleanProgress}%` }}
                  />
                </div>
                <p className="text-[11px] text-cyan-400">{cleanMessage}</p>
              </div>
            )}

            {/* 완료 상태 */}
            {!isCleaning && cleanedCount > 0 && (
              <p className="text-[11px] text-green-400">
                {cleanedCount}/{totalMapped}개 소스 정리 완료
              </p>
            )}

            {/* 실행 버튼 */}
            {!isCleaning && !allCleaned && (
              <button
                type="button"
                onClick={runCleanSubtitles}
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                {cleanedCount > 0
                  ? `나머지 ${totalMapped - cleanedCount}개 소스 자막 제거`
                  : `${totalMapped}개 소스 영상 자막 제거 시작`
                }
              </button>
            )}
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setStep('mapping')}
          disabled={isCleaning}
          className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-all disabled:opacity-50"
        >
          이전 단계
        </button>

        <button
          type="button"
          onClick={exportResult}
          disabled={isCleaning || (cleanSubtitles && !allCleaned)}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium shadow-lg transition-all flex items-center gap-2 ${
            isCleaning || (cleanSubtitles && !allCleaned)
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-amber-900/30'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {cleanSubtitles && !allCleaned ? '자막 제거를 먼저 실행하세요' : '내보내기 실행'}
        </button>
      </div>
    </div>
  );
};

export default Step3Export;
