import React from 'react';
import { useEditPointStore } from '../../../../stores/editPointStore';

/** 신뢰도 뱃지 */
const ConfidenceBadge: React.FC<{ confidence: number }> = ({ confidence }) => {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? 'green' : pct >= 50 ? 'yellow' : 'red';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-${color}-600/20 text-${color}-300 border border-${color}-500/30`}>
      {pct}%
    </span>
  );
};

/** 타임코드 표시 (초 → MM:SS.s) */
function formatTC(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${String(m).padStart(2, '0')}:${s.padStart(4, '0')}`;
}

const Step2Mapping: React.FC = () => {
  const edlEntries = useEditPointStore((s) => s.edlEntries);
  const sourceVideos = useEditPointStore((s) => s.sourceVideos);
  const sourceMapping = useEditPointStore((s) => s.sourceMapping);
  const setSourceMapping = useEditPointStore((s) => s.setSourceMapping);
  const updateEdlEntry = useEditPointStore((s) => s.updateEdlEntry);
  const refineTimecodes = useEditPointStore((s) => s.refineTimecodes);
  const quickExportFFmpeg = useEditPointStore((s) => s.quickExportFFmpeg);
  const autoCalcSpeed = useEditPointStore((s) => s.autoCalcSpeed);
  const applyAutoSpeed = useEditPointStore((s) => s.applyAutoSpeed);
  const setStep = useEditPointStore((s) => s.setStep);
  const isProcessing = useEditPointStore((s) => s.isProcessing);
  const processingProgress = useEditPointStore((s) => s.processingProgress);
  const processingMessage = useEditPointStore((s) => s.processingMessage);

  // 매핑되지 않은 소스 확인
  const uniqueSourceIds = [...new Set(edlEntries.map((e) => e.sourceId))];
  const unmappedCount = uniqueSourceIds.filter((sid) => !sourceMapping[sid]).length;

  return (
    <div className="space-y-5">
      {/* 소스 매핑 요약 */}
      {unmappedCount > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3 text-xs text-yellow-300">
          {unmappedCount}개 소스가 매핑되지 않았습니다. 아래 드롭다운에서 소스를 연결해주세요.
        </div>
      )}

      {/* EDL 테이블 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900/60 text-gray-400 border-b border-gray-700/50">
                <th className="text-left px-3 py-2.5 font-medium">순서</th>
                <th className="text-left px-3 py-2.5 font-medium">내레이션</th>
                <th className="text-left px-3 py-2.5 font-medium">소스</th>
                <th className="text-left px-3 py-2.5 font-medium">소스 영상</th>
                <th className="text-center px-3 py-2.5 font-medium">배속</th>
                <th className="text-center px-3 py-2.5 font-medium">나레이션/클립</th>
                <th className="text-center px-3 py-2.5 font-medium">타임코드</th>
                <th className="text-center px-3 py-2.5 font-medium">보정</th>
                <th className="text-left px-3 py-2.5 font-medium">비고</th>
              </tr>
            </thead>
            <tbody>
              {edlEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-3 py-2 text-amber-300 font-mono">{entry.order}</td>
                  <td className="px-3 py-2 text-gray-300 max-w-[200px]">
                    <p className="truncate" title={entry.narrationText}>
                      {entry.narrationText || '--'}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-amber-400 font-mono text-[11px]">{entry.sourceId}</span>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={sourceMapping[entry.sourceId] || ''}
                      onChange={(e) => setSourceMapping(entry.sourceId, e.target.value)}
                      className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-[11px] text-gray-300 focus:border-amber-500 focus:outline-none w-full max-w-[140px]"
                    >
                      <option value="">-- 선택 --</option>
                      {sourceVideos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.sourceId}: {v.fileName.slice(0, 20)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <input
                        type="number"
                        value={entry.speedFactor}
                        onChange={(e) => updateEdlEntry(entry.id, { speedFactor: parseFloat(e.target.value) || 1 })}
                        min={0.1}
                        max={5}
                        step={0.1}
                        className="w-14 bg-gray-900 border border-gray-600 rounded px-1.5 py-0.5 text-center text-[11px] text-gray-300 focus:border-amber-500 focus:outline-none"
                      />
                      {entry.autoSpeedFactor != null && entry.autoSpeedFactor < 1.0 && entry.speedFactor !== entry.autoSpeedFactor && (
                        <span className="text-[9px] text-orange-400" title={`추천: ${entry.autoSpeedFactor}x`}>
                          →{entry.autoSpeedFactor}x
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-[10px]">
                    {entry.narrationDurationSec != null ? (() => {
                      const start = entry.refinedTimecodeStart ?? entry.timecodeStart;
                      const end = entry.refinedTimecodeEnd ?? entry.timecodeEnd;
                      const clipDur = end - start;
                      const narDur = entry.narrationDurationSec;
                      const overflow = narDur > clipDur;
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={overflow ? 'text-orange-400 font-bold' : 'text-green-400'}>
                            {narDur.toFixed(1)}s / {clipDur.toFixed(1)}s
                          </span>
                          {overflow && (
                            <span className="text-[9px] text-orange-300/70">
                              +{(narDur - clipDur).toFixed(1)}s 초과
                            </span>
                          )}
                        </div>
                      );
                    })() : (
                      <span className="text-gray-600">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-[10px]">
                    <span className="text-gray-400">
                      {formatTC(entry.timecodeStart)} ~ {formatTC(entry.timecodeEnd)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {entry.refinedTimecodeStart != null ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-mono text-[10px] text-green-400">
                          {formatTC(entry.refinedTimecodeStart)} ~ {formatTC(entry.refinedTimecodeEnd!)}
                        </span>
                        {entry.refinedConfidence != null && (
                          <ConfidenceBadge confidence={entry.refinedConfidence} />
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-600">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500 max-w-[120px]">
                    <p className="truncate" title={entry.note}>{entry.note || '--'}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 처리 진행률 */}
      {isProcessing && (
        <div className="bg-gray-800/50 rounded-lg border border-amber-600/20 p-4">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-4 h-4 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
              <path d="M12 2a10 10 0 019.95 11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span className="text-xs text-amber-300">{processingMessage}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-gradient-to-r from-amber-500 to-orange-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${processingProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep('register')}
          className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-all"
        >
          이전 단계
        </button>

        <div className="flex items-center gap-3 flex-wrap">
          {/* 나레이션 배속 계산 */}
          <button
            type="button"
            onClick={autoCalcSpeed}
            disabled={isProcessing || edlEntries.length === 0}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              !isProcessing && edlEntries.length > 0
                ? 'bg-orange-600/20 text-orange-300 border border-orange-500/30 hover:bg-orange-600/30'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            배속 분석
          </button>

          {/* 자동 배속이 계산된 항목이 있으면 적용 버튼 표시 */}
          {edlEntries.some((e) => e.autoSpeedFactor != null && e.autoSpeedFactor < 1.0 && e.speedFactor !== e.autoSpeedFactor) && (
            <button
              type="button"
              onClick={applyAutoSpeed}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 bg-orange-600/30 text-orange-200 border border-orange-500/40 hover:bg-orange-600/40 animate-pulse"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              슬로우 적용 ({edlEntries.filter((e) => e.autoSpeedFactor != null && e.autoSpeedFactor < 1.0 && e.speedFactor !== e.autoSpeedFactor).length}개)
            </button>
          )}

          {/* 빠른 FFmpeg 스크립트 다운로드 — Step 3 건너뛰고 즉시 내보내기 */}
          <button
            type="button"
            onClick={quickExportFFmpeg}
            disabled={isProcessing || edlEntries.length === 0}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              !isProcessing && edlEntries.length > 0
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
            title="정제 없이 편집표 기반으로 FFmpeg 스크립트를 바로 다운로드합니다"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            FFmpeg 스크립트
          </button>

          <button
            type="button"
            onClick={refineTimecodes}
            disabled={isProcessing || unmappedCount === uniqueSourceIds.length}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              !isProcessing && unmappedCount < uniqueSourceIds.length
                ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI 정제 실행
          </button>

          <button
            type="button"
            onClick={() => setStep('export')}
            disabled={isProcessing}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              !isProcessing
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-900/30'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            내보내기
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step2Mapping;
