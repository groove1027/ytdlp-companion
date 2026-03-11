import React, { useCallback, useRef } from 'react';
import { useEditPointStore } from '../../../../stores/editPointStore';

/** 초 → MM:SS 포맷 */
function formatTimeSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const Step1Register: React.FC = () => {
  const sourceVideos = useEditPointStore((s) => s.sourceVideos);
  const rawEditTable = useEditPointStore((s) => s.rawEditTable);
  const rawNarration = useEditPointStore((s) => s.rawNarration);
  const totalSourceSizeMB = useEditPointStore((s) => s.totalSourceSizeMB);
  const addSourceVideos = useEditPointStore((s) => s.addSourceVideos);
  const removeSourceVideo = useEditPointStore((s) => s.removeSourceVideo);
  const setSourceId = useEditPointStore((s) => s.setSourceId);
  const setRawEditTable = useEditPointStore((s) => s.setRawEditTable);
  const setRawNarration = useEditPointStore((s) => s.setRawNarration);
  const parseEditTable = useEditPointStore((s) => s.parseEditTable);
  const isProcessing = useEditPointStore((s) => s.isProcessing);
  const processingMessage = useEditPointStore((s) => s.processingMessage);
  const analysisFrames = useEditPointStore((s) => s.analysisFrames);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await addSourceVideos(Array.from(files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addSourceVideos]);

  const formatDuration = (sec: number | null) => {
    if (sec == null) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const canProceed = sourceVideos.length > 0 && rawEditTable.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* 소스 영상 업로드 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            소스 영상
          </h3>
          <span className="text-xs text-gray-500">
            {sourceVideos.length}개 · {totalSourceSizeMB}MB
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-gray-600 hover:border-amber-500/50 rounded-lg p-6 text-center transition-colors group"
        >
          <svg className="w-8 h-8 mx-auto mb-2 text-gray-500 group-hover:text-amber-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
          <p className="text-sm text-gray-400 group-hover:text-gray-300">영상 파일 선택 (복수 가능)</p>
        </button>

        {sourceVideos.length > 0 && (
          <div className="mt-3 space-y-2">
            {sourceVideos.map((v) => (
              <div key={v.id} className="flex items-center gap-3 bg-gray-900/50 rounded-lg p-2 border border-gray-700/30">
                {v.thumbnailDataUrl ? (
                  <img src={v.thumbnailDataUrl} alt="" className="w-16 h-9 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-16 h-9 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-300 truncate">{v.fileName}</p>
                  <p className="text-[10px] text-gray-500">
                    {v.fileSizeMB}MB · {formatDuration(v.durationSec)}
                  </p>
                </div>
                <input
                  type="text"
                  value={v.sourceId}
                  onChange={(e) => setSourceId(v.id, e.target.value)}
                  className="w-16 text-xs text-center bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-amber-300 focus:border-amber-500 focus:outline-none"
                  placeholder="S-01"
                />
                <button
                  type="button"
                  onClick={() => removeSourceVideo(v.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors p-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 영상 분석실 프레임 미리보기 */}
      {analysisFrames.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              영상 분석실에서 가져온 프레임
            </h3>
            <span className="text-[10px] text-blue-300/60">{analysisFrames.length}개 프레임</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysisFrames.slice(0, 16).map((f, i) => (
              <div key={i} className="relative group">
                <img src={f.url} alt="" className="w-20 h-11 rounded object-cover border border-blue-500/20 group-hover:border-blue-400/50 transition-colors" />
                <span className="absolute bottom-0 right-0 bg-black/70 text-blue-300 text-[8px] px-1 rounded-tl font-mono">
                  {formatTimeSec(f.timeSec)}
                </span>
              </div>
            ))}
            {analysisFrames.length > 16 && (
              <div className="flex items-center justify-center w-20 h-11 rounded bg-gray-800/50 border border-gray-700/30">
                <span className="text-[10px] text-gray-500">+{analysisFrames.length - 16}</span>
              </div>
            )}
          </div>
          {sourceVideos.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-blue-400">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              소스 영상 자동 등록 완료
            </div>
          )}
        </div>
      )}

      {/* 편집표 붙여넣기 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          편집표 (EDL)
        </h3>
        <p className="text-[11px] text-gray-500 mb-2">
          엑셀/구글시트에서 복사 붙여넣기 하거나, 파이프(|)/탭/마크다운 테이블 형식으로 입력하세요.
        </p>
        <textarea
          value={rawEditTable}
          onChange={(e) => setRawEditTable(e.target.value)}
          placeholder={`순번 | 내레이션 | 소스 | 소스설명 | 배속 | 타임코드 | 비고\n1-1a | 첫 번째 내레이션... | S-01 | 해변 풍경 | 1.0 | 00:07.500~00:15.200 | 속도감 있게`}
          className="w-full h-36 bg-gray-900 border border-gray-600 rounded-lg p-3 text-xs text-gray-200 font-mono resize-y focus:border-amber-500 focus:outline-none placeholder-gray-600"
        />
      </div>

      {/* 내레이션 대본 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          내레이션 대본
          <span className="text-[10px] text-gray-500 font-normal">(선택)</span>
        </h3>
        <textarea
          value={rawNarration}
          onChange={(e) => setRawNarration(e.target.value)}
          placeholder="전체 내레이션 대본을 입력하세요. 편집표의 내레이션 텍스트와 매칭됩니다."
          className="w-full h-28 bg-gray-900 border border-gray-600 rounded-lg p-3 text-xs text-gray-200 resize-y focus:border-amber-500 focus:outline-none placeholder-gray-600"
        />
      </div>

      {/* 다음 단계 버튼 */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={parseEditTable}
          disabled={!canProceed || isProcessing}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            canProceed && !isProcessing
              ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-900/30'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isProcessing ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                <path d="M12 2a10 10 0 019.95 11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-amber-400" />
              </svg>
              {processingMessage}
            </>
          ) : (
            <>
              AI 파싱 실행
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default Step1Register;
